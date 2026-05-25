const fs = require("node:fs");
const path = require("node:path");

const DB_VERSION = 1;
const DEFAULT_CHUNK_COUNT = 3;
const DEFAULT_CHUNK_STRATEGY = "simple_3";
const DEFAULT_GIT_MODE = "every_chunk";
const VALID_GIT_MODES = new Set(["none", "final_only", "every_chunk"]);
const VALID_CHUNK_STATUSES = new Set(["draft", "ready", "copied", "launcher_copied", "in_progress", "done"]);
const VALID_CHUNK_STRATEGIES = new Set(["simple_3", "steps_1_3", "architecture_implementation_tests_release"]);

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createTimestamp() {
  return new Date().toISOString();
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const backupPath = `${filePath}.corrupt-${Date.now()}.bak`;

    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.tmp`;

  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function createEmptyDatabase() {
  const timestamp = createTimestamp();

  return {
    version: DB_VERSION,
    projects: [],
    promptPacks: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function normalizeString(value) {
  return String(value || "").trim();
}

function slugify(value) {
  const slug = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "prompt-pack";
}

function normalizeWindowsPath(value) {
  return normalizeString(value).replace(/^"|"$/g, "");
}

function sanitizeGitMode(value) {
  return VALID_GIT_MODES.has(value) ? value : DEFAULT_GIT_MODE;
}

function sanitizeChunkStrategy(value) {
  return VALID_CHUNK_STRATEGIES.has(value) ? value : DEFAULT_CHUNK_STRATEGY;
}

function sanitizeChunkCount(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CHUNK_COUNT;
  }

  return Math.min(8, Math.max(2, parsed));
}

function sanitizeDatabase(rawDatabase) {
  const fallback = createEmptyDatabase();
  const source = rawDatabase && typeof rawDatabase === "object" ? rawDatabase : fallback;
  const projects = Array.isArray(source.projects) ? source.projects : [];
  const promptPacks = Array.isArray(source.promptPacks) ? source.promptPacks : [];

  return {
    version: DB_VERSION,
    projects: projects.map((project) => ({
      id: normalizeString(project.id) || createId("project"),
      name: normalizeString(project.name) || "Untitled Project",
      path: normalizeWindowsPath(project.path),
      git: {
        enabled: project.git ? project.git.enabled !== false : true,
        remote: normalizeString(project.git && project.git.remote) || "origin",
        defaultBranch: normalizeString(project.git && project.git.defaultBranch) || "main",
        branchPrefix: normalizeString(project.git && project.git.branchPrefix) || "codex/"
      },
      defaults: {
        gitMode: sanitizeGitMode(project.defaults && project.defaults.gitMode),
        chunkStrategy: sanitizeChunkStrategy(project.defaults && project.defaults.chunkStrategy),
        chunkCount: sanitizeChunkCount(project.defaults && project.defaults.chunkCount),
        commitMessage: normalizeString(project.defaults && project.defaults.commitMessage) || "Implement Codex execution pack"
      },
      createdAt: normalizeString(project.createdAt) || createTimestamp(),
      updatedAt: normalizeString(project.updatedAt) || createTimestamp()
    })),
    promptPacks: promptPacks.map((pack) => ({
      id: normalizeString(pack.id) || createId("pack"),
      projectId: normalizeString(pack.projectId),
      title: normalizeString(pack.title) || "Untitled Prompt Pack",
      slug: normalizeString(pack.slug) || slugify(pack.title),
      sourceText: String(pack.sourceText || ""),
      sourceTasks: Array.isArray(pack.sourceTasks) ? pack.sourceTasks.map(normalizeString).filter(Boolean) : [],
      gitMode: sanitizeGitMode(pack.gitMode),
      chunkStrategy: sanitizeChunkStrategy(pack.chunkStrategy),
      branchName: normalizeString(pack.branchName),
      commitMessage: normalizeString(pack.commitMessage),
      exportPath: normalizeWindowsPath(pack.exportPath),
      chunks: Array.isArray(pack.chunks) ? pack.chunks.map(sanitizeChunk) : [],
      createdAt: normalizeString(pack.createdAt) || createTimestamp(),
      updatedAt: normalizeString(pack.updatedAt) || createTimestamp()
    })),
    createdAt: normalizeString(source.createdAt) || fallback.createdAt,
    updatedAt: normalizeString(source.updatedAt) || fallback.updatedAt
  };
}

function sanitizeChunk(chunk) {
  const status = normalizeString(chunk.status);
  const title = normalizeString(chunk.title) || "Codex Task";

  return {
    id: normalizeString(chunk.id) || createId("chunk"),
    order: Number.isFinite(Number(chunk.order)) ? Number(chunk.order) : 1,
    title,
    filename: normalizeString(chunk.filename) || "codex-prompt.md",
    scope: normalizeString(chunk.scope),
    tasks: Array.isArray(chunk.tasks) ? chunk.tasks.map(normalizeString).filter(Boolean) : [],
    gitAction: normalizeString(chunk.gitAction) || "none",
    commitMessage: normalizeString(chunk.commitMessage) || title,
    status: VALID_CHUNK_STATUSES.has(status) ? status : "ready",
    prompt: String(chunk.prompt || ""),
    launcher: String(chunk.launcher || ""),
    createdAt: normalizeString(chunk.createdAt) || createTimestamp(),
    copiedAt: normalizeString(chunk.copiedAt),
    launcherCopiedAt: normalizeString(chunk.launcherCopiedAt)
  };
}

function getProjectBranch(project, packSlug, explicitBranchName) {
  if (normalizeString(explicitBranchName)) {
    return normalizeString(explicitBranchName);
  }

  const prefix = normalizeString(project.git && project.git.branchPrefix) || "codex/";
  return `${prefix}${packSlug}`;
}

function extractImplementationTasks(sourceText) {
  const lines = String(sourceText || "").split(/\r?\n/);
  const tasks = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:[-*]\s+|\d+[.)]\s+|#{2,6}\s+)(.+)$/);

    if (match && match[1] && match[1].trim().length >= 8) {
      tasks.push(match[1].trim());
    }
  }

  if (tasks.length) {
    return tasks.slice(0, 36);
  }

  return [];
}

function tryParseFinalPlanJson(sourceText) {
  const text = String(sourceText || "").trim();

  if (!text) {
    return null;
  }

  const candidates = [text];
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch && fencedMatch[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try the next reasonable JSON boundary.
    }
  }

  return null;
}

function normalizeTaskList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return normalizeString(item);
        }

        if (item && typeof item === "object") {
          return normalizeString(item.title || item.name || item.description || item.goal || item.task);
        }

        return "";
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => normalizeString(line).replace(/^(?:[-*]\s+|\d+[.)]\s+)/, ""))
      .filter(Boolean);
  }

  return [];
}

function extractFinalPlanTasks(sourceText) {
  const parsed = tryParseFinalPlanJson(sourceText);

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const stages = Array.isArray(parsed.implementation_stages)
    ? parsed.implementation_stages
    : Array.isArray(parsed.stages)
      ? parsed.stages
      : Array.isArray(parsed.tasks)
        ? parsed.tasks
        : [];

  return stages
    .map((stage, index) => {
      if (typeof stage === "string") {
        const title = normalizeString(stage);

        return {
          title,
          scope: createTaskDescription(title, toCommitStyleTaskName(title)),
          tasks: [title]
        };
      }

      if (!stage || typeof stage !== "object") {
        return null;
      }

      const rawTitle = normalizeString(stage.title || stage.name || stage.goal || stage.objective || `Implementation stage ${index + 1}`);
      const description = normalizeString(stage.description || stage.summary || stage.goal || stage.objective || stage.scope);
      const taskLines = [
        ...normalizeTaskList(stage.tasks),
        ...normalizeTaskList(stage.steps),
        ...normalizeTaskList(stage.scope),
        ...normalizeTaskList(stage.acceptance_criteria),
        ...normalizeTaskList(stage.acceptanceCriteria)
      ];
      const title = rawTitle || (taskLines[0] || `Implementation stage ${index + 1}`);
      const scope = description || createTaskDescription(taskLines[0] || title, toCommitStyleTaskName(title));
      const tasks = taskLines.length ? taskLines : [scope];

      return {
        title,
        scope,
        tasks
      };
    })
    .filter((task) => task && normalizeString(task.title));
}

function fallbackTasks(sourceText) {
  const extracted = extractImplementationTasks(sourceText);

  if (extracted.length) {
    return extracted;
  }

  return [
    "Define implementation plan",
    "Implement core workflow",
    "Verify and release changes"
  ];
}

function normalizeTitleWord(word, index) {
  const knownWords = new Map([
    ["ai", "AI"],
    ["api", "API"],
    ["chatgpt", "ChatGPT"],
    ["claude", "Claude"],
    ["codex", "Codex"],
    ["copy", "Copy"],
    ["copypaste", "CopyPaste"],
    ["git", "Git"],
    ["ui", "UI"]
  ]);
  const normalized = word.toLowerCase();

  if (knownWords.has(normalized)) {
    return knownWords.get(normalized);
  }

  if (index === 0) {
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  return normalized;
}

function toCommitStyleTaskName(value) {
  let text = normalizeString(value)
    .replace(/[`*_#>]/g, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/[.:;!?]+$/g, "")
    .replace(/\s+/g, " ");

  text = text
    .replace(/^(.+?)\s+so\s+.+$/i, "$1")
    .replace(/^(.+?)\s+and\s+(?:persist|add|update|improve|commit|push)\b.+$/i, "$1")
    .replace(/\bthe\s+/gi, "")
    .replace(/\bgeneration settings\b/gi, "")
    .replace(/\bsettings\b$/i, "")
    .replace(/\bfor Claude output\b/i, "")
    .trim();

  text = text.replace(/\bImprove response extraction\b/i, "Improve Claude response extraction");

  const words = text.split(/\s+/).filter(Boolean).slice(0, 5);
  const title = words.map(normalizeTitleWord).join(" ").trim();

  return title || "Implement core workflow";
}

