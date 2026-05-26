const fs = require("node:fs");
const path = require("node:path");
const projectBuilderProtocol = globalThis.NextStepAiProjectBuilderProtocol || require("../../packages/protocol");

const DB_VERSION = 1;
const DB_SCHEMA_VERSION = 2;
const DEFAULT_PROJECTS_BASE_PATH = "F:\\Projects\\CopyPaste\\Projects";
const DEFAULT_CHUNK_COUNT = 3;
const DEFAULT_CHUNK_STRATEGY = "simple_3";
const DEFAULT_GIT_MODE = "every_chunk";
const VALID_GIT_MODES = new Set(["none", "final_only", "every_chunk"]);
const VALID_CHUNK_STATUSES = new Set(["draft", "ready", "approved", "copied", "launcher_copied", "in_progress", "done"]);
const VALID_CHUNK_STRATEGIES = new Set(["simple_3", "steps_1_3", "architecture_implementation_tests_release"]);
const PLANNING_DEBATE_STAGES = [
  "gpt_clarifier",
  "gpt_planner",
  "claude_critic",
  "gpt_rebuttal",
  "gpt_revised_plan",
  "claude_final_review",
  "gpt_final_synthesis"
];

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createTimestamp() {
  return new Date().toISOString();
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function ensureFileIfMissing(filePath, content = "") {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf8");
  }
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
    schemaVersion: DB_SCHEMA_VERSION,
    projectsBasePath: DEFAULT_PROJECTS_BASE_PATH,
    projects: [],
    debateWorkflows: [],
    masterPlanVersions: [],
    roadmapVersions: [],
    taskPrompts: [],
    taskPromptVersions: [],
    taskRuns: [],
    promptPacks: [],
    deletedProjectPaths: [],
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

function getProjectFolderName(value) {
  const folderName = normalizeString(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .trim();

  return folderName || "Project";
}

function normalizeWindowsPath(value) {
  return normalizeString(value).replace(/^"|"$/g, "");
}

function getProjectPaths(projectPath) {
  return {
    codex: path.join(projectPath, "codex.md"),
    architecture: path.join(projectPath, "architecture.md"),
    masterplan: path.join(projectPath, "masterplan.md"),
    roadmap: path.join(projectPath, "plan-roadmap.md"),
    tasksDir: path.join(projectPath, "tasks")
  };
}

function ensureProjectScaffold(projectPath) {
  ensureDirectory(projectPath);
  const paths = getProjectPaths(projectPath);
  ensureDirectory(paths.tasksDir);
  ensureFileIfMissing(paths.codex, "# Codex\n\n");
  ensureFileIfMissing(paths.architecture, "# Architecture\n\n");
  ensureFileIfMissing(paths.masterplan, "# Master Plan\n\n");
  ensureFileIfMissing(paths.roadmap, "# Plan Roadmap\n\n");
}

function readTextIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    return String(fs.readFileSync(filePath, "utf8") || "");
  } catch (_error) {
    return "";
  }
}

function listTaskFiles(tasksDir) {
  try {
    if (!fs.existsSync(tasksDir)) return [];
    return fs.readdirSync(tasksDir)
      .filter((name) => /^task-\d{3}-.*\.md$/i.test(name))
      .sort((a, b) => a.localeCompare(b, "en"));
  } catch (_error) {
    return [];
  }
}

function isMasterPlanScaffold(text) {
  const normalized = String(text || "").trim();
  return !normalized || /^#\s*master plan\s*$/i.test(normalized);
}

function isRoadmapScaffold(text) {
  const normalized = String(text || "").trim();
  return !normalized || /^#\s*plan roadmap\s*$/i.test(normalized);
}

function getProjectStage(projectPath) {
  const paths = getProjectPaths(projectPath);
  const idea = readTextIfExists(paths.codex).trim();
  const masterPlan = readTextIfExists(paths.masterplan).trim();
  const roadmap = readTextIfExists(paths.roadmap).trim();
  const taskFiles = listTaskFiles(paths.tasksDir);
  if (!idea) return { stage: "Idea", nextAction: "Capture project idea" };
  if (isMasterPlanScaffold(masterPlan)) return { stage: "Master Plan", nextAction: "Create Master Plan" };
  if (isRoadmapScaffold(roadmap)) return { stage: "Roadmap", nextAction: "Generate Roadmap" };
  if (!taskFiles.length) return { stage: "Tasks", nextAction: "Create Task Details" };
  return { stage: "Codex", nextAction: "Copy Codex Handoff" };
}

function formatMarkdownList(items, fallback) {
  const values = Array.isArray(items) ? items.map((item) => normalizeString(item)).filter(Boolean) : [];
  return values.length ? values.map((item) => `- ${item}`) : [`- ${fallback}`];
}

function serializeRoadmapToMarkdown(roadmap) {
  const items = roadmap && Array.isArray(roadmap.items) ? roadmap.items : [];
  const lines = ["# Plan Roadmap", ""];

  items
    .slice()
    .sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0))
    .forEach((item, index) => {
      const order = Number(item.order) || index + 1;
      const title = normalizeString(item.title) || `Roadmap Task ${order}`;
      const dependsOn = Array.isArray(item.dependsOn) && item.dependsOn.length ? item.dependsOn.join(", ") : "none";
      const parallelGroup = normalizeString(item.parallelGroup) || "none";
      lines.push(`## ${String(order).padStart(3, "0")}. ${title}`);
      lines.push("");
      lines.push(`Goal: ${normalizeString(item.goal) || title}`);
      lines.push(`Why: ${normalizeString(item.why) || "This task implements one focused part of the master plan."}`);
      lines.push(`Dependencies: ${dependsOn}`);
      lines.push(`Parallel group: ${parallelGroup}`);
      lines.push("");
      lines.push("Target files:");
      lines.push(...formatMarkdownList(item.targetFiles, "Inspect the relevant project files before editing."));
      lines.push("");
      lines.push("Research needed:");
      lines.push(...formatMarkdownList(item.researchNeeded, "Use the local codebase as the source of truth."));
      lines.push("");
      lines.push("Acceptance criteria:");
      lines.push(...formatMarkdownList(item.acceptanceCriteria, "The requested behavior is implemented and verified."));
      lines.push("");
      lines.push("Verification commands:");
      lines.push(...formatMarkdownList(item.verificationCommands, "npm.cmd run desktop:test"));
      lines.push("");
    });

  return `${lines.join("\n").trim()}\n`;
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

function normalizeChunkStatus(value) {
  const status = normalizeString(value);
  if (status === "ready" || status === "draft") return "in_progress";
  if (status === "launcher_copied") return "copied";
  if (status === "approved" || status === "copied" || status === "done" || status === "in_progress") return status;
  return "in_progress";
}

function sanitizeVersionList(items, defaultSource) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: normalizeString(item && item.id) || createId("version"),
    source: normalizeString(item && item.source) || defaultSource || "manual",
    promptSnapshot: String(item && item.promptSnapshot || ""),
    responseText: String(item && item.responseText || ""),
    createdAt: normalizeString(item && item.createdAt) || createTimestamp(),
    appliedAt: normalizeString(item && item.appliedAt)
  }));
}

function sanitizeRoadmapItem(item, index) {
  const order = Number.isFinite(Number(item && item.order)) ? Number(item.order) : index + 1;
  const title = normalizeString(item && item.title) || `Prompt ${order}`;
  return {
    id: normalizeString(item && item.id) || `roadmap_${order}`,
    order,
    title,
    goal: normalizeString(item && item.goal),
    why: normalizeString(item && item.why) || normalizeString(item && item.whyThisExists),
    targetFiles: Array.isArray(item && item.targetFiles) ? item.targetFiles.map(normalizeString).filter(Boolean) : [],
    researchNeeded: Array.isArray(item && item.researchNeeded) ? item.researchNeeded.map(normalizeString).filter(Boolean) : [],
    acceptanceCriteria: Array.isArray(item && item.acceptanceCriteria) ? item.acceptanceCriteria.map(normalizeString).filter(Boolean) : [],
    verificationCommands: Array.isArray(item && item.verificationCommands) ? item.verificationCommands.map(normalizeString).filter(Boolean) : [],
    dependsOn: Array.isArray(item && item.dependsOn) ? item.dependsOn.map(normalizeString).filter(Boolean) : [],
    parallelGroup: normalizeString(item && item.parallelGroup)
  };
}

function sanitizeRoadmap(roadmap) {
  const source = roadmap && typeof roadmap === "object" ? roadmap : {};
  const items = Array.isArray(source.items) ? source.items : [];
  return {
    items: items.map(sanitizeRoadmapItem).sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
  };
}

function sanitizeDebateRound(round) {
  const source = round && typeof round === "object" ? round : {};
  return {
    id: normalizeString(source.id) || createId("debate_round"),
    workflowId: normalizeString(source.workflowId),
    stageId: normalizeString(source.stageId),
    provider: normalizeString(source.provider),
    role: normalizeString(source.role),
    promptText: String(source.promptText || ""),
    responseText: String(source.responseText || ""),
    createdAt: normalizeString(source.createdAt) || createTimestamp(),
    updatedAt: normalizeString(source.updatedAt) || createTimestamp()
  };
}

