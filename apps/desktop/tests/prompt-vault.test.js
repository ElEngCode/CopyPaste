const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createVaultStore,
  extractFinalPlanTasks,
  extractImplementationTasks,
  slugify,
  toCommitStyleTaskName
} = require("../prompt-vault");
globalThis.NextStepAiProjectBuilderProtocol = require("../../../packages/protocol");
const { getTaskStatusLabel } = require("../renderer");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "next-step-prompt-vault-"));

try {
  const projectPath = path.join(tmpRoot, "CopyPaste");
  const dbPath = path.join(tmpRoot, "prompt-vault-db.json");
  const store = createVaultStore({ dbPath });

  fs.mkdirSync(projectPath, { recursive: true });

  assert.equal(slugify("CopyPaste Codex Execution Pack!"), "copypaste-codex-execution-pack");
  assert.deepEqual(extractImplementationTasks("1. Build project selector\n2. Add launcher copy\n3. Push online"), [
    "Build project selector",
    "Add launcher copy",
    "Push online"
  ]);
  assert.equal(toCommitStyleTaskName("Fix the Claude send button so it reliably submits messages"), "Fix Claude send button");
  assert.equal(toCommitStyleTaskName("Add project selector and persist project defaults"), "Add project selector");
  assert.equal(toCommitStyleTaskName("Improve response extraction for Claude output"), "Improve Claude response extraction");
  assert.equal(toCommitStyleTaskName("Reparam voice generation settings"), "Reparam voice");
  assert.equal(getTaskStatusLabel("launcher_copied"), "Copied");

  const finalPlanText = JSON.stringify({
    project_name: "AI Project Builder",
    implementation_stages: [
      {
        title: "Persist debate state",
        description: "Store project ideas, stage progress, and debate rounds.",
        acceptance_criteria: ["Existing prompt packs still load.", "Round records include provider and timestamps."]
      },
      {
        title: "Wire gated stage sending",
        description: "Send only the current stage prompt when the user clicks next.",
        acceptance_criteria: ["No infinite loop is introduced.", "Provider target follows the debate protocol."]
      },
      {
        title: "Polish project builder UI",
        description: "Show task-focused prompts without filenames in the main view.",
        acceptance_criteria: ["Copy Codex Start is the primary action.", "Older prompt sets stay under collapsed history."]
      }
    ]
  }, null, 2);
  const finalPlanTasks = extractFinalPlanTasks(finalPlanText);

  assert.deepEqual(finalPlanTasks.map((task) => task.title), [
    "Persist debate state",
    "Wire gated stage sending",
    "Polish project builder UI"
  ]);
  assert.ok(finalPlanTasks[0].scope.includes("Store project ideas"));
  assert.ok(finalPlanTasks[0].tasks.includes("Existing prompt packs still load."));

  const result = store.generatePromptPack({
    projectName: "CopyPaste",
    projectPath,
    title: "CopyPaste Codex Execution Pack",
    sourceText: [
      "1. Reparam voice generation settings.",
      "2. Fix the Claude send button so it reliably submits messages.",
      "3. Improve response extraction for Claude output."
    ].join("\n"),
    chunkStrategy: "steps_1_3",
    chunkCount: 3,
    gitMode: "",
    branchName: "",
    commitMessage: "",
    git: {
      remote: "origin",
      defaultBranch: "master",
      branchPrefix: "codex/"
    }
  });

  assert.equal(result.project.name, "CopyPaste");
  assert.equal(result.project.defaults.chunkStrategy, "steps_1_3");
  assert.equal(result.pack.chunkStrategy, "steps_1_3");
  assert.equal(result.pack.gitMode, "every_chunk");
  assert.equal(result.pack.chunks.length, 3);
  assert.equal(result.pack.chunks[0].title, "Reparam voice");
  assert.equal(result.pack.chunks[1].title, "Fix Claude send button");
  assert.equal(result.pack.chunks[2].title, "Improve Claude response extraction");
  assert.equal(result.pack.chunks[0].commitMessage, "Reparam voice");
  assert.equal(result.pack.chunks[1].commitMessage, "Fix Claude send button");
  assert.equal(result.pack.chunks[2].commitMessage, "Improve Claude response extraction");
  assert.ok(result.pack.chunks.every((chunk) => chunk.gitAction === "commit_and_push"));
  assert.equal(result.pack.branchName, "codex/copypaste-codex-execution-pack");
  assert.ok(fs.existsSync(path.join(result.pack.exportPath, "master-plan.md")));
  assert.ok(fs.existsSync(path.join(result.pack.exportPath, "final-text.md")));
  assert.ok(fs.existsSync(path.join(result.pack.exportPath, "metadata.json")));

  const finalPlanResult = store.generatePromptPack({
    projectName: "CopyPaste",
    projectPath,
    title: "AI Project Builder Final Plan",
    sourceText: finalPlanText,
    git: {
      remote: "origin",
      defaultBranch: "master",
      branchPrefix: "codex/"
    }
  });

  assert.deepEqual(finalPlanResult.pack.chunks.map((chunk) => chunk.order), [1, 2, 3]);
  assert.deepEqual(finalPlanResult.pack.chunks.map((chunk) => chunk.title), [
    "Persist debate state",
    "Wire gated stage sending",
    "Polish project builder UI"
  ]);
  assert.ok(finalPlanResult.pack.chunks.every((chunk) => chunk.status === "ready"));
  assert.ok(finalPlanResult.pack.chunks.every((chunk) => chunk.gitAction === "commit_and_push"));
  assert.ok(finalPlanResult.pack.chunks.every((chunk) => chunk.commitMessage === chunk.title));
  assert.ok(finalPlanResult.pack.chunks[0].scope.includes("Store project ideas"));
  assert.ok(finalPlanResult.pack.chunks[1].tasks.includes("No infinite loop is introduced."));
  assert.ok(finalPlanResult.pack.chunks[2].launcher.includes("Execute only task 003 - Polish project builder UI."));

  for (const chunk of result.pack.chunks) {
    const promptPath = path.join(result.pack.exportPath, chunk.filename);
    const launcherPath = path.join(result.pack.exportPath, chunk.filename.replace(/\.md$/, "-launcher.txt"));
    const prompt = fs.readFileSync(promptPath, "utf8");
    const launcher = fs.readFileSync(launcherPath, "utf8");

    assert.ok(prompt.includes("Relevant Master Tasks For This Task"));
    assert.ok(prompt.includes("You are Codex working inside this local project"));
    assert.ok(prompt.includes(`Git action: ${chunk.gitAction}`));
    assert.ok(prompt.includes(`Commit message: ${chunk.commitMessage}`));
    assert.ok(prompt.includes("Do not use destructive git commands"));
    assert.ok(launcher.includes("master-plan.md"));
    assert.ok(launcher.includes(`Execute only task ${String(chunk.order).padStart(3, "0")} - ${chunk.title}.`));
    assert.ok(launcher.includes(`Use commit message: ${chunk.commitMessage}.`));
    assert.ok(launcher.includes(`Obey Git action: ${chunk.gitAction}`));
  }

  const copied = store.updateChunkStatus(result.pack.id, result.pack.chunks[0].id, "copied");
  const copiedPack = copied.state.promptPacks.find((pack) => pack.id === result.pack.id);
  const copiedChunk = copiedPack.chunks[0];

  assert.equal(copiedChunk.status, "copied");
  assert.ok(copiedChunk.copiedAt);

  const launcherData = store.getChunkLauncher(result.pack.id, result.pack.chunks[1].id);
  assert.ok(launcherData.launcher.includes("master-plan.md"));
  assert.ok(launcherData.launcher.includes("Execute only task 002 - Fix Claude send button."));
  assert.ok(launcherData.launcher.includes("Use commit message: Fix Claude send button."));
  assert.ok(launcherData.launcher.includes("Obey Git action: commit_and_push."));

  const launcherCopied = store.updateChunkStatus(result.pack.id, result.pack.chunks[1].id, "launcher_copied");
  const launcherCopiedPack = launcherCopied.state.promptPacks.find((pack) => pack.id === result.pack.id);
  assert.equal(launcherCopiedPack.chunks[1].status, "launcher_copied");
  assert.ok(launcherCopiedPack.chunks[1].launcherCopiedAt);

  const promptData = store.getChunkPrompt(result.pack.id, result.pack.chunks[1].id);

  assert.equal(promptData.chunk.gitAction, "commit_and_push");
  assert.equal(promptData.chunk.commitMessage, "Fix Claude send button");
  assert.ok(promptData.prompt.includes("Push the branch online"));

  const fallbackResult = store.generatePromptPack({
    projectName: "CopyPaste",
    projectPath,
    title: "Fallback Pack",
    sourceText: "This is a short brief without a clear implementation task list.",
    git: {
      remote: "origin",
      defaultBranch: "master",
      branchPrefix: "codex/"
    }
  });

  assert.deepEqual(fallbackResult.pack.chunks.map((chunk) => chunk.title), [
    "Define implementation plan",
    "Implement core workflow",
    "Verify and release changes"
  ]);
  assert.ok(fallbackResult.pack.chunks.every((chunk) => chunk.gitAction === "commit_and_push"));
  assert.ok(fallbackResult.pack.chunks.every((chunk) => chunk.commitMessage === chunk.title));

  const oldDbPath = path.join(tmpRoot, "old-db.json");
  fs.writeFileSync(oldDbPath, JSON.stringify({
    version: 1,
    projects: [{
      id: "project_old",
      name: "CopyPaste",
      path: projectPath,
      git: { remote: "origin", defaultBranch: "master", branchPrefix: "codex/" },
      defaults: { gitMode: "final_only", chunkStrategy: "simple_3", chunkCount: 3, commitMessage: "Old pack commit" }
    }],
    promptPacks: [{
      id: "pack_old",
      projectId: "project_old",
      title: "Old Pack",
      slug: "old-pack",
      sourceText: "Old source",
      gitMode: "final_only",
      chunkStrategy: "simple_3",
      branchName: "codex/old-pack",
      commitMessage: "Old pack commit",
      exportPath: path.join(projectPath, "codex-plans", "old-pack"),
      chunks: [{
        id: "chunk_old",
        order: 1,
        title: "Old generated chunk",
        filename: "codex-001-old-generated-chunk.md",
        scope: "Old scope",
        tasks: ["Old task"],
        gitAction: "commit_and_push",
        status: "ready",
        prompt: "Old prompt",
        launcher: ""
      }]
    }]
  }), "utf8");

  const oldDatabase = createVaultStore({ dbPath: oldDbPath });
  const oldLauncher = oldDatabase.getChunkLauncher("pack_old", "chunk_old");
  assert.equal(oldLauncher.chunk.commitMessage, "Old generated chunk");
  assert.ok(oldLauncher.launcher.includes("Execute only task 001 - Old generated chunk."));
  assert.ok(oldLauncher.launcher.includes("Use commit message: Old generated chunk."));

  const deleteResult = store.deletePromptPack(result.pack.id);
  assert.equal(deleteResult.deletedPack.id, result.pack.id);
  assert.ok(!deleteResult.state.promptPacks.some((pack) => pack.id === result.pack.id));
  assert.ok(fs.existsSync(result.pack.exportPath));
  assert.throws(
    () => store.deletePromptPack("missing-pack"),
    /Prompt pack not found/
  );
} finally {
  fs.rmSync(tmpRoot, {
    recursive: true,
    force: true
  });
}