function createTaskDescription(task, title) {
  const cleanTask = normalizeString(task).replace(/[.:;!?]+$/g, "");

  if (!cleanTask || cleanTask === title) {
    return `Execute ${title.toLowerCase()} with focused implementation and verification.`;
  }

  return cleanTask;
}

function splitTasksIntoGroups(tasks, groupSize) {
  const groups = [];

  for (let index = 0; index < tasks.length; index += groupSize) {
    groups.push(tasks.slice(index, index + groupSize));
  }

  return groups.length ? groups : [[]];
}

function createCodexLauncher({ project, pack, chunk }) {
  return [
    `Read ${path.join(pack.exportPath, "master-plan.md")} first.`,
    `Read ${path.join(project.path, "architecture.md")}.`,
    `Read ${path.join(project.path, "codex.md")}.`,
    `Execute only task ${String(chunk.order).padStart(3, "0")} - ${chunk.title}.`,
    `Use commit message: ${chunk.commitMessage || chunk.title}.`,
    `Obey Git action: ${chunk.gitAction}.`
  ].join("\n");
}

function createMasterPlanContent({ project, pack, chunks }) {
  const sourceTasks = pack.sourceTasks && pack.sourceTasks.length ? pack.sourceTasks : fallbackTasks(pack.sourceText);
  const taskList = sourceTasks
    .map((task, index) => `- ${index + 1}. ${task}`)
    .join("\n");
  const chunkList = chunks
    .map((chunk) => `- ${String(chunk.order).padStart(3, "0")}: ${chunk.title} - Git action: ${chunk.gitAction} - Commit: ${chunk.commitMessage || chunk.title}`)
    .join("\n");

  return `# ${pack.title} Master Plan

## Project

- Name: ${project.name}
- Path: ${project.path}
- Pack: ${pack.title}
- Branch: ${pack.branchName}
- Git mode: ${pack.gitMode}
- Chunk strategy: ${pack.chunkStrategy}

## Source Brief

${pack.sourceText}

## Parsed Implementation Tasks

${taskList}

## Codex Execution Tasks

${chunkList}

## Shared Rules For Every Codex Chat

- Read this file first before executing any task.
- Read \`architecture.md\` and \`codex.md\` in the project root before changing files.
- Preserve unrelated user changes. Do not use destructive git commands.
- Keep implementation scoped to the active task.
- Update \`codex.md\` with concrete progress after each task.
- Update \`architecture.md\` when the system shape, file responsibilities, runtime flow, or dependencies change.
- Run relevant tests before marking a task done.
- If a task has \`Git action: none\`, do not commit or push.
- If a task has \`Git action: commit_and_push\`, commit local changes and push online to the configured remote.
`;
}