function sanitizeDebateWorkflow(workflow) {
  const source = workflow && typeof workflow === "object" ? workflow : {};
  return {
    id: normalizeString(source.id) || createId("debate_workflow"),
    projectId: normalizeString(source.projectId),
    status: normalizeString(source.status) || "ready_for_user",
    currentStageId: normalizeString(source.currentStageId),
    rounds: Array.isArray(source.rounds) ? source.rounds.map(sanitizeDebateRound) : [],
    createdAt: normalizeString(source.createdAt) || createTimestamp(),
    updatedAt: normalizeString(source.updatedAt) || createTimestamp(),
    completedAt: normalizeString(source.completedAt)
  };
}

function sanitizeMasterPlanVersion(version) {
  const source = version && typeof version === "object" ? version : {};
  return {
    id: normalizeString(source.id) || createId("master_plan_version"),
    projectId: normalizeString(source.projectId),
    sourceWorkflowId: normalizeString(source.sourceWorkflowId),
    sourceRoundId: normalizeString(source.sourceRoundId),
    source: normalizeString(source.source) || "manual",
    content: String(source.content || source.responseText || ""),
    status: normalizeString(source.status) || "draft",
    createdAt: normalizeString(source.createdAt) || createTimestamp(),
    updatedAt: normalizeString(source.updatedAt) || createTimestamp(),
    appliedAt: normalizeString(source.appliedAt),
    archivedAt: normalizeString(source.archivedAt)
  };
}

function sanitizeRoadmapVersion(version) {
  const source = version && typeof version === "object" ? version : {};
  const items = Array.isArray(source.items)
    ? source.items
    : source.roadmap && Array.isArray(source.roadmap.items)
      ? source.roadmap.items
      : [];
  return {
    id: normalizeString(source.id) || createId("roadmap_version"),
    projectId: normalizeString(source.projectId),
    source: normalizeString(source.source) || "manual",
    status: normalizeString(source.status) || "draft",
    items: items.map(sanitizeRoadmapItem),
    responseText: String(source.responseText || ""),
    createdAt: normalizeString(source.createdAt) || createTimestamp(),
    updatedAt: normalizeString(source.updatedAt) || createTimestamp(),
    appliedAt: normalizeString(source.appliedAt),
    archivedAt: normalizeString(source.archivedAt)
  };
}

function sanitizeTaskPrompt(prompt) {
  const source = prompt && typeof prompt === "object" ? prompt : {};
  return {
    id: normalizeString(source.id) || createId("task_prompt"),
    projectId: normalizeString(source.projectId),
    roadmapItemId: normalizeString(source.roadmapItemId),
    title: normalizeString(source.title) || "Task Prompt",
    content: String(source.content || source.prompt || ""),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 1,
    taskFileName: normalizeString(source.taskFileName),
    taskFilePath: normalizeWindowsPath(source.taskFilePath),
    sourceChunkId: normalizeString(source.sourceChunkId),
    status: normalizeString(source.status) || "draft",
    activeVersionId: normalizeString(source.activeVersionId),
    createdAt: normalizeString(source.createdAt) || createTimestamp(),
    updatedAt: normalizeString(source.updatedAt) || createTimestamp(),
    approvedAt: normalizeString(source.approvedAt),
    copiedAt: normalizeString(source.copiedAt),
    doneAt: normalizeString(source.doneAt)
  };
}

function sanitizeTaskPromptVersion(version) {
  const source = version && typeof version === "object" ? version : {};
  return {
    id: normalizeString(source.id) || createId("task_prompt_version"),
    taskPromptId: normalizeString(source.taskPromptId),
    source: normalizeString(source.source) || "manual",
    content: String(source.content || source.responseText || ""),
    status: normalizeString(source.status) || "draft",
    createdAt: normalizeString(source.createdAt) || createTimestamp(),
    updatedAt: normalizeString(source.updatedAt) || createTimestamp(),
    appliedAt: normalizeString(source.appliedAt)
  };
}

function sanitizeTaskRun(run) {
  const source = run && typeof run === "object" ? run : {};
  return {
    id: normalizeString(source.id) || createId("task_run"),
    taskPromptId: normalizeString(source.taskPromptId),
    note: String(source.note || ""),
    result: String(source.result || ""),
    commitHash: normalizeString(source.commitHash),
    verificationSummary: String(source.verificationSummary || ""),
    createdAt: normalizeString(source.createdAt) || createTimestamp()
  };
}

function sanitizeDatabase(rawDatabase) {
  const fallback = createEmptyDatabase();
  const source = rawDatabase && typeof rawDatabase === "object" ? rawDatabase : fallback;
  const projects = Array.isArray(source.projects) ? source.projects : [];
  const promptPacks = Array.isArray(source.promptPacks) ? source.promptPacks : [];

  return {
    version: DB_VERSION,
    schemaVersion: DB_SCHEMA_VERSION,
    projectsBasePath: normalizeWindowsPath(source.projectsBasePath) || DEFAULT_PROJECTS_BASE_PATH,
    deletedProjectPaths: Array.isArray(source.deletedProjectPaths)
      ? source.deletedProjectPaths.map((item) => normalizeWindowsPath(item).toLowerCase()).filter(Boolean)
      : [],
    projects: projects.map((project) => ({
      id: normalizeString(project.id) || createId("project"),
      name: normalizeString(project.name) || "Untitled Project",
      path: normalizeWindowsPath(project.path),
      idea: String(project.idea || ""),
      masterPlan: String(project.masterPlan || ""),
      masterPlanVersions: sanitizeVersionList(project.masterPlanVersions, "master_plan"),
      activeMasterPlanVersionId: normalizeString(project.activeMasterPlanVersionId),
      activeRoadmapVersionId: normalizeString(project.activeRoadmapVersionId),
      activePromptPackId: normalizeString(project.activePromptPackId),
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
      updatedAt: normalizeString(project.updatedAt) || createTimestamp(),
      stage: normalizeString(project.stage),
      nextAction: normalizeString(project.nextAction)
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
      roadmap: sanitizeRoadmap(pack.roadmap),
      roadmapVersions: sanitizeVersionList(pack.roadmapVersions, "roadmap"),
      activePromptId: normalizeString(pack.activePromptId),
      legacy: Boolean(pack.legacy),
      chunks: Array.isArray(pack.chunks) ? pack.chunks.map(sanitizeChunk) : [],
      createdAt: normalizeString(pack.createdAt) || createTimestamp(),
      updatedAt: normalizeString(pack.updatedAt) || createTimestamp()
    })),
    debateWorkflows: Array.isArray(source.debateWorkflows) ? source.debateWorkflows.map(sanitizeDebateWorkflow) : [],
    masterPlanVersions: Array.isArray(source.masterPlanVersions) ? source.masterPlanVersions.map(sanitizeMasterPlanVersion) : [],
    roadmapVersions: Array.isArray(source.roadmapVersions) ? source.roadmapVersions.map(sanitizeRoadmapVersion) : [],
    taskPrompts: Array.isArray(source.taskPrompts) ? source.taskPrompts.map(sanitizeTaskPrompt) : [],
    taskPromptVersions: Array.isArray(source.taskPromptVersions) ? source.taskPromptVersions.map(sanitizeTaskPromptVersion) : [],
    taskRuns: Array.isArray(source.taskRuns) ? source.taskRuns.map(sanitizeTaskRun) : [],
    createdAt: normalizeString(source.createdAt) || fallback.createdAt,
    updatedAt: normalizeString(source.updatedAt) || fallback.updatedAt
  };
}

function sanitizeChunk(chunk) {
  const title = normalizeString(chunk.title) || "Codex Task";
  const runHistory = Array.isArray(chunk.runHistory) ? chunk.runHistory : [];

  return {
    id: normalizeString(chunk.id) || createId("chunk"),
    order: Number.isFinite(Number(chunk.order)) ? Number(chunk.order) : 1,
    title,
    filename: normalizeString(chunk.filename) || "codex-prompt.md",
    scope: normalizeString(chunk.scope),
    tasks: Array.isArray(chunk.tasks) ? chunk.tasks.map(normalizeString).filter(Boolean) : [],
    gitAction: normalizeString(chunk.gitAction) || "none",
    commitMessage: normalizeString(chunk.commitMessage) || title,
    status: normalizeChunkStatus(chunk.status),
    prompt: String(chunk.prompt || ""),
    launcher: String(chunk.launcher || ""),
    roadmapItemId: normalizeString(chunk.roadmapItemId),
    dependsOnChunkIds: Array.isArray(chunk.dependsOnChunkIds) ? chunk.dependsOnChunkIds.map(normalizeString).filter(Boolean) : [],
    parallelGroup: normalizeString(chunk.parallelGroup),
    versions: sanitizeVersionList(chunk.versions, "manual"),
    runHistory: runHistory.map((item) => ({
      id: normalizeString(item && item.id) || createId("run"),
      note: String(item && item.note || ""),
      source: normalizeString(item && item.source) || "manual",
      createdAt: normalizeString(item && item.createdAt) || createTimestamp()
    })),
    createdAt: normalizeString(chunk.createdAt) || createTimestamp(),
    copiedAt: normalizeString(chunk.copiedAt),
    launcherCopiedAt: normalizeString(chunk.launcherCopiedAt)
  };
}

