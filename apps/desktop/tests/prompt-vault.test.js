const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createVaultStore,
  createEmptyDatabase,
  sanitizeDatabase,
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

  const emptyDatabase = createEmptyDatabase();
  assert.equal(emptyDatabase.schemaVersion, 2);
  assert.deepEqual(emptyDatabase.debateWorkflows, []);
  assert.deepEqual(emptyDatabase.masterPlanVersions, []);
  assert.deepEqual(emptyDatabase.roadmapVersions, []);
  assert.deepEqual(emptyDatabase.taskPrompts, []);
  assert.deepEqual(emptyDatabase.taskPromptVersions, []);
  assert.deepEqual(emptyDatabase.taskRuns, []);

  const sanitizedOldDb = sanitizeDatabase({
    version: 1,
    projects: [{ id: "p1", name: "Legacy Project", path: projectPath }],
    promptPacks: [{ id: "pack_legacy", projectId: "p1", title: "Legacy Pack", chunks: [] }]
  });
  assert.equal(sanitizedOldDb.schemaVersion, 2);
  assert.equal(sanitizedOldDb.projects.length, 1);
  assert.equal(sanitizedOldDb.promptPacks.length, 1);
  assert.deepEqual(sanitizedOldDb.debateWorkflows, []);
  assert.deepEqual(sanitizedOldDb.taskRuns, []);

  const sanitizedMalformedDb = sanitizeDatabase({
    projects: {},
    promptPacks: {},
    debateWorkflows: {},
    masterPlanVersions: "bad",
    roadmapVersions: null,
    taskPrompts: 42,
    taskPromptVersions: false,
    taskRuns: "oops"
  });
  assert.deepEqual(sanitizedMalformedDb.projects, []);
  assert.deepEqual(sanitizedMalformedDb.promptPacks, []);
  assert.deepEqual(sanitizedMalformedDb.debateWorkflows, []);
  assert.deepEqual(sanitizedMalformedDb.masterPlanVersions, []);
  assert.deepEqual(sanitizedMalformedDb.roadmapVersions, []);
  assert.deepEqual(sanitizedMalformedDb.taskPrompts, []);
  assert.deepEqual(sanitizedMalformedDb.taskPromptVersions, []);
  assert.deepEqual(sanitizedMalformedDb.taskRuns, []);

  const sanitizedMissingFields = sanitizeDatabase({
    debateWorkflows: [{ id: "wf1", projectId: "p1", rounds: [{}] }],
    masterPlanVersions: [{ id: "mp1", projectId: "p1" }],
    roadmapVersions: [{ id: "rm1", projectId: "p1", items: [{}] }],
    taskPrompts: [{ id: "tp1", projectId: "p1" }],
    taskPromptVersions: [{ id: "tpv1", taskPromptId: "tp1" }],
    taskRuns: [{ id: "tr1", taskPromptId: "tp1" }]
  });
  assert.equal(sanitizedMissingFields.debateWorkflows[0].status, "ready_for_user");
  assert.equal(typeof sanitizedMissingFields.debateWorkflows[0].rounds[0].responseText, "string");
  assert.equal(sanitizedMissingFields.masterPlanVersions[0].status, "draft");
  assert.equal(sanitizedMissingFields.roadmapVersions[0].items[0].title, "Prompt 1");
  assert.equal(sanitizedMissingFields.taskPrompts[0].status, "draft");
  assert.equal(sanitizedMissingFields.taskPromptVersions[0].status, "draft");
  assert.equal(typeof sanitizedMissingFields.taskRuns[0].verificationSummary, "string");

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
  assert.equal(getTaskStatusLabel("ready"), "In Progress");
  assert.equal(getTaskStatusLabel("draft"), "In Progress");
  assert.equal(getTaskStatusLabel("approved"), "Approved");

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
  assert.ok(finalPlanResult.pack.chunks.every((chunk) => chunk.status === "in_progress"));
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
  assert.deepEqual(copiedChunk.versions, []);
  assert.deepEqual(copiedChunk.runHistory, []);

  const noteResult = store.addChunkRunHistory(result.pack.id, result.pack.chunks[0].id, {
    note: "Implemented sidebar tree and drawer shell.",
    source: "codex_run"
  });
  assert.equal(noteResult.chunk.runHistory.length, 1);
  assert.equal(noteResult.chunk.runHistory[0].note, "Implemented sidebar tree and drawer shell.");

  const improvePrompt = store.buildChunkImprovePrompt(result.pack.id, result.pack.chunks[0].id);
  assert.match(improvePrompt.prompt, /Task name:/);
  assert.match(improvePrompt.prompt, /Recent run history/);

  const versionResult = store.addChunkVersion(result.pack.id, result.pack.chunks[0].id, {
    source: "ai_improve",
    promptSnapshot: copiedChunk.prompt,
    responseText: "Improved prompt output"
  });
  assert.equal(versionResult.chunk.versions.length, 1);
  assert.equal(versionResult.chunk.versions[0].responseText, "Improved prompt output");

  const applyVersionResult = store.applyChunkVersion(
    result.pack.id,
    result.pack.chunks[0].id,
    versionResult.chunk.versions[0].id
  );
  assert.equal(applyVersionResult.chunk.prompt, "Improved prompt output");
  assert.ok(applyVersionResult.chunk.versions[0].appliedAt);

  const updatedChunkResult = store.updateChunkContent(result.pack.id, result.pack.chunks[0].id, {
    title: "Sidebar and drawer task",
    prompt: "Edited task prompt body"
  });
  assert.equal(updatedChunkResult.chunk.title, "Sidebar and drawer task");
  assert.equal(updatedChunkResult.chunk.prompt, "Edited task prompt body");
  assert.ok(updatedChunkResult.chunk.versions.length >= 2);

  const launcherData = store.getChunkLauncher(result.pack.id, result.pack.chunks[1].id);
  assert.ok(launcherData.launcher.includes("master-plan.md"));
  assert.ok(launcherData.launcher.includes("Execute only task 002 - Fix Claude send button."));
  assert.ok(launcherData.launcher.includes("Use commit message: Fix Claude send button."));
  assert.ok(launcherData.launcher.includes("Obey Git action: commit_and_push."));

  const launcherCopied = store.updateChunkStatus(result.pack.id, result.pack.chunks[1].id, "launcher_copied");
  const launcherCopiedPack = launcherCopied.state.promptPacks.find((pack) => pack.id === result.pack.id);
  assert.equal(launcherCopiedPack.chunks[1].status, "copied");
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

  const manualChunkResult = store.createManualChunk(finalPlanResult.pack.id, {
    title: "Manual follow-up task",
    prompt: "Manual prompt",
    scope: "Manual scope"
  });
  assert.equal(manualChunkResult.chunk.title, "Manual follow-up task");
  assert.equal(manualChunkResult.chunk.status, "in_progress");
  assert.ok(Number(manualChunkResult.chunk.order) > 0);

  const planningProjectPath = path.join(tmpRoot, "PlanningFlow");
  fs.mkdirSync(planningProjectPath, { recursive: true });

  const savedBrief = store.saveProjectBrief({
    projectName: "CopyPaste",
    projectPath: planningProjectPath,
    idea: "Build a controlled Codex prompt pipeline.",
    masterPlan: "Master plan v1"
  });
  assert.equal(savedBrief.project.idea, "Build a controlled Codex prompt pipeline.");
  assert.equal(savedBrief.project.masterPlan, "Master plan v1");
  assert.ok(savedBrief.project.activePromptPackId);

  const filesystemOnlyProjectPath = path.join(tmpRoot, "FilesystemOnly");
  fs.mkdirSync(path.join(filesystemOnlyProjectPath, "tasks"), { recursive: true });
  fs.writeFileSync(path.join(filesystemOnlyProjectPath, "codex.md"), "Raw idea from file", "utf8");
  fs.writeFileSync(path.join(filesystemOnlyProjectPath, "architecture.md"), "# Architecture\n\nReal architecture", "utf8");
  fs.writeFileSync(path.join(filesystemOnlyProjectPath, "masterplan.md"), "# Master Plan\n\nSaved from disk", "utf8");
  fs.writeFileSync(path.join(filesystemOnlyProjectPath, "plan-roadmap.md"), "# Plan Roadmap\n\nSaved roadmap", "utf8");
  fs.writeFileSync(path.join(filesystemOnlyProjectPath, "tasks", "task-001-existing.md"), "# Existing Task\n\nProject path\n\nGoal\n\nAcceptance Criteria\n\nVerification Commands", "utf8");
  fs.writeFileSync(path.join(filesystemOnlyProjectPath, "tasks", "task-002-corrupt.md"), "broken", "utf8");
  const filesystemStore = createVaultStore({ dbPath: path.join(tmpRoot, "filesystem-db.json") });
  filesystemStore.updateSettings({ projectsBasePath: tmpRoot });
  const filesystemState = filesystemStore.getState();
  const filesystemProject = filesystemState.projects.find((project) => project.name === "FilesystemOnly");
  assert.ok(filesystemProject, "filesystem-only project should be discovered");
  const filesystemArtifacts = filesystemState.projectArtifacts[filesystemProject.id] || [];
  assert.ok(filesystemArtifacts.find((artifact) => artifact.type === "master_plan" && artifact.existsOnDisk && artifact.status === "saved"));
  assert.ok(filesystemArtifacts.find((artifact) => artifact.type === "roadmap" && artifact.existsOnDisk && artifact.status === "saved"));
  assert.ok(filesystemArtifacts.find((artifact) => artifact.type === "task_file" && artifact.label.includes("task-001-existing") && artifact.existsOnDisk && !artifact.existsInDb));
  assert.ok(filesystemArtifacts.find((artifact) => artifact.type === "task_file" && artifact.label.includes("task-002-corrupt") && artifact.status === "corrupt"));

  const createdWorkflow = store.createDebateWorkflow(savedBrief.project.id);
  assert.equal(createdWorkflow.workflow.projectId, savedBrief.project.id);
  assert.equal(createdWorkflow.workflow.currentStageId, "gpt_clarifier");
  assert.equal(createdWorkflow.workflow.status, "ready_for_user");
  assert.deepEqual(createdWorkflow.workflow.rounds, []);

  const activeWorkflow = store.getActiveDebateWorkflow(savedBrief.project.id);
  assert.equal(activeWorkflow.workflow.id, createdWorkflow.workflow.id);

  const savedRound = store.saveDebateRound(createdWorkflow.workflow.id, {
    stageId: "gpt_clarifier",
    provider: "chatgpt",
    role: "clarifier",
    promptText: "Clarify idea",
    responseText: "Clarified response"
  });
  assert.equal(savedRound.round.stageId, "gpt_clarifier");
  assert.equal(savedRound.round.provider, "chatgpt");
  assert.equal(savedRound.workflow.rounds.length, 1);

  const advancedOne = store.advanceDebateWorkflow(createdWorkflow.workflow.id);
  assert.equal(advancedOne.workflow.currentStageId, "gpt_planner");
  assert.equal(advancedOne.workflow.status, "ready_for_user");

  let advancedWorkflow = advancedOne.workflow;
  for (let step = 0; step < 6; step += 1) {
    advancedWorkflow = store.advanceDebateWorkflow(createdWorkflow.workflow.id).workflow;
  }
  assert.equal(advancedWorkflow.status, "complete");
  assert.ok(advancedWorkflow.completedAt);

  const afterCompleteActive = store.getActiveDebateWorkflow(savedBrief.project.id);
  assert.equal(afterCompleteActive.workflow, null);

  const manualWorkflow = store.createDebateWorkflow(savedBrief.project.id).workflow;
  const manuallyCompleted = store.completeDebateWorkflow(manualWorkflow.id);
  assert.equal(manuallyCompleted.workflow.status, "complete");

  const reloadedStore = createVaultStore({ dbPath });
  const reloadedWorkflow = reloadedStore.getDebateWorkflow(createdWorkflow.workflow.id);
  assert.equal(reloadedWorkflow.workflow.rounds.length, 1);
  assert.equal(reloadedWorkflow.workflow.status, "complete");

  const finalSynthesisWorkflow = store.createDebateWorkflow(savedBrief.project.id).workflow;
  store.saveDebateRound(finalSynthesisWorkflow.id, {
    stageId: "gpt_final_synthesis",
    provider: "chatgpt",
    role: "synthesis",
    promptText: "Synthesize final master plan",
    responseText: "Master plan debate final synthesis"
  });
  store.completeDebateWorkflow(finalSynthesisWorkflow.id);
  const finalSynthesisState = store.getDebateWorkflow(finalSynthesisWorkflow.id);
  const finalRound = finalSynthesisState.workflow.rounds[0];
  const fromDebateVersion = store.createMasterPlanVersionFromDebate(finalSynthesisWorkflow.id, finalRound.id);
  assert.equal(fromDebateVersion.version.sourceWorkflowId, finalSynthesisWorkflow.id);
  assert.equal(fromDebateVersion.version.sourceRoundId, finalRound.id);
  assert.equal(fromDebateVersion.version.responseText, "Master plan debate final synthesis");
  assert.equal(fromDebateVersion.version.status, "draft");

  const masterVersion = store.addMasterPlanVersion(savedBrief.project.id, {
    source: "ai_improve",
    promptSnapshot: "Improve master plan",
    responseText: "Master plan v2"
  });
  assert.equal(masterVersion.version.responseText, "Master plan v2");
  assert.ok(masterVersion.project.masterPlanVersions.length >= 1);

  const appliedMaster = store.applyMasterPlanVersion(savedBrief.project.id, masterVersion.version.id);
  assert.equal(appliedMaster.project.masterPlan, "Master plan v2");
  assert.equal(appliedMaster.project.activeMasterPlanVersionId, masterVersion.version.id);
  assert.ok(appliedMaster.project.masterPlanVersions[0].appliedAt);
  assert.equal(fs.readFileSync(path.join(planningProjectPath, "masterplan.md"), "utf8"), "Master plan v2");
  assert.equal(appliedMaster.project.stage, "Roadmap");
  assert.equal(appliedMaster.project.nextAction, "Generate Roadmap");

  const prepRoadmap = store.prepareRoadmapGeneration(savedBrief.project.id);
  assert.equal(prepRoadmap.activeMasterPlan, "Master plan v2");

  const roadmapItems = [{
    id: "roadmap_1",
    order: 1,
    title: "Architecture and data model",
    goal: "Define storage and migration model.",
    whyThisExists: "Everything depends on clean storage semantics.",
    targetFiles: ["apps/desktop/prompt-vault.js"],
    researchNeeded: ["Inspect existing prompt vault schema."],
    acceptanceCriteria: ["Legacy prompt packs still load."],
    verificationCommands: ["npm.cmd run desktop:test"],
    dependsOn: [],
    parallelGroup: ""
  }, {
    id: "roadmap_2",
    order: 2,
    title: "Prompt UI",
    goal: "Build prompt workspace.",
    whyThisExists: "Users edit one prompt at a time.",
    targetFiles: ["apps/desktop/index.html", "apps/desktop/renderer.js"],
    researchNeeded: [],
    acceptanceCriteria: ["AI Debate tab is not visible."],
    verificationCommands: ["npm.cmd run desktop:test"],
    dependsOn: ["roadmap_1"],
    parallelGroup: ""
  }, {
    id: "roadmap_3",
    order: 3,
    title: "Docs and tests",
    goal: "Document and verify behavior.",
    whyThisExists: "The workflow must stay maintainable.",
    targetFiles: ["architecture.md", "codex.md"],
    researchNeeded: [],
    acceptanceCriteria: ["Verification passes."],
    verificationCommands: ["npm.cmd run verify"],
    dependsOn: ["roadmap_1"],
    parallelGroup: "A"
  }];

  const roadmapVersion = store.addRoadmapVersion(savedBrief.project.activePromptPackId, {
    source: "ai_roadmap",
    responseText: JSON.stringify({ items: roadmapItems })
  });
  assert.equal(roadmapVersion.version.responseText.includes("Architecture and data model"), true);

  const appliedRoadmap = store.applyRoadmapVersion(savedBrief.project.activePromptPackId, roadmapVersion.version.id);
  assert.equal(appliedRoadmap.pack.roadmap.items.length, 3);
  assert.equal(appliedRoadmap.pack.roadmap.items[2].parallelGroup, "A");
  assert.equal(appliedRoadmap.project.activeRoadmapVersionId, roadmapVersion.version.id);
  assert.equal(appliedRoadmap.project.stage, "Tasks");
  assert.equal(appliedRoadmap.project.nextAction, "Create Task Details");
  const roadmapFile = fs.readFileSync(path.join(planningProjectPath, "plan-roadmap.md"), "utf8");
  assert.match(roadmapFile, /# Plan Roadmap/);
  assert.match(roadmapFile, /## 001\. Architecture and data model/);
  assert.match(roadmapFile, /Dependencies: none/);
  assert.match(roadmapFile, /Parallel group: A/);

  fs.writeFileSync(path.join(planningProjectPath, "plan-roadmap.md"), "# Plan Roadmap\n\n", "utf8");
  store.getState();
  const backfilledRoadmapFile = fs.readFileSync(path.join(planningProjectPath, "plan-roadmap.md"), "utf8");
  assert.match(backfilledRoadmapFile, /## 001\. Architecture and data model/);

  const eligibleBefore = store.getRoadmapEligibility(savedBrief.project.activePromptPackId);
  assert.deepEqual(eligibleBefore.items.map((item) => ({ id: item.id, eligible: item.eligible, blocked: item.blockedBy })), [
    { id: "roadmap_1", eligible: true, blocked: [] },
    { id: "roadmap_2", eligible: false, blocked: ["roadmap_1"] },
    { id: "roadmap_3", eligible: false, blocked: ["roadmap_1"] }
  ]);

  const startedPrompt = store.startRoadmapPrompt(savedBrief.project.activePromptPackId, "roadmap_1");
  assert.equal(startedPrompt.chunk.title, "Architecture and data model");
  assert.equal(startedPrompt.chunk.status, "in_progress");
  assert.equal(startedPrompt.chunk.roadmapItemId, "roadmap_1");
  assert.match(startedPrompt.chunk.prompt, /Define storage and migration model/);
  assert.equal(startedPrompt.project.stage, "Codex");
  assert.equal(startedPrompt.project.nextAction, "Copy Codex Handoff");

  assert.throws(
    () => store.startRoadmapPrompt(savedBrief.project.activePromptPackId, "roadmap_2"),
    /blocked by dependencies/
  );

  const approvedPrompt = store.approvePrompt(startedPrompt.pack.id, startedPrompt.chunk.id);
  assert.equal(approvedPrompt.chunk.status, "approved");

  const copiedPrompt = store.copyPromptToCodex(startedPrompt.pack.id, startedPrompt.chunk.id);
  assert.equal(copiedPrompt.chunk.status, "copied");
  assert.ok(copiedPrompt.chunk.copiedAt);
  assert.match(copiedPrompt.handoffPrompt, /Project path:/);
  assert.match(copiedPrompt.handoffPrompt, /Verification commands/);

  assert.throws(
    () => store.markPromptDone(startedPrompt.pack.id, startedPrompt.chunk.id, { note: "" }),
    /Run history note is required/
  );

  const donePrompt = store.markPromptDone(startedPrompt.pack.id, startedPrompt.chunk.id, {
    note: "Implemented storage model.",
    source: "codex_run"
  });
  assert.equal(donePrompt.chunk.status, "done");
  assert.equal(donePrompt.chunk.runHistory[0].note, "Implemented storage model.");

  const eligibleAfter = store.getRoadmapEligibility(savedBrief.project.activePromptPackId);
  const availableAfter = eligibleAfter.items.filter((item) => item.eligible).map((item) => item.id);
  assert.deepEqual(availableAfter, ["roadmap_2", "roadmap_3"]);

  const taskPromptCreated = store.createTaskPromptFromRoadmapItem(savedBrief.project.id, "roadmap_2");
  assert.equal(taskPromptCreated.taskPrompt.roadmapItemId, "roadmap_2");
  assert.equal(taskPromptCreated.taskPrompt.status, "draft");
  const stateAfterTaskPromptCreate = store.getState();
  const packAfterTaskPromptCreate = stateAfterTaskPromptCreate.promptPacks.find((pack) => pack.id === taskPromptCreated.pack.id);
  assert.ok(packAfterTaskPromptCreate.chunks.some((chunk) => chunk.id === taskPromptCreated.taskPrompt.sourceChunkId));
  assert.match(taskPromptCreated.taskPrompt.content, /Project name:/);
  assert.match(taskPromptCreated.taskPrompt.content, /Project path:/);
  assert.match(taskPromptCreated.taskPrompt.content, /Master plan file path:/);
  assert.match(taskPromptCreated.taskPrompt.content, /## Dependencies/);
  assert.match(taskPromptCreated.taskPrompt.content, /## Git Rules/);
  assert.match(taskPromptCreated.taskPrompt.content, /Strict scope: only this task/);
  assert.ok(fs.existsSync(taskPromptCreated.taskPrompt.taskFilePath));

  const stableTaskFileName = taskPromptCreated.taskPrompt.taskFileName;
  store.updateTaskPromptContent(taskPromptCreated.taskPrompt.id, {
    content: "Updated prompt body"
  });
  const improvePromptPayload = store.prepareTaskImprovePrompt(taskPromptCreated.taskPrompt.id);
  assert.match(improvePromptPayload.prompt, /Return only improved prompt/);
  const proposedImproveVersion = store.saveTaskImproveResponse(taskPromptCreated.taskPrompt.id, "Improved by AI");
  assert.equal(proposedImproveVersion.version.source, "ai_improve");
  const versionList = store.listTaskPromptVersions(taskPromptCreated.taskPrompt.id);
  assert.equal(versionList.versions[0].id, proposedImproveVersion.version.id);
  const appliedVersion = store.applyTaskPromptVersion(taskPromptCreated.taskPrompt.id, proposedImproveVersion.version.id);
  assert.equal(appliedVersion.taskPrompt.content, "Improved by AI");
  const approvedTaskPrompt = store.approveTaskPrompt(taskPromptCreated.taskPrompt.id);
  assert.equal(approvedTaskPrompt.taskPrompt.status, "approved");
  const copiedTaskPrompt = store.copyCodexHandoff(taskPromptCreated.taskPrompt.id);
  assert.equal(copiedTaskPrompt.taskPrompt.status, "copied");
  assert.match(copiedTaskPrompt.handoffText, /Full task prompt/);
  const completedTaskPrompt = store.markTaskPromptDone(taskPromptCreated.taskPrompt.id, {
    note: "Done roadmap item 2",
    result: "ok",
    commitHash: "abc123",
    verificationSummary: "verify ok"
  });
  assert.equal(completedTaskPrompt.taskPrompt.status, "done");

  const reloadedState = store.getState();
  const syncedTaskPrompt = reloadedState.taskPrompts.find((entry) => entry.id === taskPromptCreated.taskPrompt.id);
  assert.equal(syncedTaskPrompt.taskFileName, stableTaskFileName);
  assert.equal(fs.readFileSync(syncedTaskPrompt.taskFilePath, "utf8"), "Improved by AI");

  const settingsResult = store.updateSettings({ projectsBasePath: path.join(tmpRoot, "Tasks") });
  assert.equal(settingsResult.state.projectsBasePath, path.join(tmpRoot, "Tasks"));
  const customBaseProject = store.saveProject({
    name: "Proiectul pulii",
    git: { remote: "origin", defaultBranch: "master", branchPrefix: "codex/" },
    defaults: { gitMode: "final_only", chunkStrategy: "simple_3", chunkCount: 3, commitMessage: "Custom base" }
  });
  assert.equal(customBaseProject.project.path, path.join(tmpRoot, "Tasks", "Proiectul pulii"));
  assert.ok(fs.existsSync(path.join(tmpRoot, "Tasks", "Proiectul pulii", "tasks")));
  const secondProject = store.saveProject({
    name: "Alt Proiect",
    git: { remote: "origin", defaultBranch: "master", branchPrefix: "codex/" },
    defaults: { gitMode: "final_only", chunkStrategy: "simple_3", chunkCount: 3, commitMessage: "Second" }
  });
  const stateWithAllProjects = store.getState();
  assert.ok(stateWithAllProjects.projects.some((project) => project.id === customBaseProject.project.id));
  assert.ok(stateWithAllProjects.projects.some((project) => project.id === secondProject.project.id));
  assert.ok(stateWithAllProjects.projects.some((project) => project.path === projectPath));

  const deleteTaskResult = store.deleteTask(startedPrompt.pack.id, startedPrompt.chunk.id);
  assert.equal(deleteTaskResult.deletedTask.id, startedPrompt.chunk.id);
  assert.ok(!deleteTaskResult.state.promptPacks
    .find((pack) => pack.id === startedPrompt.pack.id)
    .chunks.some((chunk) => chunk.id === startedPrompt.chunk.id));

  const deleteProjectResult = store.deleteProject(customBaseProject.project.id);
  assert.equal(deleteProjectResult.deletedProject.id, customBaseProject.project.id);
  assert.ok(!deleteProjectResult.state.projects.some((project) => project.id === customBaseProject.project.id));
  assert.ok(deleteProjectResult.state.deletedProjectPaths.includes(customBaseProject.project.path.toLowerCase()));
  assert.ok(fs.existsSync(customBaseProject.project.path));

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
  assert.equal(oldLauncher.chunk.status, "in_progress");
  assert.deepEqual(oldLauncher.chunk.versions, []);
  assert.deepEqual(oldLauncher.chunk.runHistory, []);

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