function getChunkScope(index, totalChunks) {
  if (index === 0) {
    return "Create or refine architecture, project setup, data model, and safety boundaries. Keep this chunk focused on foundations and clear contracts.";
  }

  if (index === totalChunks - 1) {
    return "Finish the remaining implementation, harden tests, update documentation, run verification, and perform the configured git release action.";
  }

  const start = index * 3 + 1;
  const end = start + 2;
  return `Implement execution steps ${start}-${end} from the master plan. Keep the chat context small by working only on these steps.`;
}

function getChunkTitle(index, totalChunks) {
  if (index === 0) {
    return "Architecture and setup";
  }

  if (index === totalChunks - 1) {
    return "Final hardening, docs, commit, and push";
  }

  const start = index * 3 + 1;
  const end = start + 2;
  return `Implementation steps ${start}-${end}`;
}

function getGitAction(gitMode, index, totalChunks) {
  if (gitMode === "every_chunk") {
    return "commit_and_push";
  }

  if (gitMode === "final_only" && index === totalChunks - 1) {
    return "commit_and_push";
  }

  return "none";
}

function createStrategyChunks({ sourceText, strategy, chunkCount }) {
  const finalPlanTasks = extractFinalPlanTasks(sourceText);

  if (finalPlanTasks.length) {
    return finalPlanTasks.map((task) => {
      const title = toCommitStyleTaskName(task.title);

      return {
        title,
        scope: task.scope || createTaskDescription(task.title, title),
        tasks: task.tasks && task.tasks.length ? task.tasks : [task.scope || task.title]
      };
    });
  }

  return fallbackTasks(sourceText).map((task) => {
    const title = toCommitStyleTaskName(task);

    return {
      title,
      scope: createTaskDescription(task, title),
      tasks: [task]
    };
  });
}