function getPackById(database, packId) {
  const pack = database.promptPacks.find((item) => item.id === packId);
  if (!pack) {
    throw new Error("Prompt pack not found.");
  }
  return pack;
}

function getChunkById(pack, chunkId) {
  const chunk = pack.chunks.find((item) => item.id === chunkId);
  if (!chunk) {
    throw new Error("Prompt chunk not found.");
  }
  return chunk;
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
      status: "in_progress",
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

  function refreshProjectProgress(project) {
    if (!project || !project.path) {
      return project;
    }
    const stageInfo = getProjectStage(project.path);
    project.stage = stageInfo.stage;
    project.nextAction = stageInfo.nextAction;
    project.updatedAt = createTimestamp();
    return project;
  }

  function writeMasterPlanFile(project, text) {
    ensureProjectScaffold(project.path);
    const projectFiles = getProjectPaths(project.path);
    fs.writeFileSync(projectFiles.masterplan, String(text || ""), "utf8");
    refreshProjectProgress(project);
  }

  function writeRoadmapFile(project, roadmap) {
    ensureProjectScaffold(project.path);
    const projectFiles = getProjectPaths(project.path);
    fs.writeFileSync(projectFiles.roadmap, serializeRoadmapToMarkdown(roadmap), "utf8");
    refreshProjectProgress(project);
  }

  function getActivePackForProject(database, project) {
    if (!project) {
      return null;
    }
    if (project.activePromptPackId) {
      const activePack = database.promptPacks.find((pack) => pack.id === project.activePromptPackId);
      if (activePack) {
        return activePack;
      }
    }
    return database.promptPacks
      .filter((pack) => pack.projectId === project.id)
      .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))[0] || null;
  }

  function syncProjectFilesFromDatabase(database) {
    for (const project of database.projects) {
      if (!project || !project.path) {
        continue;
      }
      ensureProjectScaffold(project.path);
      const projectFiles = getProjectPaths(project.path);
      const masterPlan = String(project.masterPlan || "");
      if (masterPlan.trim() && readTextIfExists(projectFiles.masterplan) !== masterPlan) {
        fs.writeFileSync(projectFiles.masterplan, masterPlan, "utf8");
      }

      const activePack = getActivePackForProject(database, project);
      const hasRoadmap = Boolean(activePack && activePack.roadmap && Array.isArray(activePack.roadmap.items) && activePack.roadmap.items.length);
      if (hasRoadmap) {
        const serializedRoadmap = serializeRoadmapToMarkdown(activePack.roadmap);
        if (readTextIfExists(projectFiles.roadmap) !== serializedRoadmap) {
          fs.writeFileSync(projectFiles.roadmap, serializedRoadmap, "utf8");
        }
      }
      refreshProjectProgress(project);
    }
  }

  function syncProjectsFromFilesystem(database) {
    const basePath = normalizeWindowsPath(database.projectsBasePath) || DEFAULT_PROJECTS_BASE_PATH;
    ensureDirectory(basePath);
    const deletedPaths = new Set((Array.isArray(database.deletedProjectPaths) ? database.deletedProjectPaths : []).map((item) => String(item || "").toLowerCase()));
    const entries = fs.readdirSync(basePath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const byPath = new Map(database.projects.map((project) => [String(project.path || "").toLowerCase(), project]));

    for (const entry of entries) {
      const projectPath = path.join(basePath, entry.name);
      if (deletedPaths.has(projectPath.toLowerCase())) {
        continue;
      }
      ensureProjectScaffold(projectPath);
      const stageInfo = getProjectStage(projectPath);
      const found = byPath.get(projectPath.toLowerCase());
      if (!found) {
        database.projects.push({
          id: createId("project"),
          name: entry.name,
          path: projectPath,
          idea: readTextIfExists(path.join(projectPath, "codex.md")),
          masterPlan: readTextIfExists(path.join(projectPath, "masterplan.md")),
          masterPlanVersions: [],
          activeMasterPlanVersionId: "",
          activeRoadmapVersionId: "",
          activePromptPackId: "",
          git: { enabled: true, remote: "origin", defaultBranch: "main", branchPrefix: "codex/" },
          defaults: { gitMode: DEFAULT_GIT_MODE, chunkStrategy: DEFAULT_CHUNK_STRATEGY, chunkCount: DEFAULT_CHUNK_COUNT, commitMessage: "Implement Codex execution pack" },
          createdAt: createTimestamp(),
          updatedAt: createTimestamp(),
          stage: stageInfo.stage,
          nextAction: stageInfo.nextAction
        });
      } else {
        found.stage = stageInfo.stage;
        found.nextAction = stageInfo.nextAction;
      }
    }
  }

  function getState() {
    const database = readDatabase();
    syncProjectsFromFilesystem(database);
    syncProjectFilesFromDatabase(database);
    return writeDatabase(database);
  }

  function saveProject(input) {
    const database = readDatabase();
    const projectName = normalizeString(input && input.name);
    const requestedPath = normalizeWindowsPath(input && input.path);
    const basePath = normalizeWindowsPath(database.projectsBasePath) || DEFAULT_PROJECTS_BASE_PATH;
    const folderName = getProjectFolderName(projectName || "Project");
    const projectPath = requestedPath || path.join(basePath, folderName);

    if (!projectName) {
      throw new Error("Project name is required.");
    }

    if (!projectPath) throw new Error("Project path is required.");
    ensureProjectScaffold(projectPath);

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
      idea: existing ? existing.idea || "" : "",
      masterPlan: existing ? existing.masterPlan || readTextIfExists(path.join(projectPath, "masterplan.md")) : readTextIfExists(path.join(projectPath, "masterplan.md")),
      masterPlanVersions: existing ? existing.masterPlanVersions || [] : [],
      activeMasterPlanVersionId: existing ? existing.activeMasterPlanVersionId || "" : "",
      activeRoadmapVersionId: existing ? existing.activeRoadmapVersionId || "" : "",
      activePromptPackId: existing ? existing.activePromptPackId || "" : "",
      stage: existing ? existing.stage || "" : "",
      nextAction: existing ? existing.nextAction || "" : "",
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp
    };

    if (existing) {
      const index = database.projects.findIndex((item) => item.id === existing.id);
      database.projects[index] = project;
    } else {
      database.projects.push(project);
    }

    const stageInfo = getProjectStage(projectPath);
    project.stage = stageInfo.stage;
    project.nextAction = stageInfo.nextAction;

    return {
      project,
      state: writeDatabase(database)
    };
  }

  function updateSettings(input) {
    const database = readDatabase();
    const projectsBasePath = normalizeWindowsPath(input && input.projectsBasePath);
    if (!projectsBasePath) {
      throw new Error("Default projects folder is required.");
    }

    ensureDirectory(projectsBasePath);
    database.projectsBasePath = projectsBasePath;
    database.updatedAt = createTimestamp();
    return {
      state: writeDatabase(database)
    };
  }

  function createEmptyPromptPackForProject(database, project) {
    const timestamp = createTimestamp();
    const title = `${project.name} Prompt Pack`;
    const pack = {
      id: createId("pack"),
      projectId: project.id,
      title,
      slug: slugify(title),
      sourceText: "",
      sourceTasks: [],
      gitMode: project.defaults && project.defaults.gitMode || DEFAULT_GIT_MODE,
      chunkStrategy: project.defaults && project.defaults.chunkStrategy || DEFAULT_CHUNK_STRATEGY,
      branchName: getProjectBranch(project, slugify(title), ""),
      commitMessage: project.defaults && project.defaults.commitMessage || `Implement ${title}`,
      exportPath: path.join(project.path, "codex-plans", slugify(title)),
      roadmap: { items: [] },
      roadmapVersions: [],
      activePromptId: "",
      chunks: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    database.promptPacks.unshift(pack);
    project.activePromptPackId = pack.id;
    return pack;
  }

  function saveProjectBrief(input) {
    const saved = saveProject({
      id: input && input.projectId,
      name: input && (input.projectName || input.name),
      path: input && (input.projectPath || input.path),
      git: input && input.git || {},
      defaults: input && input.defaults || {}
    });
    const database = saved.state;
    const project = database.projects.find((item) => item.id === saved.project.id);
    project.idea = String(input && input.idea || project.idea || "");
    project.masterPlan = String(input && input.masterPlan || project.masterPlan || "");
    const projectFiles = getProjectPaths(project.path);
    ensureProjectScaffold(project.path);
    if (project.idea.trim()) fs.writeFileSync(projectFiles.codex, project.idea, "utf8");
    if (project.masterPlan.trim()) fs.writeFileSync(projectFiles.masterplan, project.masterPlan, "utf8");
    if (!Array.isArray(project.masterPlanVersions)) project.masterPlanVersions = [];
    const activePack = project.activePromptPackId
      ? database.promptPacks.find((pack) => pack.id === project.activePromptPackId)
      : null;
    if (!activePack) {
      createEmptyPromptPackForProject(database, project);
    }
    project.updatedAt = createTimestamp();
    const stageInfo = getProjectStage(project.path);
    project.stage = stageInfo.stage;
    project.nextAction = stageInfo.nextAction;
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
    ensureProjectScaffold(project.path);

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
    const projectFiles = getProjectPaths(project.path);
    fs.writeFileSync(projectFiles.masterplan, sourceText, "utf8");
    fs.writeFileSync(projectFiles.roadmap, "# Plan Roadmap\n\n", "utf8");
    pack.chunks.forEach((chunk) => {
      const taskName = `task-${String(chunk.order).padStart(3, "0")}-${slugify(chunk.title)}.md`;
      fs.writeFileSync(path.join(projectFiles.tasksDir, taskName), chunk.prompt, "utf8");
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
    const normalizedStatus = normalizeChunkStatus(status);

    const database = readDatabase();
    const pack = database.promptPacks.find((item) => item.id === packId);

    if (!pack) {
      throw new Error("Prompt pack not found.");
    }

    const chunk = pack.chunks.find((item) => item.id === chunkId);

    if (!chunk) {
      throw new Error("Prompt chunk not found.");
    }

    chunk.status = normalizedStatus;
    chunk.copiedAt = normalizedStatus === "copied" ? createTimestamp() : chunk.copiedAt;
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

  function deleteTask(packId, chunkId) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const index = pack.chunks.findIndex((item) => item.id === chunkId);
    if (index === -1) {
      throw new Error("Task not found.");
    }
    const deletedTask = pack.chunks[index];
    pack.chunks.splice(index, 1);
    if (pack.activePromptId === chunkId) {
      pack.activePromptId = pack.chunks[0] ? pack.chunks[0].id : "";
    }
    pack.updatedAt = createTimestamp();
    return {
      deletedTask,
      pack,
      state: writeDatabase(database)
    };
  }

  function deleteProject(projectId) {
    const database = readDatabase();
    const index = database.projects.findIndex((item) => item.id === projectId);
    if (index === -1) {
      throw new Error("Project not found.");
    }
    const deletedProject = database.projects[index];
    database.projects.splice(index, 1);
    database.promptPacks = database.promptPacks.filter((pack) => pack.projectId !== projectId);
    if (!Array.isArray(database.deletedProjectPaths)) {
      database.deletedProjectPaths = [];
    }
    const deletedPath = String(deletedProject.path || "").toLowerCase();
    if (deletedPath && !database.deletedProjectPaths.includes(deletedPath)) {
      database.deletedProjectPaths.push(deletedPath);
    }
    database.updatedAt = createTimestamp();
    return {
      deletedProject,
      state: writeDatabase(database)
    };
  }

  function updateChunkContent(packId, chunkId, input) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const project = getProjectById(database, pack.projectId);
    const chunk = getChunkById(pack, chunkId);
    const previousPrompt = String(chunk.prompt || "");

    if (!Array.isArray(chunk.versions)) {
      chunk.versions = [];
    }

    chunk.versions.unshift({
      id: createId("version"),
      source: "manual_edit",
      promptSnapshot: previousPrompt,
      responseText: previousPrompt,
      createdAt: createTimestamp(),
      appliedAt: createTimestamp()
    });

    const nextTitle = normalizeString(input && input.title);
    const nextPrompt = String(input && input.prompt || "");
    const nextScope = normalizeString(input && input.scope);

    if (nextTitle) {
      chunk.title = nextTitle;
    }
    chunk.prompt = nextPrompt;
    if (nextScope) {
      chunk.scope = nextScope;
    }
    const taskPrompt = (database.taskPrompts || []).find((item) => item.sourceChunkId === chunk.id && item.projectId === project.id);
    if (taskPrompt) {
      taskPrompt.title = chunk.title;
      taskPrompt.content = chunk.prompt;
      taskPrompt.updatedAt = createTimestamp();
      const taskFile = writeTaskPromptFile(project.path, taskPrompt);
      taskPrompt.taskFileName = taskFile.taskFileName;
      taskPrompt.taskFilePath = taskFile.taskFilePath;
    }
    pack.updatedAt = createTimestamp();

    return {
      chunk,
      state: writeDatabase(database)
    };
  }

  function addChunkVersion(packId, chunkId, input) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const chunk = getChunkById(pack, chunkId);
    const responseText = String(input && input.responseText || "").trim();

    if (!responseText) {
      throw new Error("Version response text is required.");
    }
    if (!Array.isArray(chunk.versions)) {
      chunk.versions = [];
    }

    const version = {
      id: createId("version"),
      source: normalizeString(input && input.source) || "ai_improve",
      promptSnapshot: String(input && input.promptSnapshot || chunk.prompt || ""),
      responseText,
      createdAt: createTimestamp(),
      appliedAt: ""
    };

    chunk.versions.unshift(version);
    pack.updatedAt = createTimestamp();

    return {
      version,
      chunk,
      state: writeDatabase(database)
    };
  }

  function applyChunkVersion(packId, chunkId, versionId) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const project = getProjectById(database, pack.projectId);
    const chunk = getChunkById(pack, chunkId);
    const versions = Array.isArray(chunk.versions) ? chunk.versions : [];
    const version = versions.find((item) => item.id === versionId);

    if (!version) {
      throw new Error("Prompt version not found.");
    }

    chunk.prompt = String(version.responseText || chunk.prompt || "");
    version.appliedAt = createTimestamp();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.sourceChunkId === chunk.id && item.projectId === project.id);
    if (taskPrompt) {
      taskPrompt.content = chunk.prompt;
      taskPrompt.updatedAt = createTimestamp();
      const taskFile = writeTaskPromptFile(project.path, taskPrompt);
      taskPrompt.taskFileName = taskFile.taskFileName;
      taskPrompt.taskFilePath = taskFile.taskFilePath;
    }
    pack.updatedAt = createTimestamp();

    return {
      version,
      chunk,
      state: writeDatabase(database)
    };
  }

  function addChunkRunHistory(packId, chunkId, input) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const chunk = getChunkById(pack, chunkId);
    const note = String(input && input.note || "").trim();

    if (!note) {
      throw new Error("Run history note is required.");
    }
    if (!Array.isArray(chunk.runHistory)) {
      chunk.runHistory = [];
    }

    const runItem = {
      id: createId("run"),
      note,
      source: normalizeString(input && input.source) || "manual",
      createdAt: createTimestamp()
    };

    chunk.runHistory.unshift(runItem);
    pack.updatedAt = createTimestamp();

    return {
      runItem,
      chunk,
      state: writeDatabase(database)
    };
  }

  function createManualChunk(packId, input) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const maxOrder = pack.chunks.reduce((max, chunk) => Math.max(max, Number(chunk.order) || 0), 0);
    const title = normalizeString(input && input.title) || `Task ${maxOrder + 1}`;
    const scope = normalizeString(input && input.scope);
    const prompt = String(input && input.prompt || "");
    const tasks = Array.isArray(input && input.tasks)
      ? input.tasks.map(normalizeString).filter(Boolean)
      : [];

    const chunk = sanitizeChunk({
      id: createId("chunk"),
      order: maxOrder + 1,
      title,
      filename: `codex-${String(maxOrder + 1).padStart(3, "0")}-${slugify(title)}.md`,
      scope: scope || createTaskDescription(title, title),
      tasks: tasks.length ? tasks : [title],
      gitAction: "none",
      commitMessage: title,
      status: "in_progress",
      prompt,
      launcher: "",
      versions: [],
      runHistory: [],
      createdAt: createTimestamp()
    });

    pack.chunks.push(chunk);
    pack.updatedAt = createTimestamp();

    return {
      chunk,
      state: writeDatabase(database)
    };
  }

  function buildChunkImprovePrompt(packId, chunkId) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const chunk = getChunkById(pack, chunkId);
    const runHistory = Array.isArray(chunk.runHistory) ? chunk.runHistory.slice(0, 5) : [];
    const runHistoryText = runHistory.length
      ? runHistory.map((item, index) => `- ${index + 1}. ${item.note}`).join("\n")
      : "- No run history notes yet.";

    const prompt = [
      `Improve this Codex task prompt for better execution quality.`,
      "",
      `Task name: ${chunk.title}`,
      "",
      "Current prompt:",
      chunk.prompt || "(empty)",
      "",
      "Recent run history:",
      runHistoryText,
      "",
      "Return only the improved task prompt text."
    ].join("\n");

    return {
      pack,
      chunk,
      prompt
    };
  }

  function getProjectById(database, projectId) {
    const project = database.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    return project;
  }

  function createDebateWorkflow(projectId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const workflow = sanitizeDebateWorkflow({
      id: createId("debate_workflow"),
      projectId: project.id,
      status: "ready_for_user",
      currentStageId: PLANNING_DEBATE_STAGES[0],
      rounds: [],
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
      completedAt: ""
    });
    database.debateWorkflows.unshift(workflow);
    return { workflow, state: writeDatabase(database) };
  }

  function getActiveDebateWorkflow(projectId) {
    const database = readDatabase();
    getProjectById(database, projectId);
    const workflow = database.debateWorkflows
      .filter((item) => item.projectId === projectId)
      .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
      .find((item) => item.status !== "complete") || null;
    return { workflow, state: writeDatabase(database) };
  }

  function getDebateWorkflow(workflowId) {
    const database = readDatabase();
    const workflow = database.debateWorkflows.find((item) => item.id === workflowId);
    if (!workflow) {
      throw new Error("Debate workflow not found.");
    }
    return { workflow, state: writeDatabase(database) };
  }

  function saveDebateRound(workflowId, input) {
    const database = readDatabase();
    const workflow = database.debateWorkflows.find((item) => item.id === workflowId);
    if (!workflow) {
      throw new Error("Debate workflow not found.");
    }
    const responseText = String(input && input.responseText || input && input.responseReceived || "");
    const round = sanitizeDebateRound({
      id: createId("debate_round"),
      workflowId: workflow.id,
      stageId: normalizeString(input && input.stageId) || workflow.currentStageId || PLANNING_DEBATE_STAGES[0],
      provider: normalizeString(input && input.provider),
      role: normalizeString(input && input.role),
      promptText: String(input && input.promptText || input && input.promptSent || ""),
      responseText,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp()
    });
    workflow.rounds.push(round);
    workflow.updatedAt = createTimestamp();
    return { workflow, round, state: writeDatabase(database) };
  }

  function advanceDebateWorkflow(workflowId) {
    const database = readDatabase();
    const workflow = database.debateWorkflows.find((item) => item.id === workflowId);
    if (!workflow) {
      throw new Error("Debate workflow not found.");
    }
    const currentStageId = normalizeString(workflow.currentStageId) || PLANNING_DEBATE_STAGES[0];
    const stageIndex = PLANNING_DEBATE_STAGES.indexOf(currentStageId);
    const nextStageId = stageIndex >= 0 ? PLANNING_DEBATE_STAGES[stageIndex + 1] : "";
    if (!nextStageId) {
      workflow.status = "complete";
      workflow.completedAt = createTimestamp();
    } else {
      workflow.currentStageId = nextStageId;
    }
    workflow.updatedAt = createTimestamp();
    return { workflow, state: writeDatabase(database) };
  }

  function completeDebateWorkflow(workflowId) {
    const database = readDatabase();
    const workflow = database.debateWorkflows.find((item) => item.id === workflowId);
    if (!workflow) {
      throw new Error("Debate workflow not found.");
    }
    workflow.status = "complete";
    workflow.completedAt = createTimestamp();
    workflow.updatedAt = createTimestamp();
    return { workflow, state: writeDatabase(database) };
  }

  function addMasterPlanVersion(projectId, input) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    if (!Array.isArray(project.masterPlanVersions)) project.masterPlanVersions = [];
    const responseText = String(input && input.responseText || "").trim();
    if (!responseText) throw new Error("Master plan version text is required.");
    const version = {
      id: createId("version"),
      source: normalizeString(input && input.source) || "ai_improve",
      promptSnapshot: String(input && input.promptSnapshot || project.masterPlan || ""),
      responseText,
      createdAt: createTimestamp(),
      appliedAt: ""
    };
    project.masterPlanVersions.unshift(version);
    database.masterPlanVersions.unshift(sanitizeMasterPlanVersion({
      id: version.id,
      projectId: project.id,
      source: version.source,
      content: version.responseText,
      status: "draft",
      createdAt: version.createdAt,
      updatedAt: version.createdAt
    }));
    project.updatedAt = createTimestamp();
    return { version, project, state: writeDatabase(database) };
  }

  function createMasterPlanVersionFromDebate(workflowId, roundId) {
    const database = readDatabase();
    const workflow = database.debateWorkflows.find((item) => item.id === workflowId);
    if (!workflow) throw new Error("Debate workflow not found.");
    const project = getProjectById(database, workflow.projectId);
    const round = (Array.isArray(workflow.rounds) ? workflow.rounds : []).find((item) => item.id === roundId);
    if (!round) throw new Error("Debate round not found.");
    const isFinalStageRound = round.stageId === "gpt_final_synthesis";
    const workflowComplete = workflow.status === "complete";
    if (!isFinalStageRound && !workflowComplete) {
      throw new Error("Master plan can be created only from final synthesis or completed workflow.");
    }
    const content = String(round.responseText || "").trim();
    if (!content) throw new Error("Debate round response is empty.");
    if (!Array.isArray(project.masterPlanVersions)) project.masterPlanVersions = [];
    const createdAt = createTimestamp();
    const version = {
      id: createId("version"),
      source: "debate_final_synthesis",
      sourceWorkflowId: workflow.id,
      sourceRoundId: round.id,
      promptSnapshot: String(round.promptText || ""),
      responseText: content,
      status: "draft",
      createdAt,
      appliedAt: ""
    };
    project.masterPlanVersions.unshift(version);
    database.masterPlanVersions.unshift(sanitizeMasterPlanVersion({
      id: version.id,
      projectId: project.id,
      sourceWorkflowId: workflow.id,
      sourceRoundId: round.id,
      source: version.source,
      content,
      status: "draft",
      createdAt,
      updatedAt: createdAt
    }));
    project.updatedAt = createTimestamp();
    return { version, project, workflow, round, state: writeDatabase(database) };
  }

  function applyMasterPlanVersion(projectId, versionId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const version = (project.masterPlanVersions || []).find((item) => item.id === versionId);
    if (!version) throw new Error("Master plan version not found.");
    project.masterPlan = String(version.responseText || version.content || "");
    version.appliedAt = createTimestamp();
    version.status = "applied";
    project.activeMasterPlanVersionId = version.id;
    (project.masterPlanVersions || []).forEach((item) => {
      if (item.id !== version.id && String(item.status || "") === "applied") {
        item.status = "archived";
      }
    });
    database.masterPlanVersions = (database.masterPlanVersions || []).map((item) => {
      if (item.id === version.id) {
        return sanitizeMasterPlanVersion({
          ...item,
          content: project.masterPlan,
          status: "applied",
          appliedAt: version.appliedAt,
          updatedAt: createTimestamp()
        });
      }
      if (item.projectId === project.id && item.id !== version.id && item.status === "applied") {
        return sanitizeMasterPlanVersion({
          ...item,
          status: "archived",
          archivedAt: createTimestamp(),
          updatedAt: createTimestamp()
        });
      }
      return item;
    });
    writeMasterPlanFile(project, project.masterPlan);
    return { version, project, state: writeDatabase(database) };
  }

  function archiveMasterPlanVersion(projectId, versionId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const version = (project.masterPlanVersions || []).find((item) => item.id === versionId);
    if (!version) throw new Error("Master plan version not found.");
    version.status = "archived";
    version.archivedAt = createTimestamp();
    if (project.activeMasterPlanVersionId === version.id) {
      project.activeMasterPlanVersionId = "";
    }
    database.masterPlanVersions = (database.masterPlanVersions || []).map((item) => item.id === version.id
      ? sanitizeMasterPlanVersion({
        ...item,
        status: "archived",
        archivedAt: version.archivedAt,
        updatedAt: createTimestamp()
      })
      : item);
    return { version, project, state: writeDatabase(database) };
  }

  function listMasterPlanVersions(projectId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const versions = (project.masterPlanVersions || [])
      .slice()
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    return { versions, project, state: writeDatabase(database) };
  }

  function parseRoadmapResponse(responseText) {
    if (globalThis.NextStepAiProjectBuilderProtocol
      && typeof globalThis.NextStepAiProjectBuilderProtocol.parseRoadmapResponse === "function") {
      return globalThis.NextStepAiProjectBuilderProtocol.parseRoadmapResponse(responseText);
    }
    const raw = String(responseText || "").trim();
    if (!raw) return { items: [] };
    try {
      const parsed = JSON.parse(raw);
      return sanitizeRoadmap(parsed);
    } catch (_error) {
      const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const items = [];
      const tableRows = lines.filter((line) => /^\|.+\|$/.test(line) && !/^(\|\s*-+\s*)+\|$/.test(line));
      if (tableRows.length >= 2) {
        for (const row of tableRows.slice(1)) {
          const cols = row.split("|").map((part) => part.trim()).filter(Boolean);
          const order = Number.parseInt(cols[0], 10);
          const title = cols[1] || cols[0];
          const dependsOn = (cols[2] || "").split(",").map((v) => v.trim()).filter(Boolean);
          const parallelGroup = cols[3] || "";
          items.push(sanitizeRoadmapItem({
            id: `roadmap_${items.length + 1}`,
            order: Number.isFinite(order) ? order : items.length + 1,
            title,
            goal: title,
            dependsOn,
            parallelGroup
          }, items.length));
        }
      } else {
        lines
          .filter((line) => /^#{2,6}\s+/.test(line) || /^(?:[-*]\s+|\d+[.)]\s+)/.test(line))
          .forEach((line) => {
            const clean = line.replace(/^#{2,6}\s+/, "").replace(/^(?:[-*]\s+|\d+[.)]\s+)/, "").trim();
            if (!clean) return;
            items.push(sanitizeRoadmapItem({
              id: `roadmap_${items.length + 1}`,
              order: items.length + 1,
              title: clean,
              goal: clean
            }, items.length));
          });
      }
      return { items };
    }
  }

  function addRoadmapVersion(packId, input) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    if (!Array.isArray(pack.roadmapVersions)) pack.roadmapVersions = [];
    const responseText = String(input && input.responseText || "").trim();
    if (!responseText) throw new Error("Roadmap version text is required.");
    const version = {
      id: createId("version"),
      source: normalizeString(input && input.source) || "ai_roadmap",
      promptSnapshot: String(input && input.promptSnapshot || ""),
      responseText,
      createdAt: createTimestamp(),
      appliedAt: ""
    };
    pack.roadmapVersions.unshift(version);
    pack.updatedAt = createTimestamp();
    return { version, pack, state: writeDatabase(database) };
  }

  function prepareRoadmapGeneration(projectId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const activeMasterPlan = String(project.masterPlan || "").trim();
    if (!activeMasterPlan) {
      throw new Error("Applied master plan is required before roadmap generation.");
    }
    return {
      project,
      activeMasterPlan,
      state: writeDatabase(database)
    };
  }

  function applyRoadmapVersion(packId, versionId) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const project = getProjectById(database, pack.projectId);
    const version = (pack.roadmapVersions || []).find((item) => item.id === versionId);
    if (!version) throw new Error("Roadmap version not found.");
    pack.roadmap = parseRoadmapResponse(version.responseText);
    version.appliedAt = createTimestamp();
    version.status = "applied";
    pack.updatedAt = createTimestamp();
    project.activeRoadmapVersionId = version.id;
    writeRoadmapFile(project, pack.roadmap);
    return { version, pack, project, state: writeDatabase(database) };
  }

  function addRoadmapVersionForProject(projectId, input) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const pack = getActivePackForProject(database, project) || createEmptyPromptPackForProject(database, project);
    const response = addRoadmapVersion(pack.id, input);
    return {
      ...response,
      project,
      packId: pack.id
    };
  }

  function applyRoadmapVersionForProject(projectId, versionId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const pack = getActivePackForProject(database, project);
    if (!pack) throw new Error("Active roadmap pack not found.");
    return applyRoadmapVersion(pack.id, versionId);
  }

  function listRoadmapVersions(projectId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const pack = getActivePackForProject(database, project);
    const versions = pack && Array.isArray(pack.roadmapVersions) ? pack.roadmapVersions.slice() : [];
    versions.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    return { versions, project, pack, state: writeDatabase(database) };
  }

  function archiveRoadmapVersion(projectId, versionId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const pack = getActivePackForProject(database, project);
    if (!pack) throw new Error("Active roadmap pack not found.");
    const version = (pack.roadmapVersions || []).find((item) => item.id === versionId);
    if (!version) throw new Error("Roadmap version not found.");
    version.status = "archived";
    version.archivedAt = createTimestamp();
    if (project.activeRoadmapVersionId === version.id) {
      project.activeRoadmapVersionId = "";
    }
    return { version, project, pack, state: writeDatabase(database) };
  }

  function getRoadmapItemEligibility(projectId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const pack = getActivePackForProject(database, project);
    if (!pack) return { items: [], project, pack: null, state: writeDatabase(database) };
    const eligibility = getRoadmapEligibility(pack.id);
    const items = (eligibility.items || []).map((item) => {
      const taskChunk = (pack.chunks || []).find((chunk) => chunk.roadmapItemId === item.id);
      let status = "ready";
      if (taskChunk && taskChunk.status === "done") status = "done";
      else if (taskChunk && taskChunk.status === "in_progress") status = "in_progress";
      else if (!item.eligible) status = "blocked";
      return { ...item, status };
    });
    return { items, project, pack, state: writeDatabase(database) };
  }

  function getNextEligibleRoadmapItem(projectId) {
    const result = getRoadmapItemEligibility(projectId);
    const nextItem = (result.items || [])
      .filter((item) => item.status === "ready")
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))[0] || null;
    return { ...result, nextItem };
  }

  function markRoadmapItemInProgress(projectId, roadmapItemId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const pack = getActivePackForProject(database, project);
    if (!pack) throw new Error("Active roadmap pack not found.");
    const existing = (pack.chunks || []).find((chunk) => chunk.roadmapItemId === roadmapItemId);
    if (!existing) {
      const started = startRoadmapPrompt(pack.id, roadmapItemId);
      return { project, pack: started.pack, chunk: started.chunk, state: started.state };
    }
    const updated = updateChunkStatus(pack.id, existing.id, "in_progress");
    return { project, pack: getPackById(readDatabase(), pack.id), chunk: updated.chunk, state: updated.state };
  }

  function markRoadmapItemDone(projectId, roadmapItemId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const pack = getActivePackForProject(database, project);
    if (!pack) throw new Error("Active roadmap pack not found.");
    const existing = (pack.chunks || []).find((chunk) => chunk.roadmapItemId === roadmapItemId);
    if (!existing) throw new Error("Roadmap item has no started task.");
    const updated = updateChunkStatus(pack.id, existing.id, "done");
    return { project, pack: getPackById(readDatabase(), pack.id), chunk: updated.chunk, state: updated.state };
  }

  function createTaskPromptFromRoadmapItem(projectId, roadmapItemId) {
    const database = readDatabase();
    const project = getProjectById(database, projectId);
    const pack = getActivePackForProject(database, project);
    if (!pack) throw new Error("Active roadmap pack not found.");
    const eligibility = getRoadmapEligibility(pack.id);
    const item = (eligibility.items || []).find((entry) => entry.id === roadmapItemId);
    if (!item) throw new Error("Roadmap item not found.");
    if (!item.eligible) throw new Error("Roadmap item is not ready.");
    const existingTaskPrompt = (database.taskPrompts || []).find((prompt) => prompt.projectId === project.id && prompt.roadmapItemId === roadmapItemId);
    if (existingTaskPrompt) throw new Error("Task prompt already exists for this roadmap item.");
    const created = startRoadmapPrompt(pack.id, roadmapItemId);
    const chunk = created.chunk;
    const taskPrompt = sanitizeTaskPrompt({
      id: createId("task_prompt"),
      projectId: project.id,
      roadmapItemId,
      title: chunk.title,
      content: chunk.prompt,
      status: "draft",
      taskFileName: `task-${String(chunk.order).padStart(3, "0")}-${slugify(chunk.title)}.md`,
      order: chunk.order,
      sourceChunkId: chunk.id,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp()
    });
    const version = sanitizeTaskPromptVersion({
      id: createId("task_prompt_version"),
      taskPromptId: taskPrompt.id,
      source: "generated",
      content: taskPrompt.content,
      status: "applied",
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
      appliedAt: createTimestamp()
    });
    taskPrompt.activeVersionId = version.id;
    database.taskPrompts.unshift(taskPrompt);
    database.taskPromptVersions.unshift(version);
    const taskFile = writeTaskPromptFile(project.path, taskPrompt);
    taskPrompt.taskFileName = taskFile.taskFileName;
    taskPrompt.taskFilePath = taskFile.taskFilePath;
    return {
      taskPrompt,
      version,
      project,
      pack: created.pack,
      chunk,
      state: writeDatabase(database)
    };
  }

  function updateTaskPromptContent(taskPromptId, input) {
    const database = readDatabase();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.id === taskPromptId);
    if (!taskPrompt) throw new Error("Task prompt not found.");
    const previousContent = String(taskPrompt.content || "");
    const nextContent = String(input && input.content || "");
    if (previousContent !== nextContent) {
      database.taskPromptVersions.unshift(sanitizeTaskPromptVersion({
        id: createId("task_prompt_version"),
        taskPromptId: taskPrompt.id,
        source: "manual_edit_snapshot",
        content: previousContent,
        status: "snapshot",
        createdAt: createTimestamp(),
        updatedAt: createTimestamp()
      }));
    }
    taskPrompt.content = nextContent;
    taskPrompt.updatedAt = createTimestamp();
    const taskFile = writeTaskPromptFile(getProjectById(database, taskPrompt.projectId).path, taskPrompt);
    taskPrompt.taskFileName = taskFile.taskFileName;
    taskPrompt.taskFilePath = taskFile.taskFilePath;
    return { taskPrompt, state: writeDatabase(database) };
  }

  function addTaskPromptVersion(taskPromptId, input) {
    const database = readDatabase();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.id === taskPromptId);
    if (!taskPrompt) throw new Error("Task prompt not found.");
    const version = sanitizeTaskPromptVersion({
      id: createId("task_prompt_version"),
      taskPromptId: taskPrompt.id,
      source: normalizeString(input && input.source) || "manual",
      content: String(input && input.content || ""),
      status: normalizeString(input && input.status) || "proposed",
      createdAt: createTimestamp(),
      updatedAt: createTimestamp()
    });
    database.taskPromptVersions.unshift(version);
    return { taskPrompt, version, state: writeDatabase(database) };
  }

  function applyTaskPromptVersion(taskPromptId, versionId) {
    const database = readDatabase();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.id === taskPromptId);
    if (!taskPrompt) throw new Error("Task prompt not found.");
    const version = (database.taskPromptVersions || []).find((item) => item.id === versionId && item.taskPromptId === taskPrompt.id);
    if (!version) throw new Error("Task prompt version not found.");
    version.status = "applied";
    version.appliedAt = createTimestamp();
    version.updatedAt = createTimestamp();
    taskPrompt.content = version.content;
    taskPrompt.activeVersionId = version.id;
    taskPrompt.updatedAt = createTimestamp();
    const project = getProjectById(database, taskPrompt.projectId);
    const taskFile = writeTaskPromptFile(project.path, taskPrompt);
    taskPrompt.taskFileName = taskFile.taskFileName;
    taskPrompt.taskFilePath = taskFile.taskFilePath;
    return { taskPrompt, version, state: writeDatabase(database) };
  }

  function listTaskPromptVersions(taskPromptId) {
    const database = readDatabase();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.id === taskPromptId);
    if (!taskPrompt) throw new Error("Task prompt not found.");
    const versions = (database.taskPromptVersions || [])
      .filter((item) => item.taskPromptId === taskPrompt.id)
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    return { taskPrompt, versions, state: writeDatabase(database) };
  }

  function prepareTaskImprovePrompt(taskPromptId) {
    const database = readDatabase();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.id === taskPromptId);
    if (!taskPrompt) throw new Error("Task prompt not found.");
    const project = getProjectById(database, taskPrompt.projectId);
    const runHistory = (database.taskRuns || []).filter((run) => run.taskPromptId === taskPrompt.id);
    const prompt = projectBuilderProtocol.buildTaskImprovePrompt(
      project,
      taskPrompt,
      project.masterPlan || "",
      runHistory
    );
    return { taskPrompt, project, runHistory, prompt, state: writeDatabase(database) };
  }

  function saveTaskImproveResponse(taskPromptId, responseText) {
    const text = String(responseText || "").trim();
    if (!text) throw new Error("Improve response text is required.");
    return addTaskPromptVersion(taskPromptId, {
      source: "ai_improve",
      content: text,
      status: "proposed"
    });
  }

  function approveTaskPrompt(taskPromptId) {
    const database = readDatabase();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.id === taskPromptId);
    if (!taskPrompt) throw new Error("Task prompt not found.");
    taskPrompt.status = "approved";
    taskPrompt.approvedAt = createTimestamp();
    taskPrompt.updatedAt = createTimestamp();
    return { taskPrompt, state: writeDatabase(database) };
  }

  function copyCodexHandoff(taskPromptId) {
    const database = readDatabase();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.id === taskPromptId);
    if (!taskPrompt) throw new Error("Task prompt not found.");
    if (taskPrompt.status !== "approved") {
      throw new Error("Task prompt must be approved before copy.");
    }
    const project = getProjectById(database, taskPrompt.projectId);
    const projectFiles = getProjectPaths(project.path);
    const handoffText = [
      `Project path: ${project.path}`,
      `Required files to read: ${projectFiles.architecture}, ${projectFiles.codex}, ${projectFiles.masterplan}, ${taskPrompt.taskFilePath || path.join(projectFiles.tasksDir, getTaskFileName(taskPrompt))}`,
      `Master plan path: ${projectFiles.masterplan}`,
      `Task prompt path: ${taskPrompt.taskFilePath || path.join(projectFiles.tasksDir, getTaskFileName(taskPrompt))}`,
      "",
      "Full task prompt:",
      taskPrompt.content
    ].join("\n");
    taskPrompt.status = "copied";
    taskPrompt.copiedAt = createTimestamp();
    taskPrompt.updatedAt = createTimestamp();
    return { taskPrompt, handoffText, state: writeDatabase(database) };
  }

  function markTaskPromptDone(taskPromptId, input) {
    const database = readDatabase();
    const taskPrompt = (database.taskPrompts || []).find((item) => item.id === taskPromptId);
    if (!taskPrompt) throw new Error("Task prompt not found.");
    const run = sanitizeTaskRun({
      id: createId("task_run"),
      taskPromptId: taskPrompt.id,
      note: String(input && input.note || ""),
      result: String(input && input.result || ""),
      commitHash: normalizeString(input && input.commitHash),
      verificationSummary: String(input && input.verificationSummary || ""),
      createdAt: createTimestamp()
    });
    database.taskRuns.unshift(run);
    taskPrompt.status = "done";
    taskPrompt.doneAt = createTimestamp();
    taskPrompt.updatedAt = createTimestamp();
    const project = getProjectById(database, taskPrompt.projectId);
    const pack = getActivePackForProject(database, project);
    if (pack) {
      const chunk = (pack.chunks || []).find((item) => item.id === taskPrompt.sourceChunkId || item.roadmapItemId === taskPrompt.roadmapItemId);
      if (chunk) {
        chunk.status = "done";
        chunk.updatedAt = createTimestamp();
      }
    }
    let nextItem = null;
    if (pack && pack.roadmap && Array.isArray(pack.roadmap.items)) {
      const doneRoadmapIds = (pack.chunks || [])
        .filter((entry) => entry.status === "done" && entry.roadmapItemId)
        .map((entry) => entry.roadmapItemId);
      const startedRoadmapIds = (pack.chunks || [])
        .filter((entry) => entry.roadmapItemId)
        .map((entry) => entry.roadmapItemId);
      nextItem = pack.roadmap.items
        .slice()
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
        .find((item) => {
          if (!item || startedRoadmapIds.includes(item.id)) return false;
          const blockedBy = (Array.isArray(item.dependsOn) ? item.dependsOn : [])
            .filter((dependencyId) => !doneRoadmapIds.includes(dependencyId));
          return blockedBy.length === 0;
        }) || null;
    }
    return { taskPrompt, run, nextItem, state: writeDatabase(database) };
  }

  function getRoadmapEligibility(packId) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const items = (pack.roadmap && Array.isArray(pack.roadmap.items) ? pack.roadmap.items : []);
    const chunks = Array.isArray(pack.chunks) ? pack.chunks : [];
    const doneRoadmapIds = chunks
      .filter((chunk) => chunk.status === "done" && chunk.roadmapItemId)
      .map((chunk) => chunk.roadmapItemId);
    const startedRoadmapIds = chunks
      .filter((chunk) => chunk.roadmapItemId)
      .map((chunk) => chunk.roadmapItemId);

    return {
      pack,
      items: items.map((item) => {
        const blockedBy = (item.dependsOn || []).filter((dependencyId) => !doneRoadmapIds.includes(dependencyId));
        return {
          ...item,
          started: startedRoadmapIds.includes(item.id),
          done: doneRoadmapIds.includes(item.id),
          blockedBy,
          eligible: blockedBy.length === 0 && !startedRoadmapIds.includes(item.id)
        };
      })
    };
  }

function createPromptFromRoadmapItem({ project, pack, item, order }) {
  const projectFiles = getProjectPaths(project.path);
  const dependencyList = Array.isArray(item.dependsOn) && item.dependsOn.length ? item.dependsOn : ["none"];
  const prompt = [
    `# ${item.title}`,
    "",
    "Project name:",
    project.name,
    "",
    "Project path:",
    project.path,
    "",
    "Master plan file path:",
    projectFiles.masterplan,
    "",
    "Roadmap item title:",
    item.title,
    "",
    "## Goal",
    item.goal || item.title,
    "",
    "## Why This Exists",
      item.why || "This prompt implements one focused part of the master plan.",
      "",
      "## Files To Read Or Inspect",
      ...(item.targetFiles && item.targetFiles.length ? item.targetFiles.map((file) => `- ${file}`) : ["- Inspect the relevant project files before editing."]),
      "",
      "## Research Needed",
      ...(item.researchNeeded && item.researchNeeded.length ? item.researchNeeded.map((note) => `- ${note}`) : ["- Use the local codebase as the source of truth."]),
      "",
      "## Acceptance Criteria",
      ...(item.acceptanceCriteria && item.acceptanceCriteria.length ? item.acceptanceCriteria.map((criterion) => `- ${criterion}`) : ["- The requested behavior is implemented and verified."]),
      "",
    "## Verification Commands",
    ...(item.verificationCommands && item.verificationCommands.length ? item.verificationCommands.map((command) => `- ${command}`) : ["- npm.cmd run desktop:test"]),
    "",
    "## Dependencies",
    ...dependencyList.map((dependencyId) => `- ${dependencyId}`),
    "",
    "## Git Rules",
    "- Do not use git reset --hard.",
    "- Do not delete unrelated user work.",
    "- Keep the change scoped to this task only.",
    "",
    "## Constraints",
    "- Strict scope: only this task.",
    "- Do not modify unrelated files.",
    "- Report exactly what changed and which verification commands passed."
  ].join("\n");

    return sanitizeChunk({
      id: createId("chunk"),
      order,
      title: item.title,
      filename: `codex-${String(order).padStart(3, "0")}-${slugify(item.title)}.md`,
      scope: item.goal || item.title,
      tasks: [item.goal || item.title],
      gitAction: "none",
      commitMessage: item.title,
      status: "in_progress",
      prompt,
      launcher: "",
      roadmapItemId: item.id,
      parallelGroup: item.parallelGroup || "",
      versions: [],
      runHistory: [],
      createdAt: createTimestamp()
    });
  }

  function getTaskFileName(taskPrompt) {
    const stableNumber = Number(taskPrompt.order || 0) || 1;
    return taskPrompt.taskFileName || `task-${String(stableNumber).padStart(3, "0")}-${slugify(taskPrompt.title || "task")}.md`;
  }

  function writeTaskPromptFile(projectPath, taskPrompt) {
    ensureProjectScaffold(projectPath);
    const projectFiles = getProjectPaths(projectPath);
    const taskFileName = getTaskFileName(taskPrompt);
    const taskFilePath = path.join(projectFiles.tasksDir, taskFileName);
    fs.writeFileSync(taskFilePath, String(taskPrompt.content || ""), "utf8");
    return { taskFileName, taskFilePath };
  }

  function startRoadmapPrompt(packId, roadmapItemId) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const project = getProjectById(database, pack.projectId);
    const eligibility = getRoadmapEligibility(packId);
    const eligibleItem = eligibility.items.find((item) => item.id === roadmapItemId);
    if (!eligibleItem) throw new Error("Roadmap item not found.");
    if (!eligibleItem.eligible) throw new Error(`Roadmap item is blocked by dependencies: ${eligibleItem.blockedBy.join(", ")}`);
    const freshPack = getPackById(database, packId);
    const maxOrder = freshPack.chunks.reduce((max, chunk) => Math.max(max, Number(chunk.order) || 0), 0);
    const chunk = createPromptFromRoadmapItem({
      project,
      pack: freshPack,
      item: eligibleItem,
      order: maxOrder + 1
    });
    freshPack.chunks.push(chunk);
    freshPack.activePromptId = chunk.id;
    freshPack.updatedAt = createTimestamp();
    ensureProjectScaffold(project.path);
    const taskName = `task-${String(chunk.order).padStart(3, "0")}-${slugify(chunk.title)}.md`;
    fs.writeFileSync(path.join(getProjectPaths(project.path).tasksDir, taskName), chunk.prompt, "utf8");
    refreshProjectProgress(project);
    return { pack: freshPack, chunk, project, state: writeDatabase(database) };
  }

  function approvePrompt(packId, chunkId) {
    return updateChunkStatus(packId, chunkId, "approved");
  }

  function buildCodexHandoffPrompt({ project, pack, chunk }) {
    return [
      `# ${chunk.title}`,
      "",
      `Project name: ${project.name}`,
      `Project path: ${project.path}`,
      "",
      "## Master Plan Summary",
      project.masterPlan || pack.sourceText || "(No master plan saved.)",
      "",
      "## Detailed Prompt",
      chunk.prompt || "",
      "",
      "## Dependencies",
      chunk.dependsOnChunkIds && chunk.dependsOnChunkIds.length ? chunk.dependsOnChunkIds.join(", ") : "No explicit prompt dependencies.",
      "",
      "## Verification commands",
      "- npm.cmd run desktop:test",
      "- npm.cmd run verify",
      "",
      "## Final Report Required",
      "- Files changed",
      "- What was implemented",
      "- Verification commands and results",
      "- Any blockers or follow-up risks",
      "",
      "Do not modify unrelated files. Do not use destructive git commands."
    ].join("\n");
  }

  function copyPromptToCodex(packId, chunkId) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const project = getProjectById(database, pack.projectId);
    const chunk = getChunkById(pack, chunkId);
    if (chunk.status !== "approved") {
      throw new Error("Prompt must be approved before copying to Codex.");
    }
    const handoffPrompt = buildCodexHandoffPrompt({ project, pack, chunk });
    chunk.status = "copied";
    chunk.copiedAt = createTimestamp();
    pack.updatedAt = createTimestamp();
    return { pack, chunk, handoffPrompt, state: writeDatabase(database) };
  }

  function parseTaskSelector(selector, maxOrder) {
    const raw = String(selector || "").trim();
    if (!raw) throw new Error("Task selector is required.");
    const selected = new Set();
    for (const token of raw.split(",").map((item) => item.trim()).filter(Boolean)) {
      if (/^\d+\s*-\s*\d+$/.test(token)) {
        const [startText, endText] = token.split("-").map((item) => item.trim());
        const start = Number.parseInt(startText, 10);
        const end = Number.parseInt(endText, 10);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
          throw new Error(`Invalid task range: ${token}`);
        }
        for (let index = start; index <= end; index += 1) selected.add(index);
      } else if (/^\d+$/.test(token)) {
        selected.add(Number.parseInt(token, 10));
      } else {
        throw new Error(`Invalid task selector token: ${token}`);
      }
    }
    const normalized = [...selected].filter((value) => value >= 1 && value <= maxOrder).sort((a, b) => a - b);
    if (!normalized.length) throw new Error("Task selector does not match any task.");
    return normalized;
  }

  function copyRoadmapHandoffToCodex(packId, selector) {
    const database = readDatabase();
    const pack = getPackById(database, packId);
    const project = getProjectById(database, pack.projectId);
    const maxOrder = pack.chunks.reduce((max, chunk) => Math.max(max, Number(chunk.order) || 0), 0);
    const orders = parseTaskSelector(selector, maxOrder);
    const selectedChunks = orders
      .map((order) => pack.chunks.find((chunk) => Number(chunk.order) === order))
      .filter(Boolean);
    if (!selectedChunks.length) throw new Error("No prompt tasks matched the selector.");

    const projectFiles = getProjectPaths(project.path);
    const baseParts = [
      "# Codex Handoff",
      "",
      `Project: ${project.name}`,
      `Path: ${project.path}`,
      "",
      "## Shared Files",
      `### architecture.md\n${readTextIfExists(projectFiles.architecture)}`,
      `### codex.md\n${readTextIfExists(projectFiles.codex)}`,
      `### masterplan.md\n${readTextIfExists(projectFiles.masterplan)}`,
      `### plan-roadmap.md\n${readTextIfExists(projectFiles.roadmap)}`
    ];

    for (const chunk of selectedChunks) {
      const taskPath = path.join(projectFiles.tasksDir, `task-${String(chunk.order).padStart(3, "0")}-${slugify(chunk.title)}.md`);
      baseParts.push(`### ${path.basename(taskPath)}\n${readTextIfExists(taskPath) || chunk.prompt || ""}`);
    }

    return {
      handoffPrompt: baseParts.join("\n\n"),
      selector: orders.join(","),
      selectedChunkIds: selectedChunks.map((chunk) => chunk.id),
      state: writeDatabase(database)
    };
  }

  function markPromptDone(packId, chunkId, input) {
    const noteResult = addChunkRunHistory(packId, chunkId, input);
    const statusResult = updateChunkStatus(packId, chunkId, "done");
    return {
      runItem: noteResult.runItem,
      chunk: statusResult.chunk,
      state: statusResult.state
    };
  }

  return {
    getState,
    updateSettings,
    saveProject,
    saveProjectBrief,
    generatePromptPack,
    updateChunkStatus,
    getChunkPrompt,
    getChunkLauncher,
    deletePromptPack,
    deleteTask,
    deleteProject,
    updateChunkContent,
    addChunkVersion,
    applyChunkVersion,
    addChunkRunHistory,
    createManualChunk,
    buildChunkImprovePrompt,
    createDebateWorkflow,
    getActiveDebateWorkflow,
    getDebateWorkflow,
    saveDebateRound,
    advanceDebateWorkflow,
    completeDebateWorkflow,
    addMasterPlanVersion,
    createMasterPlanVersionFromDebate,
    applyMasterPlanVersion,
    archiveMasterPlanVersion,
    listMasterPlanVersions,
    prepareRoadmapGeneration,
    addRoadmapVersion,
    addRoadmapVersionForProject,
    applyRoadmapVersion,
    applyRoadmapVersionForProject,
    listRoadmapVersions,
    archiveRoadmapVersion,
    getRoadmapEligibility,
    getRoadmapItemEligibility,
    getNextEligibleRoadmapItem,
    markRoadmapItemInProgress,
    markRoadmapItemDone,
    startRoadmapPrompt,
    createTaskPromptFromRoadmapItem,
    updateTaskPromptContent,
    addTaskPromptVersion,
    applyTaskPromptVersion,
    listTaskPromptVersions,
    prepareTaskImprovePrompt,
    saveTaskImproveResponse,
    approveTaskPrompt,
    copyCodexHandoff,
    markTaskPromptDone,
    approvePrompt,
    copyPromptToCodex,
    copyRoadmapHandoffToCodex,
    markPromptDone
  };
}

module.exports = {
  createVaultStore,
  createEmptyDatabase,
  sanitizeDatabase,
  slugify,
  getProjectFolderName,
  extractFinalPlanTasks,
  extractImplementationTasks,
  toCommitStyleTaskName
};