function formatTaskList(tasks) {
  if (!tasks || !tasks.length) {
    return "- No explicit task lines were detected; derive concrete steps from the source brief and this task scope.";
  }

  return tasks.map((task, index) => `- ${index + 1}. ${task}`).join("\n");
}

function createChunkPrompt({ project, pack, chunk, masterPlanFilename }) {
  return `# ${chunk.title}

You are Codex working inside this local project:

\`\`\`text
${project.path}
\`\`\`

## Required Reading

1. Read \`${path.join(project.path, "architecture.md")}\`.
2. Read \`${path.join(project.path, "codex.md")}\`.
3. Read \`${path.join(pack.exportPath, masterPlanFilename)}\`.

## Active Task

- Pack: ${pack.title}
- Task: ${String(chunk.order).padStart(3, "0")} - ${chunk.title}
- Scope: ${chunk.scope}
- Git action: ${chunk.gitAction}

## Relevant Master Tasks For This Task

${formatTaskList(chunk.tasks)}

## Source Brief Location

Read the full source brief in \`${path.join(pack.exportPath, "final-text.md")}\`. Do not duplicate unrelated work from other tasks.

## Execution Instructions

- Implement only the scope of this task.
- Make concrete code changes instead of only describing solutions.
- Preserve user changes and unrelated dirty work.
- Do not use destructive git commands such as \`git reset --hard\` or \`git checkout --\`.
- Update \`codex.md\` with what changed and what was verified.
- Update \`architecture.md\` if file responsibilities, runtime flow, data model, or dependencies changed.
- Run the relevant project tests or syntax checks.
- Report exact verification commands and results.

## Git Rules

- Work branch: ${pack.branchName}
- Remote: ${project.git.remote}
- Commit message: ${chunk.commitMessage || chunk.title}
- Git action for this task: ${chunk.gitAction}

If Git action is \`none\`:

- Do not commit.
- Do not push.
- End by reporting changed files and verification.

If Git action is \`commit_and_push\`:

- Run \`git status -sb\`.
- Stage only files changed for this task.
- Commit with the configured commit message.
- Push the branch online to \`${project.git.remote}\`.
- Report branch name, commit hash, and push result.

## Completion Criteria

- The task scope is complete.
- Documentation is updated.
- Verification ran.
- Git action was followed exactly.
`;
}

function createPromptChunks({ project, pack, chunkCount }) {
  const strategyChunks = createStrategyChunks({
    sourceText: pack.sourceText,
    strategy: pack.chunkStrategy,
    chunkCount
  });
  const totalChunks = strategyChunks.length;

  return strategyChunks.map((strategyChunk, index) => {
    const order = index + 1;
    const gitAction = getGitAction(pack.gitMode, index, totalChunks);
    const chunk = {
      id: createId("chunk"),
      order,
      title: strategyChunk.title,
      filename: `codex-${String(order).padStart(3, "0")}-${slugify(strategyChunk.title)}.md`,
      scope: strategyChunk.scope,
      tasks: strategyChunk.tasks,
      gitAction,
      commitMessage: strategyChunk.title,
      status: "ready",
      prompt: "",
      launcher: "",
      createdAt: createTimestamp(),
      copiedAt: "",
      launcherCopiedAt: ""
    };

    chunk.prompt = createChunkPrompt({
      project,
      pack,
      chunk,
      masterPlanFilename: "master-plan.md"
    });
    chunk.launcher = createCodexLauncher({ project, pack, chunk });

    return chunk;
  });
}

function createVaultStore({ dbPath }) {
  if (!dbPath) {
    throw new Error("prompt vault dbPath is required.");
  }

  function readDatabase() {
    return sanitizeDatabase(readJsonFile(dbPath, createEmptyDatabase()));
  }

  function writeDatabase(database) {
    const sanitized = sanitizeDatabase(database);
    sanitized.updatedAt = createTimestamp();
    writeJsonFile(dbPath, sanitized);
    return sanitized;
  }

  function getState() {
    return readDatabase();
  }

  function saveProject(input) {
    const database = readDatabase();
    const projectName = normalizeString(input && input.name);
    const projectPath = normalizeWindowsPath(input && input.path);

    if (!projectName) {
      throw new Error("Project name is required.");
    }

    if (!projectPath) {
      throw new Error("Project path is required.");
    }

    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      throw new Error("Project path must point to an existing directory.");
    }

    const timestamp = createTimestamp();
    const existing = database.projects.find((project) => project.id === input.id || project.path.toLowerCase() === projectPath.toLowerCase());
    const project = {
      id: existing ? existing.id : createId("project"),
      name: projectName,
      path: projectPath,
      git: {
        enabled: true,
        remote: normalizeString(input.git && input.git.remote) || "origin",
        defaultBranch: normalizeString(input.git && input.git.defaultBranch) || "main",
        branchPrefix: normalizeString(input.git && input.git.branchPrefix) || "codex/"
      },
      defaults: {
        gitMode: sanitizeGitMode(input.defaults && input.defaults.gitMode),
        chunkStrategy: sanitizeChunkStrategy(input.defaults && input.defaults.chunkStrategy),
        chunkCount: sanitizeChunkCount(input.defaults && input.defaults.chunkCount),
        commitMessage: normalizeString(input.defaults && input.defaults.commitMessage) || "Implement Codex execution pack"
      },
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp
    };

    if (existing) {
      const index = database.projects.findIndex((item) => item.id === existing.id);
      database.projects[index] = project;
    } else {
      database.projects.push(project);
    }

    return {
      project,
      state: writeDatabase(database)
    };
  }

  function generatePromptPack(input) {
    const saved = saveProject({
      id: input.projectId,
      name: input.projectName,
      path: input.projectPath,
      git: input.git || {},
      defaults: {
        gitMode: input.gitMode,
        chunkStrategy: input.chunkStrategy,
        chunkCount: input.chunkCount,
        commitMessage: input.commitMessage
      }
    });
    const database = saved.state;
    const project = saved.project;
    const sourceText = String(input.sourceText || "").trim();
    const title = normalizeString(input.title) || "Codex Execution Pack";
    const packSlug = slugify(title);
    const exportPath = path.join(project.path, "codex-plans", packSlug);

    if (!sourceText) {
      throw new Error("Cannot generate a prompt pack from empty final text.");
    }

    const timestamp = createTimestamp();
    const pack = {
      id: createId("pack"),
      projectId: project.id,
      title,
      slug: packSlug,
      sourceText,
      sourceTasks: fallbackTasks(sourceText),
      gitMode: sanitizeGitMode(input.gitMode || project.defaults.gitMode),
      chunkStrategy: sanitizeChunkStrategy(input.chunkStrategy || project.defaults.chunkStrategy),
      branchName: getProjectBranch(project, packSlug, input.branchName),
      commitMessage: normalizeString(input.commitMessage) || project.defaults.commitMessage || `Implement ${title}`,
      exportPath,
      chunks: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    pack.chunks = createPromptChunks({
      project,
      pack,
      chunkCount: input.chunkCount || project.defaults.chunkCount
    });

    ensureDirectory(exportPath);
    const masterPlan = createMasterPlanContent({
      project,
      pack,
      chunks: pack.chunks
    });

    fs.writeFileSync(path.join(exportPath, "master-plan.md"), masterPlan, "utf8");
    fs.writeFileSync(path.join(exportPath, "final-text.md"), sourceText, "utf8");

    pack.chunks.forEach((chunk) => {
      fs.writeFileSync(path.join(exportPath, chunk.filename), chunk.prompt, "utf8");
      fs.writeFileSync(path.join(exportPath, chunk.filename.replace(/\.md$/, "-launcher.txt")), chunk.launcher, "utf8");
    });

    fs.writeFileSync(path.join(exportPath, "metadata.json"), JSON.stringify({
      project,
      pack: {
        id: pack.id,
        title: pack.title,
        slug: pack.slug,
        gitMode: pack.gitMode,
        chunkStrategy: pack.chunkStrategy,
        branchName: pack.branchName,
        commitMessage: pack.commitMessage,
        exportPath: pack.exportPath,
        sourceTasks: pack.sourceTasks,
        chunks: pack.chunks.map((chunk) => ({
          id: chunk.id,
          order: chunk.order,
          title: chunk.title,
          filename: chunk.filename,
          tasks: chunk.tasks,
          gitAction: chunk.gitAction,
          commitMessage: chunk.commitMessage,
          status: chunk.status,
          launcher: chunk.launcher
        }))
      }
    }, null, 2), "utf8");

    database.promptPacks.unshift(pack);

    return {
      project,
      pack,
      state: writeDatabase(database)
    };
  }

  function updateChunkStatus(packId, chunkId, status) {
    if (!VALID_CHUNK_STATUSES.has(status)) {
      throw new Error("Invalid chunk status.");
    }

    const database = readDatabase();
    const pack = database.promptPacks.find((item) => item.id === packId);

    if (!pack) {
      throw new Error("Prompt pack not found.");
    }

    const chunk = pack.chunks.find((item) => item.id === chunkId);

    if (!chunk) {
      throw new Error("Prompt chunk not found.");
    }

    chunk.status = status;
    chunk.copiedAt = status === "copied" ? createTimestamp() : chunk.copiedAt;
    chunk.launcherCopiedAt = status === "launcher_copied" ? createTimestamp() : chunk.launcherCopiedAt;
    pack.updatedAt = createTimestamp();

    return {
      chunk,
      state: writeDatabase(database)
    };
  }

  function getChunkPrompt(packId, chunkId) {
    const database = readDatabase();
    const pack = database.promptPacks.find((item) => item.id === packId);

    if (!pack) {
      throw new Error("Prompt pack not found.");
    }

    const chunk = pack.chunks.find((item) => item.id === chunkId);

    if (!chunk) {
      throw new Error("Prompt chunk not found.");
    }

    return {
      pack,
      chunk,
      prompt: chunk.prompt
    };
  }

  function getChunkLauncher(packId, chunkId) {
    const database = readDatabase();
    const pack = database.promptPacks.find((item) => item.id === packId);

    if (!pack) {
      throw new Error("Prompt pack not found.");
    }

    const project = database.projects.find((item) => item.id === pack.projectId);
    const chunk = pack.chunks.find((item) => item.id === chunkId);

    if (!project) {
      throw new Error("Project not found for prompt pack.");
    }

    if (!chunk) {
      throw new Error("Prompt chunk not found.");
    }

    return {
      pack,
      chunk,
      launcher: chunk.launcher || createCodexLauncher({ project, pack, chunk })
    };
  }

  function deletePromptPack(packId) {
    const database = readDatabase();
    const index = database.promptPacks.findIndex((item) => item.id === packId);

    if (index === -1) {
      throw new Error("Prompt pack not found.");
    }

    const deletedPack = database.promptPacks[index];
    database.promptPacks.splice(index, 1);

    return {
      deletedPack,
      state: writeDatabase(database)
    };
  }

  return {
    getState,
    saveProject,
    generatePromptPack,
    updateChunkStatus,
    getChunkPrompt,
    getChunkLauncher,
    deletePromptPack
  };
}

module.exports = {
  createVaultStore,
  createEmptyDatabase,
  sanitizeDatabase,
  slugify,
  extractFinalPlanTasks,
  extractImplementationTasks,
  toCommitStyleTaskName
};
