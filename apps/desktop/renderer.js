const projectBuilderProtocol = typeof window !== "undefined" && window.copypasteProtocol
  ? window.copypasteProtocol
  : globalThis.NextStepAiProjectBuilderProtocol;
const desktopApi = typeof window !== "undefined" ? window.copypasteDesktop : null;

if (!projectBuilderProtocol) {
  throw new Error("AI Project Builder protocol API is unavailable.");
}

const TRIGGER_WORKFLOW_CHANNEL = "TRIGGER_AI_WORKFLOW";
const RESPONSE_CHANNEL = "AI_RESPONSE_RECEIVED";
const STATUS_CHANNEL = "WORKFLOW_STATUS";
const VAULT_STATE_CHANNEL = "VAULT_STATE_UPDATED";
const VAULT_GET_STATE_CHANNEL = "VAULT_GET_STATE";
const VAULT_GENERATE_PACK_CHANNEL = "VAULT_GENERATE_PACK";
const VAULT_COPY_CHUNK_CHANNEL = "VAULT_COPY_CHUNK";
const VAULT_COPY_LAUNCHER_CHANNEL = "VAULT_COPY_LAUNCHER";
const VAULT_MARK_CHUNK_CHANNEL = "VAULT_MARK_CHUNK";
const VAULT_OPEN_FOLDER_CHANNEL = "VAULT_OPEN_FOLDER";
const VAULT_DELETE_PACK_CHANNEL = "VAULT_DELETE_PACK";
const DEFAULT_PROJECTS_BASE_PATH = "F:\\Projects\\CopyPaste\\Projects";

const elements = {
  chatgptPrefix: null,
  claudePrefix: null,
  currentText: null,
  wordCount: null,
  projectSelect: null,
  newProjectButton: null,
  seeAllProjectsButton: null,
  openProjectFolderButton: null,
  projectName: null,
  projectPath: null,
  defaultProjectsFolder: null,
  saveVaultSettingsButton: null,
  projectIdea: null,
  packTitle: null,
  chunkStrategy: null,
  chunkCount: null,
  gitRemote: null,
  defaultBranch: null,
  branchPrefix: null,
  gitMode: null,
  branchName: null,
  commitMessage: null,
  triggerButton: null,
  saveButton: null,
  refreshExtensionButton: null,
  setupExtensionButton: null,
  connectExtensionButton: null,
  setupToolsButton: null,
  setupToolsPanel: null,
  copyExtensionPathButton: null,
  copyExtensionsUrlButton: null,
  openExtensionFolderButton: null,
  generatePackButton: null,
  refreshVaultButton: null,
  openLatestPackButton: null,
  status: null,
  connectionPill: null,
  connectionText: null,
  readinessText: null,
  statusDetail: null,
  extensionSetupHint: null,
  nextTarget: null,
  currentStage: null,
  currentProvider: null,
  nextProvider: null,
  responseView: null,
  roundHistory: null,
  packList: null,
  projectBrowserTree: null,
  projectContextMenu: null,
  workspaceTaskName: null,
  workspaceTaskStatus: null,
  workspaceTaskContent: null,
  workspaceTaskForm: null,
  workspaceTaskEmpty: null,
  saveWorkspaceTaskButton: null,
  copyWorkspaceTaskButton: null,
  sendWorkspaceTaskButton: null,
  copyWorkspaceLauncherButton: null,
  workspacePromptRunNote: null,
  saveProjectBriefButton: null,
  planPrimaryActionButton: null,
  approvePromptButton: null,
  markPromptDoneButton: null,
  copyCodexHandoffButton: null,
  codexTaskSelector: null,
  inspectorImprovePrompt: null,
  inspectorRunNote: null,
  inspectorVersionsList: null,
  inspectorRunHistoryList: null,
  inspectorImproveForm: null,
  inspectorRunsForm: null,
  inspectorEmptyImprove: null,
  inspectorEmptyRuns: null,
  inspectorDetails: null,
  buildImprovePromptButton: null,
  sendImprovePromptButton: null,
  copyImprovePromptButton: null,
  addRunNoteButton: null,
  workspaceTabs: [],
  inspectorTabs: []
};

let latestVaultState = {
  projects: [],
  promptPacks: [],
  projectsBasePath: DEFAULT_PROJECTS_BASE_PATH
};
let latestWorkflowStatus = {
  message: "Waiting for Chrome extension WebSocket connection...",
  tone: "neutral",
  extensionState: "disconnected",
  nextTarget: "ChatGPT"
};
const drawerState = {
  selectedProjectId: "",
  selectedPackId: "",
  selectedChunkId: "",
  workspaceMode: "plan",
  inspectorTab: "ai",
  activeWorkflowContext: "debate_plan",
  lastImprovePrompt: "",
  activeRoadmapPackId: "",
  activeDebateWorkflowId: "",
  pendingDebatePrompt: null,
  showAllProjects: false
};
const projectDraftState = {
  isActive: false,
  previousAutoPath: "",
  pathManuallyEdited: false
};
const contextMenuState = {
  type: "",
  projectId: "",
  packId: "",
  chunkId: ""
};

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message, tone) {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone || "neutral";
  elements.status.style.display = "block";
}

function normalizeNextTarget(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "claude") {
    return "Claude";
  }

  return "ChatGPT";
}

function normalizeExtensionState(value) {
  const state = String(value || "").trim().toLowerCase();

  if (state === "connected" || state === "loaded" || state === "error") {
    return state;
  }

  return "disconnected";
}

function providerLabel(provider) {
  return String(provider || "").toLowerCase() === "claude" ? "Claude" : "ChatGPT";
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "project";
}

function getProjectFolderName(value) {
  const folderName = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .trim();

  return folderName || "Project";
}

function getProjectsBasePath(basePath) {
  return String(basePath || DEFAULT_PROJECTS_BASE_PATH).trim() || DEFAULT_PROJECTS_BASE_PATH;
}

function getProjectDraftPath(projectName, basePath) {
  return `${getProjectsBasePath(basePath)}\\${getProjectFolderName(projectName)}`;
}

function getDraftCommitFallback(projectName) {
  const trimmed = String(projectName || "").trim();
  return trimmed ? `Initialize ${trimmed}` : "";
}

function syncDraftFieldsFromName(projectName) {
  const trimmedName = String(projectName || "").trim();
  const basePath = elements.defaultProjectsFolder ? elements.defaultProjectsFolder.value : latestVaultState.projectsBasePath;
  const nextPath = getProjectDraftPath(trimmedName || "New Project", basePath);
  const previousAutoPath = projectDraftState.previousAutoPath;
  const currentPath = elements.projectPath ? String(elements.projectPath.value || "") : "";
  const shouldUpdatePath = !projectDraftState.pathManuallyEdited || !currentPath || currentPath === previousAutoPath;

  if (elements.projectPath && shouldUpdatePath) {
    elements.projectPath.value = nextPath;
    projectDraftState.pathManuallyEdited = false;
  }
  projectDraftState.previousAutoPath = nextPath;

  if (elements.packTitle && !elements.packTitle.value.trim()) {
    elements.packTitle.value = trimmedName || "New Project";
  }
  if (elements.branchName && !elements.branchName.value.trim()) {
    elements.branchName.value = `codex/${slugify(trimmedName || "new-project")}`;
  }
  if (elements.commitMessage && !elements.commitMessage.value.trim()) {
    elements.commitMessage.value = getDraftCommitFallback(trimmedName);
  }
}

function getActionableSteps() {
  if (typeof projectBuilderProtocol.listPlanningDebateStages === "function") {
    return projectBuilderProtocol.listPlanningDebateStages();
  }
  return projectBuilderProtocol.listWorkflowSteps().filter((step) => step.actor === "ai");
}

function getStepById(stageId) {
  return projectBuilderProtocol.listWorkflowSteps().find((step) => step.id === stageId) || getActionableSteps()[0];
}

function getNextActionStep(stageId) {
  const steps = getActionableSteps();
  const index = steps.findIndex((step) => step.id === stageId);
  if (index < 0) return steps[0] || null;
  return steps[index + 1] || null;
}

function createRootDebateState(rawIdea) {
  return projectBuilderProtocol.createProjectBuilderDebate({
    title: "AI Project Builder Debate",
    raw_idea: String(rawIdea || "").trim()
  });
}

function getDebateStageView(debate) {
  const safeDebate = debate || createRootDebateState("");
  const currentStep = getStepById(safeDebate.current_stage_id);
  const nextStep = getNextActionStep(safeDebate.current_stage_id);
  const rounds = Array.isArray(safeDebate.rounds) ? safeDebate.rounds : [];

  return {
    currentStage: currentStep ? currentStep.label : "Complete",
    currentProvider: currentStep ? providerLabel(currentStep.provider) : "None",
    currentProviderId: currentStep ? currentStep.provider : "",
    nextProvider: nextStep ? providerLabel(nextStep.provider) : "Complete",
    nextProviderId: nextStep ? nextStep.provider : "",
    roundCount: rounds.length,
    rounds: rounds.map((round) => ({
      number: round.round_number,
      stage: round.stage_label || getStepById(round.stage_id)?.label || round.stage_id,
      provider: providerLabel(round.provider),
      status: round.status || "received",
      response: round.response_received || round.response || ""
    }))
  };
}

function isNoisyPreludeLine(line) {
  const normalized = String(line || "").trim().toLowerCase();
  return normalized === "thinking"
    || normalized === "thinking..."
    || /^thought for\b/.test(normalized);
}

function getCleanPlanLines(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length && isNoisyPreludeLine(lines[0])) {
    lines.shift();
    while (lines.length && !lines[0].trim()) {
      lines.shift();
    }
  }

  return lines;
}

function isSeparatorLine(line) {
  return /^[-*_]{3,}$/.test(String(line || "").trim());
}

function isBulletLine(line) {
  return /^\s*(?:[-*•]|[a-z]\))\s+/i.test(String(line || ""));
}

function stripBulletMarker(line) {
  return String(line || "").trim().replace(/^(?:[-*•]|[a-z]\))\s+/i, "");
}

function isNumberedHeadingLine(line) {
  const trimmed = String(line || "").trim();
  if (!/^\d+\.\s+\S/.test(trimmed)) return false;
  return trimmed.length <= 120;
}

function stripMarkdownEmphasis(line) {
  return String(line || "")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .trim();
}

function isPlainHeadingLine(line) {
  const trimmed = stripMarkdownEmphasis(line);
  if (!trimmed || isBulletLine(trimmed) || isNumberedHeadingLine(trimmed) || isSeparatorLine(trimmed)) {
    return false;
  }
  if (/[:.;,]$/.test(trimmed)) {
    return false;
  }
  if (trimmed.length > 88) {
    return false;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 9) {
    return false;
  }
  return /^[A-Z0-9"']/i.test(trimmed);
}

function isStrongSectionHeadingLine(line) {
  const trimmed = stripMarkdownEmphasis(line);
  return /^(what\b|critical\b|risks?\b|weaknesses\b|regressions\b|persistent\b|new\b|summary\b|net assessment\b|the one\b|identified\b|improvements?\b|gaps?\b|recommendations?\b|open questions?\b|next steps?\b|final\b|project plan\b|implementation\b|acceptance\b|tests?\b)/i.test(trimmed)
    && isPlainHeadingLine(trimmed);
}

function renderInlineMarkdown(value) {
  return escapeHtml(stripMarkdownEmphasis(value));
}

function isPreferredTitleLine(line) {
  const trimmed = stripMarkdownEmphasis(line);
  return /^(critique|review|plan|summary|final|project|implementation|codex|net assessment)\b/i.test(trimmed)
    || /^[^:]{1,64}:\s+\S/.test(trimmed);
}

function findTitleLineIndex(lines) {
  let fallbackIndex = -1;
  let checkedLines = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || isSeparatorLine(trimmed) || isNoisyPreludeLine(trimmed)) {
      continue;
    }

    if (fallbackIndex < 0) {
      fallbackIndex = index;
    }

    if (isPreferredTitleLine(trimmed)) {
      return index;
    }

    checkedLines += 1;
    if (checkedLines >= 4) {
      break;
    }
  }

  return fallbackIndex;
}

function renderProjectPlanHtml(text) {
  const lines = getCleanPlanLines(text);

  if (!lines.some((line) => line.trim())) {
    return '<article class="plan-document plan-document-empty">No plan yet.</article>';
  }

  const html = ['<article class="plan-document">'];
  const titleLineIndex = findTitleLineIndex(lines);
  let listOpen = false;
  let titleRendered = false;
  let implicitListContext = false;
  let lastWasBlank = false;

  function closeList() {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  }

  function openList() {
    if (listOpen) return;
    html.push('<ul class="plan-list">');
    listOpen = true;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      closeList();
      implicitListContext = false;
      lastWasBlank = true;
      continue;
    }

    if (isNoisyPreludeLine(trimmed)) {
      continue;
    }

    if (isSeparatorLine(trimmed)) {
      closeList();
      html.push('<hr class="plan-separator">');
      implicitListContext = false;
      lastWasBlank = true;
      continue;
    }

    if (!titleRendered) {
      closeList();
      if (lineIndex < titleLineIndex) {
        html.push(`<div class="plan-eyebrow">${renderInlineMarkdown(trimmed)}</div>`);
        implicitListContext = false;
        lastWasBlank = false;
        continue;
      }
      html.push(`<h3 class="plan-title">${renderInlineMarkdown(trimmed)}</h3>`);
      titleRendered = true;
      implicitListContext = false;
      lastWasBlank = false;
      continue;
    }

    if (isBulletLine(trimmed)) {
      openList();
      html.push(`<li>${renderInlineMarkdown(stripBulletMarker(trimmed))}</li>`);
      implicitListContext = true;
      lastWasBlank = false;
      continue;
    }

    if (isNumberedHeadingLine(trimmed)) {
      closeList();
      html.push(`<h4 class="plan-numbered-heading">${renderInlineMarkdown(trimmed)}</h4>`);
      implicitListContext = true;
      lastWasBlank = false;
      continue;
    }

    if (implicitListContext && !lastWasBlank && !isStrongSectionHeadingLine(trimmed)) {
      openList();
      html.push(`<li>${renderInlineMarkdown(trimmed)}</li>`);
      lastWasBlank = false;
      continue;
    }

    if (isPlainHeadingLine(trimmed)) {
      closeList();
      html.push(`<h4 class="plan-heading">${renderInlineMarkdown(trimmed)}</h4>`);
      implicitListContext = true;
      lastWasBlank = false;
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    implicitListContext = false;
    lastWasBlank = false;
  }

  closeList();
  html.push("</article>");
  return html.join("");
}

function getRoundPreview(text) {
  return getCleanPlanLines(text)
    .map((line) => line.trim())
    .filter((line) => line && !isSeparatorLine(line))
    .slice(0, 3)
    .map((line) => stripBulletMarker(stripMarkdownEmphasis(line)))
    .join(" - ")
    .slice(0, 180);
}

function createStageWorkflowPayload(debate, prefixes = {}) {
  const prompt = projectBuilderProtocol.createNextDebatePrompt(debate);
  debate.pending_stage_prompt = prompt;
  debate.status = "waiting_response";
  return {
    chatgptPrefix: String(prefixes.chatgptPrefix || ""),
    claudePrefix: String(prefixes.claudePrefix || ""),
    text: prompt.prompt,
    targetProvider: prompt.provider,
    currentStageId: prompt.stage_id,
    currentStageLabel: prompt.stage_label,
    currentRole: prompt.role
  };
}

function applyDebateResponse(debate, responseText) {
  const safeDebate = debate || createRootDebateState("");
  const pendingPrompt = safeDebate.pending_stage_prompt || projectBuilderProtocol.createNextDebatePrompt(safeDebate);
  const savedRound = projectBuilderProtocol.saveDebateRound(safeDebate, {
    stage_id: pendingPrompt.stage_id,
    provider: pendingPrompt.provider,
    role: pendingPrompt.role,
    prompt_sent: pendingPrompt.prompt,
    response_received: String(responseText || ""),
    status: "received"
  });
  delete safeDebate.pending_stage_prompt;
  projectBuilderProtocol.advanceDebateStage(safeDebate);
  return {
    debate: safeDebate,
    savedRound,
    stageView: getDebateStageView(safeDebate)
  };
}

function getWorkflowStatusView(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const message = String(source.message || "");
  const tone = String(source.tone || "neutral");
  const nextTarget = normalizeNextTarget(source.nextTarget);
  const extensionState = normalizeExtensionState(source.extensionState);
  const busy = tone === "busy" || /sending|dispatching/i.test(message);

  if (busy && extensionState === "connected") {
    return {
      connected: true,
      connectionText: "Connected",
      readinessText: "Sending",
      detailText: message,
      nextTarget
    };
  }

  if (extensionState === "connected") {
    return {
      connected: true,
      connectionText: "Connected",
      readinessText: "Ready",
      detailText: `Next send is gated for ${nextTarget}`,
      nextTarget
    };
  }

  if (extensionState === "loaded") {
    return {
      connected: false,
      connectionText: "Extension loaded",
      readinessText: "Waiting",
      detailText: message || "Extension loaded, waiting for WebSocket handshake.",
      nextTarget
    };
  }

  if (extensionState === "error") {
    return {
      connected: false,
      connectionText: "Extension error",
      readinessText: "Error",
      detailText: message || "Click Connect extension. If this is first use, click Setup extension once.",
      nextTarget
    };
  }

  if (extensionState === "disconnected") {
    return {
      connected: false,
      connectionText: "Waiting for extension",
      readinessText: "Waiting",
      detailText: "Install the extension once, then click Connect extension",
      nextTarget
    };
  }

  return {
    connected: false,
    connectionText: "Waiting for extension",
    readinessText: "Ready",
    detailText: message || `Next send is gated for ${nextTarget}`,
    nextTarget
  };
}

function getProviderDisplayList() {
  return [
    { id: "chatgpt", label: "ChatGPT", disabled: false, badge: "Active" },
    { id: "claude", label: "Claude", disabled: false, badge: "Active" },
    { id: "gemini", label: "Gemini", disabled: true, badge: "Future" },
    { id: "grok", label: "Grok", disabled: true, badge: "Future" }
  ];
}

function getNewProjectDraft(defaultPath) {
  return {
    projectName: "",
    projectPath: String(defaultPath || ""),
    packTitle: "",
    branchName: "",
    commitMessage: ""
  };
}

function getSelectedProject() {
  return (latestVaultState.projects || []).find((item) => item.id === drawerState.selectedProjectId) || null;
}

function getActiveDebateWorkflowFromState(projectId) {
  const workflows = Array.isArray(latestVaultState.debateWorkflows) ? latestVaultState.debateWorkflows : [];
  return workflows
    .filter((item) => item.projectId === projectId && item.status !== "complete")
    .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))[0] || null;
}

function debateFromWorkflow(workflow, fallbackRawIdea) {
  const debate = createRootDebateState(fallbackRawIdea || "");
  if (!workflow) {
    return debate;
  }
  debate.current_stage_id = workflow.currentStageId || debate.current_stage_id;
  const rounds = Array.isArray(workflow.rounds) ? workflow.rounds : [];
  debate.rounds = rounds.map((round, index) => ({
    id: round.id || `round_${index + 1}`,
    round_number: index + 1,
    stage_id: round.stageId,
    stage_label: getStepById(round.stageId)?.label || round.stageId,
    provider: round.provider,
    role: round.role,
    prompt_sent: round.promptText || "",
    response_received: round.responseText || "",
    status: round.responseText ? "received" : "waiting_response"
  }));
  return debate;
}

async function ensureProjectDebateWorkflow(projectId) {
  if (!projectId || !desktopApi || typeof desktopApi.getActiveDebateWorkflow !== "function") {
    return null;
  }
  const activeResponse = await desktopApi.getActiveDebateWorkflow({ projectId });
  if (activeResponse && activeResponse.ok !== false && activeResponse.workflow) {
    latestVaultState = activeResponse.state || latestVaultState;
    drawerState.activeDebateWorkflowId = activeResponse.workflow.id;
    return activeResponse.workflow;
  }
  const createdResponse = await desktopApi.createDebateWorkflow({ projectId });
  if (!createdResponse || createdResponse.ok === false || !createdResponse.workflow) {
    throw new Error(createdResponse && createdResponse.error ? createdResponse.error : "Could not create debate workflow.");
  }
  latestVaultState = createdResponse.state || latestVaultState;
  drawerState.activeDebateWorkflowId = createdResponse.workflow.id;
  return createdResponse.workflow;
}

function buildProjectBrowserTree(state) {
  const safeState = state || { projects: [], promptPacks: [] };
  const projects = Array.isArray(safeState.projects) ? [...safeState.projects] : [];
  const packs = Array.isArray(safeState.promptPacks) ? safeState.promptPacks : [];

  return projects
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")))
    .map((project) => {
      const projectPacks = packs
        .filter((pack) => pack.projectId === project.id)
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));

      return {
        id: project.id,
        name: project.name,
        packs: projectPacks.map((pack) => ({
          id: pack.id,
          title: pack.title,
          chunks: (Array.isArray(pack.chunks) ? pack.chunks : [])
            .slice()
            .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
        }))
      };
    });
}

function getVisibleProjectBrowserNodes(nodes, options = {}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const draftProject = options.draftProject || null;
  if (draftProject) {
    return [draftProject];
  }
  if (options.showAllProjects) {
    return safeNodes;
  }
  const selectedProjectId = String(options.selectedProjectId || "");
  if (selectedProjectId) {
    return safeNodes.filter((project) => project.id === selectedProjectId);
  }
  return safeNodes.slice(0, 1);
}

function getSelectedChunk() {
  const packs = Array.isArray(latestVaultState.promptPacks) ? latestVaultState.promptPacks : [];
  const pack = packs.find((item) => item.id === drawerState.selectedPackId);
  if (!pack) {
    return null;
  }
  const chunk = (Array.isArray(pack.chunks) ? pack.chunks : []).find((item) => item.id === drawerState.selectedChunkId);
  if (!chunk) {
    return null;
  }
  return { pack, chunk };
}

function getTaskImprovePayload(chunk, runHistory, promptText) {
  return {
    targetProvider: "chatgpt",
    currentStageId: "task_improve",
    currentStageLabel: "Task Improve",
    currentRole: "planner",
    text: String(promptText || ""),
    taskName: String(chunk && chunk.title || ""),
    taskContent: String(chunk && chunk.prompt || ""),
    runHistory: Array.isArray(runHistory) ? runHistory.map((item) => String(item.note || "")) : []
  };
}

function isEmptyMasterPlanText(value) {
  const text = String(value || "").trim();
  return !text || /^#\s*master plan\s*$/i.test(text);
}

function getMasterPlanActionLabel(masterPlanText) {
  return isEmptyMasterPlanText(masterPlanText) ? "Create Master Plan" : "Improve Master Plan";
}

function updateMasterPlanActionLabel() {
  updatePlanPrimaryAction();
}

function getMasterPlanImprovePayload(input = {}) {
  const projectName = String(input.projectName || "Untitled Project").trim() || "Untitled Project";
  const projectIdea = String(input.projectIdea || "").trim();
  const masterPlan = String(input.masterPlan || "").trim();
  const hasExistingPlan = !isEmptyMasterPlanText(masterPlan);
  const text = [
    "Create a practical master plan for this project.",
    "",
    `Project name: ${projectName}`,
    "",
    "Project idea:",
    projectIdea || "(No project idea provided.)",
    "",
    "Existing master plan:",
    hasExistingPlan ? masterPlan : "(No useful master plan yet.)",
    "",
    "Return a complete master plan in Markdown with:",
    "- clear goal and success criteria",
    "- project architecture and major parts",
    "- task roadmap in execution order",
    "- testing and verification plan",
    "- risks, assumptions, and next actions",
    "",
    "Do not return commentary about this request. Return only the master plan."
  ].join("\n");

  return {
    targetProvider: "chatgpt",
    currentStageId: "master_plan",
    currentStageLabel: "Master Plan",
    currentRole: "planner",
    text
  };
}

function getTaskRoadmapPayload(input = {}) {
  const projectName = String(input.projectName || "Untitled Project").trim() || "Untitled Project";
  const projectPath = String(input.projectPath || "").trim();
  const projectIdea = String(input.projectIdea || "").trim();
  const masterPlan = String(input.masterPlan || "").trim();
  return {
    targetProvider: "chatgpt",
    currentStageId: "task_roadmap",
    currentStageLabel: "Task Roadmap",
    currentRole: "planner",
    text: [
      "Turn this master plan into an executable Codex task roadmap.",
      "",
      `Project name: ${projectName}`,
      projectPath ? `Project path: ${projectPath}` : "",
      "",
      "Project idea:",
      projectIdea || "(No project idea provided.)",
      "",
      "Master plan:",
      masterPlan || "(No master plan provided.)",
      "",
      "Return JSON only. No Markdown fences, no commentary.",
      "Use this exact shape:",
      "{\"items\":[{\"id\":\"roadmap_1\",\"order\":1,\"title\":\"Short task title\",\"goal\":\"Concrete implementation goal\",\"whyThisExists\":\"Why this task matters\",\"targetFiles\":[\"relative/or/absolute/path\"],\"researchNeeded\":[\"what to inspect first\"],\"acceptanceCriteria\":[\"observable done condition\"],\"verificationCommands\":[\"npm.cmd run desktop:test\"],\"dependsOn\":[],\"parallelGroup\":\"\"}]}",
      "",
      "Rules:",
      "- Keep each item small enough for one focused Codex run.",
      "- Use dependsOn ids for serial dependencies.",
      "- Use the same non-empty parallelGroup for items that can run in parallel.",
      "- Include verification commands for each task."
    ].filter((line) => line !== "").join("\n")
  };
}

function getNextEligibleRoadmapItem(pack = {}) {
  const items = pack.roadmap && Array.isArray(pack.roadmap.items) ? pack.roadmap.items : [];
  const chunks = Array.isArray(pack.chunks) ? pack.chunks : [];
  const doneRoadmapIds = chunks
    .filter((chunk) => chunk.status === "done" && chunk.roadmapItemId)
    .map((chunk) => chunk.roadmapItemId);
  const startedRoadmapIds = chunks
    .filter((chunk) => chunk.roadmapItemId)
    .map((chunk) => chunk.roadmapItemId);

  return items
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .find((item) => {
      if (!item || startedRoadmapIds.includes(item.id)) return false;
      const blockedBy = (Array.isArray(item.dependsOn) ? item.dependsOn : [])
        .filter((dependencyId) => !doneRoadmapIds.includes(dependencyId));
      return blockedBy.length === 0;
    }) || null;
}

function getLatestMasterPlanDraftVersion(project) {
  const versions = Array.isArray(project && project.masterPlanVersions) ? project.masterPlanVersions : [];
  return versions
    .filter((item) => !item.appliedAt)
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))[0] || null;
}

function getPlanPrimaryAction(input = {}) {
  const project = input.project || {};
  const pack = input.pack || null;
  const projectIdea = String(input.projectIdea || project.idea || "").trim();
  const masterPlan = String(input.masterPlanText || project.masterPlan || "").trim();
  const draftMasterPlan = getLatestMasterPlanDraftVersion(project);

  if (draftMasterPlan) {
    return {
      id: "apply_master_plan",
      label: "Apply Master Plan",
      enabled: true,
      handler: "applyMasterPlanDraft",
      roadmapItemId: ""
    };
  }

  if (isEmptyMasterPlanText(masterPlan)) {
    return {
      id: "master_plan",
      label: "Create Master Plan",
      enabled: Boolean(projectIdea),
      handler: "improveMasterPlan",
      roadmapItemId: ""
    };
  }

  const roadmapItems = pack && pack.roadmap && Array.isArray(pack.roadmap.items) ? pack.roadmap.items : [];
  if (!roadmapItems.length) {
    return {
      id: "roadmap",
      label: "Create Task Roadmap",
      enabled: true,
      handler: "createTaskRoadmap",
      roadmapItemId: ""
    };
  }

  const nextItem = getNextEligibleRoadmapItem(pack);
  if (nextItem) {
    const order = String(Number(nextItem.order) || roadmapItems.indexOf(nextItem) + 1).padStart(3, "0");
    const title = String(nextItem.title || "Untitled task").trim() || "Untitled task";
    return {
      id: "start_task",
      label: `Create Task ${order}: ${title}`,
      enabled: true,
      handler: "startNextTask",
      roadmapItemId: nextItem.id
    };
  }

  return {
    id: "blocked",
    label: "No Roadmap Tasks Ready",
    enabled: false,
    handler: "",
    roadmapItemId: ""
  };
}

function getSelectedPlanProjectAndPack() {
  const project = (latestVaultState.projects || []).find((item) => item.id === drawerState.selectedProjectId)
    || null;
  const pack = project
    ? (latestVaultState.promptPacks || []).find((item) => item.id === project.activePromptPackId)
      || (latestVaultState.promptPacks || []).find((item) => item.projectId === project.id)
      || null
    : null;
  return { project, pack };
}

function updatePlanPrimaryAction() {
  if (!elements.planPrimaryActionButton) {
    return;
  }
  const selected = getSelectedPlanProjectAndPack();
  const action = getPlanPrimaryAction({
    project: selected.project,
    pack: selected.pack,
    projectIdea: elements.projectIdea ? elements.projectIdea.value : "",
    masterPlanText: elements.currentText ? elements.currentText.value : ""
  });
  elements.planPrimaryActionButton.textContent = action.label;
  elements.planPrimaryActionButton.dataset.planAction = action.id;
  elements.planPrimaryActionButton.dataset.handler = action.handler;
  elements.planPrimaryActionButton.dataset.roadmapItemId = action.roadmapItemId;
  elements.planPrimaryActionButton.dataset.planDisabled = action.enabled ? "false" : "true";
  elements.planPrimaryActionButton.disabled = !action.enabled;
}

function renderProjectBrowserTree() {
  if (!elements.projectBrowserTree) {
    return;
  }

  const allNodes = buildProjectBrowserTree(latestVaultState);
  const draftName = elements.projectName ? String(elements.projectName.value || "New Project").trim() || "New Project" : "New Project";
  const nodes = getVisibleProjectBrowserNodes(allNodes, {
    selectedProjectId: drawerState.selectedProjectId,
    showAllProjects: drawerState.showAllProjects,
    draftProject: projectDraftState.isActive ? { id: "__draft__", name: draftName, packs: [], stage: "Idea", nextAction: "Save project" } : null
  });
  if (!nodes.length) {
    elements.projectBrowserTree.innerHTML = '<div class="drawer-empty">No tasks generated yet.</div>';
    return;
  }

  elements.projectBrowserTree.innerHTML = nodes.map((project) => {
    const projectActive = drawerState.selectedProjectId === project.id ? " active" : "";
    const packsHtml = project.packs.map((pack) => {
      const packActive = drawerState.selectedPackId === pack.id ? " active" : "";
      const roadmap = pack.roadmap && Array.isArray(pack.roadmap.items) ? pack.roadmap.items : [];
      const serialItems = roadmap.filter((item) => !item.parallelGroup);
      const parallelItems = roadmap.filter((item) => item.parallelGroup);
      const serialHtml = serialItems.length
        ? `<button type="button" class="tree-pack" data-action="select-tree-pack" data-project-id="${escapeHtml(project.id)}" data-pack-id="${escapeHtml(pack.id)}">Serial</button>${serialItems.map((item) => `<button type="button" class="tree-item" data-action="select-roadmap-item" data-project-id="${escapeHtml(project.id)}" data-pack-id="${escapeHtml(pack.id)}" data-roadmap-item-id="${escapeHtml(item.id)}"><span>${String(item.order).padStart(3, "0")} ${escapeHtml(item.title)}</span></button>`).join("")}`
        : "";
      const parallelHtml = parallelItems.length
        ? `<button type="button" class="tree-pack" data-action="select-tree-pack" data-project-id="${escapeHtml(project.id)}" data-pack-id="${escapeHtml(pack.id)}">Parallel</button>${parallelItems.map((item) => `<button type="button" class="tree-item" data-action="select-roadmap-item" data-project-id="${escapeHtml(project.id)}" data-pack-id="${escapeHtml(pack.id)}" data-roadmap-item-id="${escapeHtml(item.id)}"><span>${String(item.order).padStart(3, "0")} ${escapeHtml(item.title)}</span></button>`).join("")}`
        : "";
      const chunksHtml = pack.chunks.map((chunk) => {
        const status = String(chunk.status || "ready");
        const statusLabel = getTaskStatusLabel(status);
        const isActive = drawerState.selectedChunkId === chunk.id ? " active" : "";
        return `<button type="button" class="tree-item${isActive}" data-action="select-tree-chunk" data-project-id="${escapeHtml(project.id)}" data-pack-id="${escapeHtml(pack.id)}" data-chunk-id="${escapeHtml(chunk.id)}">
          <span>[${String(chunk.order).padStart(3, "0")}] ${escapeHtml(chunk.title)}</span>
          <span class="status-pill ${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
        </button>`;
      }).join("");

      return `<button type="button" class="tree-pack${packActive}" data-action="select-tree-pack" data-project-id="${escapeHtml(project.id)}" data-pack-id="${escapeHtml(pack.id)}">Task Roadmap</button>${serialHtml}${parallelHtml}<button type="button" class="tree-pack${packActive}" data-action="select-tree-pack" data-project-id="${escapeHtml(project.id)}" data-pack-id="${escapeHtml(pack.id)}">Tasks</button>${chunksHtml}`;
    }).join("");

    const stage = escapeHtml(project.stage || "Idea");
    const nextAction = escapeHtml(project.nextAction || "Capture project idea");
    const draftAttr = project.id === "__draft__" ? " data-draft-project=\"true\"" : "";
    return `<button type="button" class="tree-project${projectActive}" data-action="select-tree-project" data-project-id="${escapeHtml(project.id)}"${draftAttr}>${escapeHtml(project.name)}<br><span class="muted">Stage: ${stage}</span><br><span class="muted">Next: ${nextAction}</span></button><button type="button" class="tree-pack" data-action="select-master-plan" data-project-id="${escapeHtml(project.id)}"${draftAttr}>Master Plan</button>${packsHtml}`;
  }).join("");
}

function getStatusOption(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "done" || normalized === "copied" || normalized === "in_progress" || normalized === "approved") {
    return normalized;
  }
  return "in_progress";
}

function renderWorkspace() {
  const selected = getSelectedChunk();
  const hasSelection = Boolean(selected);
  const project = (latestVaultState.projects || []).find((item) => item.id === drawerState.selectedProjectId)
    || (projectDraftState.isActive ? null : (latestVaultState.projects || [])[0]);

  if (elements.workspaceTaskForm) elements.workspaceTaskForm.style.display = hasSelection ? "block" : "none";
  if (elements.workspaceTaskEmpty) elements.workspaceTaskEmpty.style.display = hasSelection ? "none" : "block";
  if (project) {
    projectDraftState.isActive = false;
    if (elements.projectName) elements.projectName.value = project.name || "";
    if (elements.projectPath) elements.projectPath.value = project.path || "";
    if (elements.projectIdea) elements.projectIdea.value = project.idea || "";
    if (elements.currentText && !elements.currentText.value) elements.currentText.value = project.masterPlan || "";
  } else if (projectDraftState.isActive) {
    if (elements.projectName && !elements.projectName.value) elements.projectName.value = "New Project";
    if (elements.projectPath && !elements.projectPath.value) elements.projectPath.value = getProjectDraftPath("New Project", latestVaultState.projectsBasePath);
  } else if (elements.projectPath && !elements.projectPath.value) {
    elements.projectPath.value = getProjectsBasePath(latestVaultState.projectsBasePath);
  }

  document.querySelectorAll("[data-workspace-panel]").forEach((node) => {
    node.classList.toggle("active", node.getAttribute("data-workspace-panel") === drawerState.workspaceMode);
  });
  document.querySelectorAll("[data-workspace-tab]").forEach((node) => {
    node.classList.toggle("active", node.getAttribute("data-workspace-tab") === drawerState.workspaceMode);
  });

  if (!selected) {
    return;
  }

  const chunk = selected.chunk;
  if (elements.workspaceTaskName) elements.workspaceTaskName.value = String(chunk.title || "");
  if (elements.workspaceTaskContent) elements.workspaceTaskContent.value = String(chunk.prompt || "");
  if (elements.workspaceTaskStatus) elements.workspaceTaskStatus.value = getStatusOption(chunk.status);
}

function renderInspector() {
  const selected = getSelectedChunk();
  const hasSelection = Boolean(selected);
  const sectionName = drawerState.inspectorTab;

  if (elements.inspectorImproveForm) elements.inspectorImproveForm.style.display = hasSelection ? "block" : "none";
  if (elements.inspectorRunsForm) elements.inspectorRunsForm.style.display = hasSelection ? "block" : "none";
  if (elements.inspectorEmptyImprove) elements.inspectorEmptyImprove.style.display = hasSelection ? "none" : "block";
  if (elements.inspectorEmptyRuns) elements.inspectorEmptyRuns.style.display = hasSelection ? "none" : "block";

  document.querySelectorAll("[data-inspector-section]").forEach((node) => {
    node.classList.toggle("active", node.getAttribute("data-inspector-section") === sectionName);
  });
  document.querySelectorAll("[data-inspector-tab]").forEach((node) => {
    node.classList.toggle("active", node.getAttribute("data-inspector-tab") === sectionName);
  });

  if (!selected) {
    if (elements.inspectorVersionsList) elements.inspectorVersionsList.innerHTML = '<div class="muted">No versions yet.</div>';
    if (elements.inspectorRunHistoryList) elements.inspectorRunHistoryList.innerHTML = '<div class="muted">No run history yet.</div>';
    if (elements.inspectorDetails) elements.inspectorDetails.innerHTML = "Select a project item to view details.";
    return;
  }

  const chunk = selected.chunk;
  if (elements.inspectorImprovePrompt) elements.inspectorImprovePrompt.value = drawerState.lastImprovePrompt || "";

  const versions = Array.isArray(chunk.versions) ? chunk.versions : [];
  if (elements.inspectorVersionsList) {
    elements.inspectorVersionsList.innerHTML = versions.length
      ? versions.map((version) => `<div class="list-item">
          <div><strong>${escapeHtml(version.source || "ai_improve")}</strong> | ${escapeHtml(version.createdAt || "")}</div>
          <div class="field-help">${escapeHtml(String(version.responseText || "").slice(0, 160))}</div>
          <div class="actions" style="margin-top:6px;">
            <button type="button" class="secondary-btn compact-btn" data-action="apply-version" data-pack-id="${escapeHtml(selected.pack.id)}" data-chunk-id="${escapeHtml(chunk.id)}" data-version-id="${escapeHtml(version.id)}">Apply</button>
          </div>
        </div>`).join("")
      : '<div class="muted">No versions yet.</div>';
  }

  const runHistory = Array.isArray(chunk.runHistory) ? chunk.runHistory : [];
  if (elements.inspectorRunHistoryList) {
    elements.inspectorRunHistoryList.innerHTML = runHistory.length
      ? runHistory.map((item) => `<div class="list-item"><strong>${escapeHtml(item.createdAt || "")}</strong><div>${escapeHtml(item.note || "")}</div></div>`).join("")
      : '<div class="muted">No run history yet.</div>';
  }

  if (elements.inspectorDetails) {
    elements.inspectorDetails.innerHTML = `<strong>${escapeHtml(chunk.title || "")}</strong><br>${escapeHtml(getTaskStatusLabel(chunk.status || "ready"))}<br>${escapeHtml(selected.pack.title || "")}`;
  }
}

function renderWorkflowStatus() {
  const view = getWorkflowStatusView(latestWorkflowStatus);

  if (elements.connectionPill) {
    elements.connectionPill.dataset.connected = view.connected ? "true" : "false";
  }

  if (elements.connectionText) {
    elements.connectionText.textContent = view.connectionText;
  }

  if (elements.readinessText) {
    elements.readinessText.textContent = view.readinessText;
  }

  if (elements.statusDetail) {
    elements.statusDetail.textContent = view.detailText;
  }

  if (elements.nextTarget) {
    elements.nextTarget.textContent = view.nextTarget;
  }

  if (elements.extensionSetupHint) {
    elements.extensionSetupHint.style.display = view.connected ? "none" : "block";
  }
}

function toggleSetupToolsPanel() {
  if (!elements.setupToolsPanel) {
    return;
  }

  const isOpen = elements.setupToolsPanel.dataset.open === "true";
  elements.setupToolsPanel.dataset.open = isOpen ? "false" : "true";
}

function renderDebateState() {
  const project = getSelectedProject();
  const workflow = project ? getActiveDebateWorkflowFromState(project.id) : null;
  if (workflow) {
    drawerState.activeDebateWorkflowId = workflow.id;
  }
  const debate = debateFromWorkflow(workflow, elements.currentText ? elements.currentText.value : "");
  const view = getDebateStageView(debate);

  if (elements.currentStage) elements.currentStage.textContent = view.currentStage;
  if (elements.currentProvider) elements.currentProvider.textContent = view.currentProvider;
  if (elements.nextProvider) elements.nextProvider.textContent = view.nextProvider;

  if (elements.roundHistory) {
    if (!view.rounds.length) {
      elements.roundHistory.innerHTML = '<div class="history-empty">No rounds saved yet.</div>';
    } else {
      elements.roundHistory.innerHTML = view.rounds.map((round) => `
          <div class="round-item">
          <div class="round-title">Round ${escapeHtml(round.number)} - ${escapeHtml(round.stage)} - ${escapeHtml(round.provider)}</div>
          <div class="round-subtitle">${escapeHtml(getRoundPreview(round.response)) || "Response saved."}</div>
        </div>
      `).join("");
    }
  }

  latestWorkflowStatus = {
    ...latestWorkflowStatus,
    nextTarget: view.currentProvider
  };
  renderWorkflowStatus();
}

function setBusy(isBusy) {
  elements.triggerButton.disabled = isBusy;
  elements.saveButton.disabled = isBusy;
  if (elements.refreshExtensionButton) {
    elements.refreshExtensionButton.disabled = isBusy;
  }
  if (elements.setupExtensionButton) {
    elements.setupExtensionButton.disabled = isBusy;
  }
  if (elements.connectExtensionButton) {
    elements.connectExtensionButton.disabled = isBusy;
  }
  if (elements.copyExtensionPathButton) {
    elements.copyExtensionPathButton.disabled = isBusy;
  }
  if (elements.copyExtensionsUrlButton) {
    elements.copyExtensionsUrlButton.disabled = isBusy;
  }
  if (elements.openExtensionFolderButton) {
    elements.openExtensionFolderButton.disabled = isBusy;
  }
  if (elements.setupToolsButton) {
    elements.setupToolsButton.disabled = isBusy;
  }
  if (elements.planPrimaryActionButton) {
    elements.planPrimaryActionButton.disabled = isBusy || elements.planPrimaryActionButton.dataset.planDisabled === "true";
  }
}

function setVaultBusy(isBusy) {
  elements.generatePackButton.disabled = isBusy;
  elements.refreshVaultButton.disabled = isBusy;
  elements.openLatestPackButton.disabled = isBusy;
  if (elements.saveProjectBriefButton) {
    elements.saveProjectBriefButton.disabled = isBusy;
  }
  if (elements.planPrimaryActionButton) {
    elements.planPrimaryActionButton.disabled = isBusy || elements.planPrimaryActionButton.dataset.planDisabled === "true";
  }
}

function resetActionButtons() {
  setBusy(false);
  setVaultBusy(false);
}

function getWorkflowPayload() {
  const project = getSelectedProject();
  const workflow = project ? getActiveDebateWorkflowFromState(project.id) : null;
  const debate = debateFromWorkflow(workflow, elements.currentText.value);
  const payload = createStageWorkflowPayload(debate, {
    chatgptPrefix: elements.chatgptPrefix.value,
    claudePrefix: elements.claudePrefix.value
  });
  drawerState.pendingDebatePrompt = {
    stageId: payload.currentStageId,
    provider: payload.targetProvider,
    role: payload.currentRole,
    promptText: payload.text
  };
  return payload;
}

function getVaultPayload() {
  return {
    projectId: elements.projectSelect.value,
    projectName: elements.projectName.value,
    projectPath: elements.projectPath.value,
    title: elements.packTitle.value,
    sourceText: elements.currentText.value,
    chunkStrategy: elements.chunkStrategy.value,
    chunkCount: elements.chunkCount.value,
    gitMode: elements.gitMode.value,
    branchName: elements.branchName.value,
    commitMessage: elements.commitMessage.value,
    git: {
      remote: elements.gitRemote.value,
      defaultBranch: elements.defaultBranch.value,
      branchPrefix: elements.branchPrefix.value
    }
  };
}

function renderStatus(payload) {
  const message = payload && typeof payload === "object"
    ? String(payload.message || "")
    : String(payload || "");
  const tone = payload && typeof payload === "object"
    ? String(payload.tone || "neutral")
    : "neutral";
  const extensionState = payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "extensionState")
    ? normalizeExtensionState(payload.extensionState)
    : normalizeExtensionState(latestWorkflowStatus.extensionState);
  const project = getSelectedProject();
  const workflow = project ? getActiveDebateWorkflowFromState(project.id) : null;
  const debateProvider = getDebateStageView(debateFromWorkflow(workflow, elements.currentText ? elements.currentText.value : "")).currentProvider;
  const nextTarget = payload && typeof payload === "object"
    ? normalizeNextTarget(debateProvider || payload.nextTarget || latestWorkflowStatus.nextTarget)
    : latestWorkflowStatus.nextTarget;

  if (!message) {
    return;
  }

  latestWorkflowStatus = {
    message,
    tone,
    extensionState,
    nextTarget
  };
  renderWorkflowStatus();
  setStatus(message, tone);

  if (tone === "error" || tone === "success") {
    setBusy(false);
    setVaultBusy(false);
  }
}

async function triggerWorkflowStep() {
  const project = getSelectedProject();
  if (!project) {
    setStatus("Select and save a project before starting debate.", "error");
    return;
  }
  if (!elements.currentText.value.trim() && !(project.idea || "").trim()) {
    setStatus("Project idea / working plan is empty. Add text before sending.", "error");
    return;
  }
  await ensureProjectDebateWorkflow(project.id);

  const payload = getWorkflowPayload();
  const workflow = getActiveDebateWorkflowFromState(project.id);
  const view = getDebateStageView(debateFromWorkflow(workflow, elements.currentText.value || project.idea || ""));
  setBusy(true);
  latestWorkflowStatus = {
    message: `Sending ${view.currentStage} to ${view.currentProvider}...`,
    tone: "busy",
    extensionState: normalizeExtensionState(latestWorkflowStatus.extensionState),
    nextTarget: view.currentProvider
  };
  renderWorkflowStatus();
  renderDebateState();
  setStatus("Sending prompt to extension. Continue manually after the response returns.", "busy");
  try {
    const response = await desktopApi.sendWorkflow(payload);
    if (!response || response.ok === false) {
      const extensionState = normalizeExtensionState(response && response.extensionState);
      const message = response && response.error
        ? response.error
        : extensionState === "loaded"
          ? "Extension is loaded but not connected. Click Connect extension, wait for Connected, then retry."
          : "Chrome extension WebSocket client is not connected.";

      latestWorkflowStatus = {
        message,
        tone: "error",
        extensionState,
        nextTarget: view.currentProvider
      };
      renderWorkflowStatus();
      setStatus(message, "error");
      setBusy(false);
    }
  } catch (error) {
    latestWorkflowStatus = {
      message: error.message,
      tone: "error",
      extensionState: "error",
      nextTarget: view.currentProvider
    };
    renderWorkflowStatus();
    setStatus(error.message, "error");
    setBusy(false);
  }
}

function updateWordCount() {
  if (!elements.wordCount || !elements.currentText) {
    return;
  }

  const words = elements.currentText.value.trim().split(/\s+/).filter(Boolean).length;
  elements.wordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;
  updateMasterPlanActionLabel();
}

function saveFinalText() {
  const text = elements.currentText.value;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "ai_final_output.txt";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Final text saved from renderer.", "success");
}

async function renderResponse(text) {
  if (drawerState.activeWorkflowContext === "master_plan") {
    const normalizedText = String(text || "").trim();
    if (normalizedText) {
      if (elements.currentText) elements.currentText.value = normalizedText;
      updateWordCount();
      if (drawerState.selectedProjectId) {
        desktopApi.addMasterPlanVersion({
          projectId: drawerState.selectedProjectId,
          source: "ai_master_plan",
          promptSnapshot: drawerState.lastImprovePrompt,
          responseText: normalizedText
        }).then((response) => {
          if (response && response.ok !== false) {
            return desktopApi.applyMasterPlanVersion({
              projectId: drawerState.selectedProjectId,
              versionId: response.version.id
            });
          }
          return response;
        }).then((response) => {
          if (response && response.ok !== false) {
            renderVaultState(response.state);
          }
          return response;
        }).catch((error) => {
          setStatus(error.message || "Could not save master plan version.", "error");
        });
      }
      setStatus("Master plan received. Review it, then save the project or create the task roadmap.", "success");
    }
    drawerState.activeWorkflowContext = "debate_plan";
    drawerState.lastImprovePrompt = "";
    return;
  }

  if (drawerState.activeWorkflowContext === "roadmap") {
    const responseText = String(text || "").trim();
    const packId = drawerState.activeRoadmapPackId;
    if (!responseText || !packId) {
      drawerState.activeWorkflowContext = "debate_plan";
      drawerState.activeRoadmapPackId = "";
      setBusy(false);
      setStatus("Roadmap response was empty or no active project pack exists.", "error");
      return;
    }
    const versionResponse = await desktopApi.addRoadmapVersion({
      packId,
      source: "ai_task_roadmap",
      promptSnapshot: drawerState.lastImprovePrompt,
      responseText
    });
    if (!versionResponse || versionResponse.ok === false) {
      throw new Error(versionResponse && versionResponse.error ? versionResponse.error : "Could not save task roadmap version.");
    }
    const applyResponse = await desktopApi.applyRoadmapVersion({
      packId,
      versionId: versionResponse.version.id
    });
    if (!applyResponse || applyResponse.ok === false) {
      throw new Error(applyResponse && applyResponse.error ? applyResponse.error : "Could not apply task roadmap.");
    }
    drawerState.activeWorkflowContext = "debate_plan";
    drawerState.activeRoadmapPackId = "";
    drawerState.lastImprovePrompt = "";
    renderVaultState(applyResponse.state);
    setBusy(false);
    setStatus("Task roadmap created. Use the primary Plan action to create the first Codex task.", "success");
    return;
  }

  if (drawerState.activeWorkflowContext === "task_improve") {
    const selected = getSelectedChunk();
    if (selected) {
      desktopApi.addChunkVersion({
        packId: selected.pack.id,
        chunkId: selected.chunk.id,
        source: "ai_improve",
        promptSnapshot: drawerState.lastImprovePrompt,
        responseText: String(text || "")
      }).then((response) => {
        if (response && response.ok !== false) {
          renderVaultState(response.state);
          setStatus("AI improve response saved as proposed version.", "success");
        }
      }).catch((error) => {
        setStatus(error.message || "Could not save AI improve response.", "error");
      });
    }
    drawerState.activeWorkflowContext = "debate_plan";
    setBusy(false);
    return;
  }

  const normalizedText = String(text || "");
  const workflowId = drawerState.activeDebateWorkflowId;
  if (!workflowId) {
    throw new Error("No active debate workflow exists for this project.");
  }
  const pending = drawerState.pendingDebatePrompt || {};
  const wasFinalSynthesis = pending.stageId === "gpt_final_synthesis";
  const savedResponse = await desktopApi.saveDebateRound({
    workflowId,
    stageId: pending.stageId || "",
    provider: pending.provider || "",
    role: pending.role || "",
    promptText: pending.promptText || "",
    responseText: normalizedText
  });
  if (!savedResponse || savedResponse.ok === false) {
    throw new Error(savedResponse && savedResponse.error ? savedResponse.error : "Could not save debate round.");
  }
  let stateAfterRound = savedResponse.state;
  let createdMasterPlanFromDebate = false;
  if (wasFinalSynthesis && savedResponse.round && savedResponse.round.id) {
    const createdVersionResponse = await desktopApi.createMasterPlanVersionFromDebate({
      workflowId,
      roundId: savedResponse.round.id
    });
    if (!createdVersionResponse || createdVersionResponse.ok === false) {
      throw new Error(createdVersionResponse && createdVersionResponse.error ? createdVersionResponse.error : "Could not create master plan draft from final synthesis.");
    }
    stateAfterRound = createdVersionResponse.state || stateAfterRound;
    createdMasterPlanFromDebate = true;
  }
  if (normalizedText.trim()) {
    const advancedResponse = await desktopApi.advanceDebateWorkflow({ workflowId });
    if (!advancedResponse || advancedResponse.ok === false) {
      throw new Error(advancedResponse && advancedResponse.error ? advancedResponse.error : "Could not advance debate workflow.");
    }
    stateAfterRound = advancedResponse.state;
  }
  latestVaultState = stateAfterRound || latestVaultState;
  drawerState.pendingDebatePrompt = null;
  const project = getSelectedProject();
  const workflow = project ? getActiveDebateWorkflowFromState(project.id) : null;
  const stageView = getDebateStageView(debateFromWorkflow(workflow, elements.currentText.value));

  elements.currentText.value = normalizedText;
  elements.responseView.innerHTML = renderProjectPlanHtml(normalizedText);
  updateWordCount();
  setBusy(false);
  latestWorkflowStatus = {
    message: "AI response received. Ready for next step.",
    tone: "success",
    extensionState: "connected",
    nextTarget: stageView.currentProvider
  };
  renderDebateState();
  renderWorkflowStatus();
  if (createdMasterPlanFromDebate) {
    setStatus("Master plan draft ready. Click Apply Master Plan to persist it.", "success");
  } else {
    setStatus("AI response received. Review it, then send the next gated step or generate Codex tasks.", "success");
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTaskStatusLabel(status) {
  const normalized = String(status || "ready");
  const labels = {
    copied: "Copied",
    launcher_copied: "Copied",
    in_progress: "In Progress",
    approved: "Approved",
    done: "Done",
    ready: "In Progress",
    draft: "In Progress"
  };

  return labels[normalized] || normalized;
}

function getGitModeLabel(gitMode) {
  const labels = {
    every_chunk: "Commit per task",
    final_only: "Commit on final task",
    none: "No Codex git action"
  };

  return labels[String(gitMode || "")] || "Commit per task";
}

function renderProjectSelect(projects) {
  const currentValue = elements.projectSelect.value;
  elements.projectSelect.innerHTML = '<option value="">New project / manual entry</option><option value="__all__">See all projects</option>' + projects.map((project) => (
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)} - ${escapeHtml(project.path)}</option>`
  )).join("");

  if (projects.some((project) => project.id === currentValue)) {
    elements.projectSelect.value = currentValue;
  } else if (currentValue === "__all__" || drawerState.showAllProjects) {
    elements.projectSelect.value = "__all__";
  } else if (drawerState.selectedProjectId && projects.some((project) => project.id === drawerState.selectedProjectId)) {
    elements.projectSelect.value = drawerState.selectedProjectId;
  }
}

function applyProject(projectId) {
  if (String(projectId || "") === "__all__") {
    projectDraftState.isActive = false;
    drawerState.showAllProjects = true;
    drawerState.selectedProjectId = "";
    drawerState.selectedPackId = "";
    drawerState.selectedChunkId = "";
    renderProjectBrowserTree();
    renderWorkspace();
    renderInspector();
    setStatus("Showing all saved projects.", "neutral");
    return;
  }

  const project = (latestVaultState.projects || []).find((item) => item.id === projectId);

  if (!project) {
    startNewProjectDraft();
    return;
  }

  drawerState.showAllProjects = false;
  drawerState.selectedProjectId = project.id;
  drawerState.selectedPackId = "";
  drawerState.selectedChunkId = "";
  projectDraftState.isActive = false;
  projectDraftState.pathManuallyEdited = false;
  projectDraftState.previousAutoPath = "";
  elements.projectName.value = project.name || "";
  elements.projectPath.value = project.path || "";
  if (elements.projectIdea) elements.projectIdea.value = project.idea || "";
  if (elements.currentText) elements.currentText.value = project.masterPlan || "";
  elements.gitRemote.value = project.git && project.git.remote ? project.git.remote : "origin";
  elements.defaultBranch.value = project.git && project.git.defaultBranch ? project.git.defaultBranch : "main";
  elements.branchPrefix.value = project.git && project.git.branchPrefix ? project.git.branchPrefix : "codex/";
  elements.gitMode.value = project.defaults && project.defaults.gitMode ? project.defaults.gitMode : "every_chunk";
  elements.chunkStrategy.value = project.defaults && project.defaults.chunkStrategy ? project.defaults.chunkStrategy : "simple_3";
  elements.chunkCount.value = project.defaults && project.defaults.chunkCount ? String(project.defaults.chunkCount) : "3";
  elements.commitMessage.value = project.defaults && project.defaults.commitMessage ? project.defaults.commitMessage : "";
  renderProjectBrowserTree();
  renderWorkspace();
  renderInspector();
  updateWordCount();
  updatePlanPrimaryAction();
  ensureProjectDebateWorkflow(project.id)
    .then(() => {
      renderDebateState();
    })
    .catch((error) => setStatus(error.message, "error"));
}

function renderVaultState(state) {
  latestVaultState = state || {
    projects: [],
    promptPacks: []
  };

  const packs = Array.isArray(latestVaultState.promptPacks) ? latestVaultState.promptPacks : [];
  const projects = Array.isArray(latestVaultState.projects) ? latestVaultState.projects : [];
  if (elements.defaultProjectsFolder) {
    elements.defaultProjectsFolder.value = getProjectsBasePath(latestVaultState.projectsBasePath);
  }
  const hasChunks = packs.some((pack) => Array.isArray(pack.chunks) && pack.chunks.length > 0);
  if (!drawerState.selectedChunkId && !drawerState.selectedPackId) {
    drawerState.workspaceMode = hasChunks ? "tasks" : "plan";
  }

  renderProjectSelect(projects);
  renderProjectBrowserTree();
  renderWorkspace();
  renderInspector();
  updateMasterPlanActionLabel();
  setVaultBusy(false);

  if (packs.length === 0) {
    elements.packList.innerHTML = "<div class=\"pack-card\">No tasks generated yet.</div>";
    return;
  }

  const latestPack = packs[0];
  const olderPacks = packs.slice(1);
  const latestProject = projects.find((item) => item.id === latestPack.projectId);
  const latestTasks = Array.isArray(latestPack.chunks) ? latestPack.chunks : [];
  const taskHtml = latestTasks.map((task) => {
    const statusLabel = getTaskStatusLabel(task.status);
    const copiedClass = task.status === "launcher_copied" || task.status === "copied" ? " is-copied" : "";

    return `
      <div class="task-card${copiedClass}">
        <div>
          <div class="task-title">
            <span>[${String(task.order).padStart(3, "0")}] ${escapeHtml(task.title)}</span>
            <span class="status-pill">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="task-subtitle">
            ${escapeHtml(task.scope || (task.tasks || [])[0] || "Focused Codex handoff task.")}
          </div>
        </div>
        <div class="task-actions">
          <button class="copy-btn" type="button" data-action="copy-launcher" data-pack-id="${escapeHtml(latestPack.id)}" data-chunk-id="${escapeHtml(task.id)}">
            <span aria-hidden="true">[]</span>
            ${task.status === "launcher_copied" ? "Copy Again" : "Copy Codex Start"}
          </button>
          <button class="progress-btn" type="button" data-action="mark-progress" data-pack-id="${escapeHtml(latestPack.id)}" data-chunk-id="${escapeHtml(task.id)}">
            <span aria-hidden="true">o</span>
            In Progress
          </button>
          <button class="done-btn" type="button" data-action="mark-done" data-pack-id="${escapeHtml(latestPack.id)}" data-chunk-id="${escapeHtml(task.id)}">
            <span aria-hidden="true">ok</span>
            Done
          </button>
        </div>
      </div>
    `;
  }).join("");
  const historyHtml = olderPacks.length
    ? `
      <details class="history-section">
        <summary>Previous prompt sets (${olderPacks.length})</summary>
        <div class="history-list">
          ${olderPacks.map((pack) => {
            const project = projects.find((item) => item.id === pack.projectId);
            return `
              <div class="history-item">
                <div>
                  <strong>${escapeHtml(pack.title)}</strong>
                  <span>Project: ${escapeHtml(project ? project.name : "Unknown")} | Branch: ${escapeHtml(pack.branchName)} | Tasks: ${Array.isArray(pack.chunks) ? pack.chunks.length : 0}</span>
                </div>
                <button class="danger-btn compact-btn" type="button" data-action="delete-pack" data-pack-id="${escapeHtml(pack.id)}" data-pack-title="${escapeHtml(pack.title)}">Delete</button>
              </div>
            `;
          }).join("")}
        </div>
      </details>
    `
    : "";

  elements.packList.innerHTML = `
    <article class="pack-card latest-pack">
      <h3>Latest Codex Tasks</h3>
      <div class="pack-meta">
        <span class="pack-meta-item"><span aria-hidden="true">[ ]</span> Project: ${escapeHtml(latestProject ? latestProject.name : "Unknown")}</span>
        <span class="pack-meta-item"><span aria-hidden="true">/</span> Branch: ${escapeHtml(latestPack.branchName)}</span>
        <span class="pack-meta-item"><span aria-hidden="true">=</span> Git: ${escapeHtml(getGitModeLabel(latestPack.gitMode))}</span>
      </div>
      <div class="actions" style="margin: 0 0 10px;">
        <button class="secondary-btn" type="button" data-action="open-folder" data-folder-path="${escapeHtml(latestPack.exportPath)}">Open Prompt Folder</button>
        <button class="danger-btn" type="button" data-action="delete-pack" data-pack-id="${escapeHtml(latestPack.id)}" data-pack-title="${escapeHtml(latestPack.title)}">Delete Latest Tasks</button>
      </div>
      <div class="task-list">${taskHtml}</div>
    </article>
    ${historyHtml}
  `;
}

async function refreshVaultState() {
  setVaultBusy(true);

  try {
    const response = await desktopApi.getVaultState();

    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not load prompt vault state.");
    }

    renderVaultState(response.state);
  } finally {
    setVaultBusy(false);
  }
}

async function generatePromptPack() {
  const payload = getVaultPayload();

  if (!payload.sourceText.trim()) {
    setStatus("Project idea / working plan is empty. Generate or paste a plan before creating Codex tasks.", "error");
    return;
  }

  if (!payload.projectName.trim() || !payload.projectPath.trim()) {
    setStatus("Project name and project path are required.", "error");
    return;
  }

  setVaultBusy(true);
  setStatus("Generating Codex tasks...", "busy");

  try {
    const response = await desktopApi.generatePromptPack(payload);

    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not generate Codex tasks.");
    }

    renderVaultState(response.state);
    elements.projectSelect.value = response.project.id;
    setStatus(`Codex tasks generated: ${response.pack.exportPath}`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setVaultBusy(false);
  }
}

async function copyChunk(packId, chunkId) {
  const response = await desktopApi.copyChunk({
    packId,
    chunkId
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not copy prompt task.");
  }

  renderVaultState(response.state);
}

async function copyLauncher(packId, chunkId) {
  const response = await desktopApi.copyLauncher({
    packId,
    chunkId
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not copy Codex start.");
  }

  renderVaultState(response.state);
}

async function markChunk(packId, chunkId, status) {
  const response = await desktopApi.markChunk({
    packId,
    chunkId,
    status
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not update prompt task status.");
  }

  renderVaultState(response.state);
  setStatus(`Task marked ${getTaskStatusLabel(status)}.`, "success");
}

async function openFolder(folderPath) {
  const response = await desktopApi.openFolder({
    folderPath
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not open folder.");
  }
}

async function deletePack(packId, packTitle) {
  const title = packTitle || "these Codex tasks";
  const confirmed = window.confirm(`Delete "${title}" from Prompt Vault?\n\nExported files on disk will not be deleted.`);

  if (!confirmed) {
    return;
  }

  const response = await desktopApi.deletePack({
    packId
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not delete Codex tasks.");
  }

  renderVaultState(response.state);
  setStatus(`Deleted Codex tasks: ${title}.`, "success");
}

async function openLatestPackFolder() {
  const packs = Array.isArray(latestVaultState.promptPacks) ? latestVaultState.promptPacks : [];

  if (!packs[0] || !packs[0].exportPath) {
    setStatus("No Codex prompt folder exists yet.", "error");
    return;
  }

  try {
    await openFolder(packs[0].exportPath);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function refreshExtensionStatus() {
  setBusy(true);
  setStatus("Checking extension connection...", "busy");

  try {
    const response = await desktopApi.refreshExtensionStatus();
    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not refresh extension status.");
    }
    renderStatus({
      message: response.message || "Extension status updated.",
      tone: response.extensionState === "connected" ? "success" : response.extensionState === "loaded" ? "neutral" : "error",
      extensionState: response.extensionState,
      nextTarget: latestWorkflowStatus.nextTarget
    });
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function setupExtensionOnce() {
  setBusy(true);
  setStatus("Opening Chrome extension setup...", "busy");
  try {
    const response = await desktopApi.setupExtensionOnce();
    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not open Chrome extension setup.");
    }
    const extensionPath = response.extensionPath || "F:\\Projects\\CopyPaste\\apps\\extension";
    const fallback = response.manualFallback || "If Chrome opened a blank tab, type chrome://extensions in the address bar.";
    const message = `Setup started. ${fallback} Extension path: ${extensionPath}`;
    renderStatus({
      message,
      tone: "neutral",
      extensionState: latestWorkflowStatus.extensionState,
      nextTarget: latestWorkflowStatus.nextTarget
    });
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function connectInstalledExtension() {
  setBusy(true);
  setStatus("Waking installed CopyPaste extension...", "busy");
  try {
    const response = await desktopApi.connectInstalledExtension();
    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not wake the installed CopyPaste extension.");
    }
    const extensionState = response.extensionState || "loaded";
    renderStatus({
      message: extensionState === "connected"
        ? "Extension connected. Ready for next AI step."
        : "Extension loaded, waiting for WebSocket handshake.",
      tone: extensionState === "connected" ? "success" : "neutral",
      extensionState,
      nextTarget: latestWorkflowStatus.nextTarget
    });
  } catch (error) {
    const details = "If this extension was installed before the fixed ID change, remove the old CopyPaste Orchestrator from Chrome and load unpacked again from the shown folder.";
    setStatus(`${error.message} ${details}`, "error");
  } finally {
    setBusy(false);
  }
}

async function copyExtensionPath() {
  setBusy(true);
  try {
    const response = await desktopApi.copyExtensionPath();
    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not copy extension path.");
    }
    setStatus(`Extension path copied: ${response.extensionPath}`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function copyExtensionsUrl() {
  setBusy(true);
  try {
    const response = await desktopApi.copyExtensionsUrl();
    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not copy extensions URL.");
    }
    setStatus(`Copied URL: ${response.extensionsUrl}`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function openExtensionFolder() {
  setBusy(true);
  try {
    const response = await desktopApi.openExtensionFolder();
    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not open extension folder.");
    }
    setStatus(`Opened extension folder: ${response.extensionPath}`, "neutral");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function handlePackListClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const action = button.dataset.action;

  try {
    if (action === "copy-launcher") {
      await copyLauncher(button.dataset.packId, button.dataset.chunkId);
      setStatus("Codex start copied to clipboard.", "success");
      return;
    }

    if (action === "copy-chunk") {
      await copyChunk(button.dataset.packId, button.dataset.chunkId);
      setStatus("Full Codex task copied to clipboard.", "success");
      return;
    }

    if (action === "mark-progress") {
      await markChunk(button.dataset.packId, button.dataset.chunkId, "in_progress");
      return;
    }

    if (action === "mark-done") {
      await markChunk(button.dataset.packId, button.dataset.chunkId, "done");
      return;
    }

    if (action === "open-folder") {
      await openFolder(button.dataset.folderPath);
      return;
    }

    if (action === "delete-pack") {
      await deletePack(button.dataset.packId, button.dataset.packTitle);
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function selectTreeNode(projectId, packId, chunkId) {
  if (String(projectId || "") === "__draft__") {
    startNewProjectDraft();
    return;
  }
  drawerState.showAllProjects = false;
  drawerState.selectedProjectId = String(projectId || "");
  drawerState.selectedPackId = String(packId || "");
  drawerState.selectedChunkId = String(chunkId || "");
  if (elements.projectSelect && drawerState.selectedProjectId) {
    elements.projectSelect.value = drawerState.selectedProjectId;
  }
  const hasChunks = Array.isArray(latestVaultState.promptPacks) && latestVaultState.promptPacks.some((pack) => Array.isArray(pack.chunks) && pack.chunks.length > 0);
  drawerState.workspaceMode = drawerState.selectedChunkId ? "tasks" : hasChunks ? "tasks" : "plan";
  renderProjectBrowserTree();
  renderWorkspace();
  renderInspector();
}

function setInspectorTab(tabName) {
  drawerState.inspectorTab = String(tabName || "improve");
  renderInspector();
}

function setWorkspaceMode(modeName) {
  drawerState.workspaceMode = String(modeName || "tasks");
  renderWorkspace();
}

async function handleProjectBrowserClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  if (action === "select-master-plan") {
    selectTreeNode(actionEl.dataset.projectId, "", "");
    setWorkspaceMode("plan");
    return;
  }
  if (action === "select-tree-project") {
    selectTreeNode(actionEl.dataset.projectId, "", "");
    return;
  }
  if (action === "select-tree-pack") {
    selectTreeNode(actionEl.dataset.projectId, actionEl.dataset.packId, "");
    return;
  }
  if (action === "select-tree-chunk") {
    selectTreeNode(actionEl.dataset.projectId, actionEl.dataset.packId, actionEl.dataset.chunkId);
    return;
  }
  if (action === "select-roadmap-item") {
    selectTreeNode(actionEl.dataset.projectId, actionEl.dataset.packId, "");
    setWorkspaceMode("plan");
    return;
  }
  if (action === "apply-version") {
    try {
      const response = await desktopApi.applyChunkVersion({
        packId: actionEl.dataset.packId,
        chunkId: actionEl.dataset.chunkId,
        versionId: actionEl.dataset.versionId
      });
      if (!response || response.ok === false) {
        throw new Error(response && response.error ? response.error : "Could not apply version.");
      }
      renderVaultState(response.state);
      setStatus("Version applied to task content.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }
}

function hideProjectContextMenu() {
  if (elements.projectContextMenu && elements.projectContextMenu.dataset.open !== "true") {
    return;
  }
  contextMenuState.type = "";
  contextMenuState.projectId = "";
  contextMenuState.packId = "";
  contextMenuState.chunkId = "";
  if (elements.projectContextMenu) {
    elements.projectContextMenu.dataset.open = "false";
  }
}

function setContextMenuItems(type) {
  if (!elements.projectContextMenu) return;
  elements.projectContextMenu.querySelectorAll("[data-context-action]").forEach((item) => {
    const action = item.getAttribute("data-context-action");
    const isProjectAction = action === "copy-project-path" || action === "delete-project";
    item.style.display = type === "project"
      ? isProjectAction ? "flex" : "none"
      : isProjectAction ? "none" : "flex";
  });
}

function openProjectContextMenu(event) {
  const taskNode = event.target.closest("[data-action='select-tree-chunk']");
  const projectNode = event.target.closest("[data-action='select-tree-project']");
  const node = taskNode || projectNode;
  if (!node || node.dataset.draftProject === "true") return;
  event.preventDefault();
  contextMenuState.type = taskNode ? "task" : "project";
  contextMenuState.projectId = node.dataset.projectId || "";
  contextMenuState.packId = node.dataset.packId || "";
  contextMenuState.chunkId = node.dataset.chunkId || "";
  setContextMenuItems(contextMenuState.type);
  if (elements.projectContextMenu) {
    elements.projectContextMenu.style.left = `${Math.max(8, event.clientX)}px`;
    elements.projectContextMenu.style.top = `${Math.max(8, event.clientY)}px`;
    elements.projectContextMenu.dataset.open = "true";
  }
}

async function deleteSelectedProjectFromContext() {
  const project = (latestVaultState.projects || []).find((item) => item.id === contextMenuState.projectId);
  if (!project) throw new Error("Project not found.");
  const confirmed = window.confirm(`Delete "${project.name}" from Project Browser?\n\nProject files on disk will not be deleted.`);
  if (!confirmed) return;
  const response = await desktopApi.deleteProject({ projectId: project.id });
  if (!response || response.ok === false) throw new Error(response && response.error ? response.error : "Could not delete project.");
  drawerState.selectedProjectId = "";
  drawerState.selectedPackId = "";
  drawerState.selectedChunkId = "";
  drawerState.showAllProjects = true;
  renderVaultState(response.state);
  setStatus(`Project removed from browser: ${project.name}`, "success");
}

async function deleteSelectedTaskFromContext() {
  const selected = {
    packId: contextMenuState.packId,
    chunkId: contextMenuState.chunkId
  };
  const pack = (latestVaultState.promptPacks || []).find((item) => item.id === selected.packId);
  const chunk = pack && (pack.chunks || []).find((item) => item.id === selected.chunkId);
  if (!pack || !chunk) throw new Error("Task not found.");
  const confirmed = window.confirm(`Delete task "${chunk.title}" from this project?`);
  if (!confirmed) return;
  const response = await desktopApi.deleteTask(selected);
  if (!response || response.ok === false) throw new Error(response && response.error ? response.error : "Could not delete task.");
  drawerState.selectedChunkId = "";
  renderVaultState(response.state);
  setStatus(`Task deleted: ${chunk.title}`, "success");
}

async function handleProjectContextMenuClick(event) {
  const actionEl = event.target.closest("[data-context-action]");
  if (!actionEl) return;
  const action = actionEl.getAttribute("data-context-action");
  try {
    if (action === "copy-project-path") {
      const project = (latestVaultState.projects || []).find((item) => item.id === contextMenuState.projectId);
      if (!project) throw new Error("Project not found.");
      await window.nextstepClipboard.copyText(project.path || "");
      setStatus(`Project path copied: ${project.path}`, "success");
    } else if (action === "delete-project") {
      await deleteSelectedProjectFromContext();
    } else if (action === "copy-task") {
      await desktopApi.copyChunk({ packId: contextMenuState.packId, chunkId: contextMenuState.chunkId });
      setStatus("Task copied.", "success");
    } else if (action === "delete-task") {
      await deleteSelectedTaskFromContext();
    }
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    hideProjectContextMenu();
  }
}

function handleProjectBrowserDoubleClick(event) {
  const actionEl = event.target.closest("[data-action='select-tree-chunk']");
  if (!actionEl) {
    return;
  }
  selectTreeNode(actionEl.dataset.projectId, actionEl.dataset.packId, actionEl.dataset.chunkId);
  drawerState.workspaceMode = "tasks";
  renderWorkspace();
  if (elements.workspaceTaskName) {
    elements.workspaceTaskName.focus();
  }
}

async function saveWorkspaceTask() {
  const selected = getSelectedChunk();
  if (!selected) {
    setStatus("Select a task first.", "error");
    return;
  }
  const requestedStatus = elements.workspaceTaskStatus ? elements.workspaceTaskStatus.value : String(selected.chunk.status || "ready");
  const response = await desktopApi.updateChunkContent({
    packId: selected.pack.id,
    chunkId: selected.chunk.id,
    title: elements.workspaceTaskName.value,
    prompt: elements.workspaceTaskContent.value
  });
  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not save task.");
  }
  let finalState = response.state;
  const currentStatus = String(selected.chunk.status || "ready");
  if (requestedStatus !== currentStatus) {
    const statusResponse = await desktopApi.markChunk({
      packId: selected.pack.id,
      chunkId: selected.chunk.id,
      status: requestedStatus
    });
    if (!statusResponse || statusResponse.ok === false) {
      throw new Error(statusResponse && statusResponse.error ? statusResponse.error : "Could not update task status.");
    }
    finalState = statusResponse.state;
  }
  renderVaultState(finalState);
  setStatus("Task content saved.", "success");
}

async function improveMasterPlan() {
  const idea = elements.projectIdea ? elements.projectIdea.value : "";
  const currentPlan = elements.currentText ? elements.currentText.value : "";
  if (!String(idea || "").trim() && isEmptyMasterPlanText(currentPlan)) {
    setStatus("Add a project idea first, then click Improve Master Plan.", "error");
    return;
  }

  const saved = await desktopApi.saveProjectBrief({
    projectId: drawerState.selectedProjectId,
    projectName: elements.projectName.value,
    projectPath: elements.projectPath.value,
    idea,
    masterPlan: currentPlan
  });
  if (!saved || saved.ok === false) {
    throw new Error(saved && saved.error ? saved.error : "Could not save project before improving master plan.");
  }
  drawerState.selectedProjectId = saved.project.id;
  renderVaultState(saved.state);
  if (elements.projectSelect) elements.projectSelect.value = saved.project.id;

  drawerState.activeWorkflowContext = "debate_plan";
  setStatus("Sending current planning stage. Use Continue current debate for each next stage.", "busy");
  await triggerWorkflowStep();
}

async function createTaskRoadmap() {
  const idea = elements.projectIdea ? elements.projectIdea.value : "";
  const currentPlan = elements.currentText ? elements.currentText.value : "";
  if (isEmptyMasterPlanText(currentPlan)) {
    setStatus("Create the master plan first, then create the task roadmap.", "error");
    return;
  }

  const saved = await desktopApi.saveProjectBrief({
    projectId: drawerState.selectedProjectId,
    projectName: elements.projectName.value,
    projectPath: elements.projectPath.value,
    idea,
    masterPlan: currentPlan
  });
  if (!saved || saved.ok === false) {
    throw new Error(saved && saved.error ? saved.error : "Could not save project before creating task roadmap.");
  }
  drawerState.selectedProjectId = saved.project.id;
  const activePackId = saved.project.activePromptPackId;
  if (!activePackId) {
    throw new Error("Project has no active task pack. Save the project and try again.");
  }
  renderVaultState(saved.state);
  if (elements.projectSelect) elements.projectSelect.value = saved.project.id;

  const payload = getTaskRoadmapPayload({
    projectName: elements.projectName.value,
    projectPath: elements.projectPath.value,
    projectIdea: idea,
    masterPlan: currentPlan
  });
  drawerState.activeWorkflowContext = "roadmap";
  drawerState.activeRoadmapPackId = activePackId;
  drawerState.lastImprovePrompt = payload.text;
  setBusy(true);
  setStatus("Sending master plan to AI for a JSON task roadmap.", "busy");
  const response = await desktopApi.sendWorkflow(payload);
  if (!response || response.ok === false) {
    drawerState.activeWorkflowContext = "debate_plan";
    drawerState.activeRoadmapPackId = "";
    setBusy(false);
    throw new Error(response && response.error ? response.error : "Could not send task roadmap request to AI.");
  }
}

async function startNextTask() {
  const project = (latestVaultState.projects || []).find((item) => item.id === drawerState.selectedProjectId)
    || (latestVaultState.projects || [])[0];
  if (!project) {
    setStatus("Save a project first.", "error");
    return;
  }
  const pack = (latestVaultState.promptPacks || []).find((item) => item.id === project.activePromptPackId)
    || (latestVaultState.promptPacks || []).find((item) => item.projectId === project.id);
  if (!pack) {
    setStatus("Create the task roadmap first.", "error");
    return;
  }
  const nextItem = getNextEligibleRoadmapItem(pack);
  if (!nextItem) {
    setStatus("No eligible roadmap task found. Create a roadmap or mark dependency tasks done.", "error");
    return;
  }
  const response = await desktopApi.startRoadmapPrompt({
    packId: pack.id,
    roadmapItemId: nextItem.id
  });
  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not start next task.");
  }
  drawerState.selectedProjectId = project.id;
  drawerState.selectedPackId = response.pack.id;
  drawerState.selectedChunkId = response.chunk.id;
  drawerState.workspaceMode = "tasks";
  renderVaultState(response.state);
  setStatus("Next task created from roadmap.", "success");
}

async function applyMasterPlanDraft() {
  const project = (latestVaultState.projects || []).find((item) => item.id === drawerState.selectedProjectId)
    || null;
  if (!project) {
    setStatus("Select a saved project first.", "error");
    return;
  }
  const draft = getLatestMasterPlanDraftVersion(project);
  if (!draft) {
    setStatus("No master plan draft is ready to apply.", "error");
    return;
  }
  const response = await desktopApi.applyMasterPlanVersion({
    projectId: project.id,
    versionId: draft.id
  });
  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not apply master plan.");
  }
  renderVaultState(response.state);
  setStatus("Master plan applied.", "success");
}

async function runPlanPrimaryAction() {
  const selected = getSelectedPlanProjectAndPack();
  const action = getPlanPrimaryAction({
    project: selected.project,
    pack: selected.pack,
    projectIdea: elements.projectIdea ? elements.projectIdea.value : "",
    masterPlanText: elements.currentText ? elements.currentText.value : ""
  });

  if (!action.enabled) {
    setStatus(action.id === "master_plan" ? "Add a project idea first." : "No roadmap task is ready yet.", "error");
    return;
  }

  if (action.handler === "improveMasterPlan") {
    await improveMasterPlan();
  } else if (action.handler === "applyMasterPlanDraft") {
    await applyMasterPlanDraft();
  } else if (action.handler === "createTaskRoadmap") {
    await createTaskRoadmap();
  } else if (action.handler === "startNextTask") {
    await startNextTask();
  }
}

async function buildImprovePromptForDrawer() {
  const selected = getSelectedChunk();
  if (!selected) {
    setStatus("Select a task first.", "error");
    return;
  }
  const response = await desktopApi.buildChunkImprovePrompt({
    packId: selected.pack.id,
    chunkId: selected.chunk.id
  });
  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not build improve prompt.");
  }
  drawerState.lastImprovePrompt = String(response.prompt || "");
  if (elements.inspectorImprovePrompt) {
    elements.inspectorImprovePrompt.value = drawerState.lastImprovePrompt;
  }
  setStatus("Improve task ready.", "success");
  setInspectorTab("improve");
}

async function sendImprovePrompt() {
  const selected = getSelectedChunk();
  if (!selected) {
    setStatus("Select a task first.", "error");
    return;
  }
  if (!drawerState.lastImprovePrompt.trim()) {
    await buildImprovePromptForDrawer();
  }
  drawerState.activeWorkflowContext = "task_improve";
  setBusy(true);
  const improvePayload = getTaskImprovePayload(selected.chunk, selected.chunk.runHistory || [], drawerState.lastImprovePrompt);
  const response = await desktopApi.sendWorkflow({
    chatgptPrefix: "",
    claudePrefix: "",
    text: improvePayload.text,
    targetProvider: improvePayload.targetProvider,
    currentStageId: improvePayload.currentStageId,
    currentStageLabel: improvePayload.currentStageLabel,
    currentRole: improvePayload.currentRole
  });
  if (!response || response.ok === false) {
    drawerState.activeWorkflowContext = "debate_plan";
    throw new Error(response && response.error ? response.error : "Could not send improve prompt.");
  }
  setStatus("Improve task sent. Waiting for AI response.", "busy");
}

async function addInspectorRunNote() {
  const selected = getSelectedChunk();
  if (!selected) {
    setStatus("Select a task first.", "error");
    return;
  }
  const response = await desktopApi.addChunkRunHistory({
    packId: selected.pack.id,
    chunkId: selected.chunk.id,
    note: elements.inspectorRunNote.value,
    source: "manual"
  });
  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not add run note.");
  }
  elements.inspectorRunNote.value = "";
  renderVaultState(response.state);
  setStatus("Run note saved.", "success");
}

async function saveProjectBriefFromWorkspace() {
  const response = await desktopApi.saveProjectBrief({
    projectId: drawerState.selectedProjectId,
    projectName: elements.projectName.value,
    projectPath: elements.projectPath.value,
    idea: elements.projectIdea ? elements.projectIdea.value : "",
    masterPlan: elements.currentText.value
  });
  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not save project.");
  }
  drawerState.selectedProjectId = response.project.id;
  renderVaultState(response.state);
  if (elements.projectSelect) elements.projectSelect.value = response.project.id;
  setStatus("Draft saved.", "success");
}

function startNewProjectDraft() {
  drawerState.showAllProjects = false;
  drawerState.selectedProjectId = "";
  drawerState.selectedPackId = "";
  drawerState.selectedChunkId = "";
  drawerState.workspaceMode = "plan";
  projectDraftState.isActive = true;
  projectDraftState.pathManuallyEdited = false;
  projectDraftState.previousAutoPath = getProjectDraftPath("New Project", latestVaultState.projectsBasePath);

  if (elements.projectSelect) elements.projectSelect.value = "";
  if (elements.projectName) elements.projectName.value = "New Project";
  if (elements.projectPath) elements.projectPath.value = projectDraftState.previousAutoPath;
  if (elements.projectIdea) elements.projectIdea.value = "";
  if (elements.currentText) elements.currentText.value = "";

  syncDraftFieldsFromName("New Project");
  renderWorkspace();
  renderInspector();
  updateWordCount();
}

async function createProjectFromSidebar() {
  startNewProjectDraft();

  if (elements.projectName) {
    elements.projectName.focus();
    elements.projectName.select();
  }

  setStatus("New project draft ready. Fill details, then click Save Project.", "neutral");
}

function showAllProjects() {
  drawerState.showAllProjects = true;
  projectDraftState.isActive = false;
  drawerState.selectedProjectId = "";
  drawerState.selectedPackId = "";
  drawerState.selectedChunkId = "";
  if (elements.projectSelect) elements.projectSelect.value = "__all__";
  renderProjectBrowserTree();
  renderWorkspace();
  renderInspector();
  setStatus("Showing all saved projects.", "neutral");
}

async function saveVaultSettings() {
  const projectsBasePath = elements.defaultProjectsFolder ? elements.defaultProjectsFolder.value : "";
  const response = await desktopApi.updateVaultSettings({ projectsBasePath });
  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not save settings.");
  }
  renderVaultState(response.state);
  if (projectDraftState.isActive && elements.projectName) {
    syncDraftFieldsFromName(elements.projectName.value);
  }
  setStatus("Settings saved.", "success");
}

async function openSelectedProjectFolder() {
  const project = (latestVaultState.projects || []).find((item) => item.id === drawerState.selectedProjectId);
  if (!project || !project.path) {
    throw new Error("Select a project first.");
  }
  await openFolder(project.path);
}

async function approveSelectedPrompt() {
  const selected = getSelectedChunk();
  if (!selected) {
    setStatus("Select a task first.", "error");
    return;
  }
  const response = await desktopApi.approvePrompt({ packId: selected.pack.id, chunkId: selected.chunk.id });
  if (!response || response.ok === false) throw new Error(response && response.error ? response.error : "Could not approve prompt.");
  renderVaultState(response.state);
  setStatus("Task approved.", "success");
}

async function copySelectedPromptToCodex() {
  const selected = getSelectedChunk();
  if (!selected) {
    setStatus("Select a task first.", "error");
    return;
  }
  const response = await desktopApi.copyPromptToCodex({ packId: selected.pack.id, chunkId: selected.chunk.id });
  if (!response || response.ok === false) throw new Error(response && response.error ? response.error : "Could not copy prompt to Codex.");
  renderVaultState(response.state);
  setStatus("Approved task copied for Codex.", "success");
}

async function markSelectedPromptDone() {
  const selected = getSelectedChunk();
  if (!selected) {
    setStatus("Select a task first.", "error");
    return;
  }
  const note = elements.workspacePromptRunNote ? elements.workspacePromptRunNote.value : "";
  const response = await desktopApi.markPromptDone({
    packId: selected.pack.id,
    chunkId: selected.chunk.id,
    note,
    source: "codex_run"
  });
  if (!response || response.ok === false) throw new Error(response && response.error ? response.error : "Could not mark prompt done.");
  if (elements.workspacePromptRunNote) elements.workspacePromptRunNote.value = "";
  renderVaultState(response.state);
  setStatus("Task marked done.", "success");
}

async function copySelectedRoadmapHandoff() {
  const selected = getSelectedChunk();
  if (!selected) throw new Error("Select a task first.");
  const selector = elements.codexTaskSelector ? String(elements.codexTaskSelector.value || "").trim() : "";
  if (!selector) throw new Error("Task selector is required (example: 1-3).");
  const response = await desktopApi.copyRoadmapHandoff({ packId: selected.pack.id, selector });
  if (!response || response.ok === false) throw new Error(response && response.error ? response.error : "Could not copy Codex handoff.");
  renderVaultState(response.state);
  setStatus(`Copied Codex handoff for tasks: ${response.selector}`, "success");
}

function installDomReferences() {
  elements.chatgptPrefix = byId("chatgptPrefix");
  elements.claudePrefix = byId("claudePrefix");
  elements.currentText = byId("currentText");
  elements.wordCount = byId("wordCount");
  elements.projectSelect = byId("projectSelect");
  elements.newProjectButton = byId("newProjectBtn");
  elements.seeAllProjectsButton = byId("seeAllProjectsBtn");
  elements.openProjectFolderButton = byId("openProjectFolderBtn");
  elements.projectName = byId("projectName");
  elements.projectPath = byId("projectPath");
  elements.defaultProjectsFolder = byId("defaultProjectsFolder");
  elements.saveVaultSettingsButton = byId("saveVaultSettingsBtn");
  elements.projectIdea = byId("projectIdea");
  elements.packTitle = byId("packTitle");
  elements.chunkStrategy = byId("chunkStrategy");
  elements.chunkCount = byId("chunkCount");
  elements.gitRemote = byId("gitRemote");
  elements.defaultBranch = byId("defaultBranch");
  elements.branchPrefix = byId("branchPrefix");
  elements.gitMode = byId("gitMode");
  elements.branchName = byId("branchName");
  elements.commitMessage = byId("commitMessage");
  elements.triggerButton = byId("triggerWorkflowBtn");
  elements.saveButton = byId("saveFinalBtn");
  elements.refreshExtensionButton = byId("refreshExtensionBtn");
  elements.setupExtensionButton = byId("setupExtensionBtn");
  elements.connectExtensionButton = byId("connectExtensionBtn");
  elements.setupToolsButton = byId("setupToolsBtn");
  elements.setupToolsPanel = byId("setupToolsPanel");
  elements.copyExtensionPathButton = byId("copyExtensionPathBtn");
  elements.copyExtensionsUrlButton = byId("copyExtensionsUrlBtn");
  elements.openExtensionFolderButton = byId("openExtensionFolderBtn");
  elements.generatePackButton = byId("generatePackBtn");
  elements.refreshVaultButton = byId("refreshVaultBtn");
  elements.openLatestPackButton = byId("openLatestPackBtn");
  elements.status = byId("status");
  elements.connectionPill = byId("connectionPill");
  elements.connectionText = byId("connectionText");
  elements.readinessText = byId("readinessText");
  elements.statusDetail = byId("statusDetail");
  elements.extensionSetupHint = byId("extensionSetupHint");
  elements.nextTarget = byId("nextTarget");
  elements.currentStage = byId("currentStage");
  elements.currentProvider = byId("currentProvider");
  elements.nextProvider = byId("nextProvider");
  elements.responseView = byId("responseView");
  elements.roundHistory = byId("roundHistory");
  elements.packList = byId("packList");
  elements.projectBrowserTree = byId("projectBrowserTree");
  elements.projectContextMenu = byId("projectContextMenu");
  elements.workspaceTaskName = byId("workspaceTaskName");
  elements.workspaceTaskStatus = byId("workspaceTaskStatus");
  elements.workspaceTaskContent = byId("workspaceTaskContent");
  elements.workspaceTaskForm = byId("workspaceTaskForm");
  elements.workspaceTaskEmpty = byId("workspaceTaskEmpty");
  elements.saveWorkspaceTaskButton = byId("saveWorkspaceTaskBtn");
  elements.copyWorkspaceTaskButton = byId("copyWorkspaceTaskBtn");
  elements.sendWorkspaceTaskButton = byId("sendWorkspaceTaskBtn");
  elements.copyWorkspaceLauncherButton = byId("copyWorkspaceLauncherBtn");
  elements.workspacePromptRunNote = byId("workspacePromptRunNote");
  elements.saveProjectBriefButton = byId("saveProjectBriefBtn");
  elements.planPrimaryActionButton = byId("planPrimaryActionBtn");
  elements.approvePromptButton = byId("approvePromptBtn");
  elements.markPromptDoneButton = byId("markPromptDoneBtn");
  elements.copyCodexHandoffButton = byId("copyCodexHandoffBtn");
  elements.codexTaskSelector = byId("codexTaskSelector");
  elements.inspectorImprovePrompt = byId("inspectorImprovePrompt");
  elements.inspectorRunNote = byId("inspectorRunNote");
  elements.inspectorVersionsList = byId("inspectorVersionsList");
  elements.inspectorRunHistoryList = byId("inspectorRunHistoryList");
  elements.inspectorImproveForm = byId("inspectorImproveForm");
  elements.inspectorRunsForm = byId("inspectorRunsForm");
  elements.inspectorEmptyImprove = byId("inspectorEmptyImprove");
  elements.inspectorEmptyRuns = byId("inspectorEmptyRuns");
  elements.inspectorDetails = byId("inspectorDetails");
  elements.buildImprovePromptButton = byId("buildImprovePromptBtn");
  elements.sendImprovePromptButton = byId("sendImprovePromptBtn");
  elements.copyImprovePromptButton = byId("copyImprovePromptBtn");
  elements.addRunNoteButton = byId("addRunNoteBtn");
  elements.workspaceTabs = Array.from(document.querySelectorAll("[data-workspace-tab]"));
  elements.inspectorTabs = Array.from(document.querySelectorAll("[data-inspector-tab]"));
}

function installEventListeners() {
  elements.triggerButton.addEventListener("click", triggerWorkflowStep);
  elements.saveButton.addEventListener("click", saveFinalText);
  elements.refreshExtensionButton.addEventListener("click", () => {
    refreshExtensionStatus().catch((error) => setStatus(error.message, "error"));
  });
  elements.setupExtensionButton.addEventListener("click", () => {
    setupExtensionOnce().catch((error) => setStatus(error.message, "error"));
  });
  elements.connectExtensionButton.addEventListener("click", () => {
    connectInstalledExtension().catch((error) => setStatus(error.message, "error"));
  });
  elements.setupToolsButton.addEventListener("click", toggleSetupToolsPanel);
  elements.copyExtensionPathButton.addEventListener("click", () => {
    copyExtensionPath().catch((error) => setStatus(error.message, "error"));
  });
  elements.copyExtensionsUrlButton.addEventListener("click", () => {
    copyExtensionsUrl().catch((error) => setStatus(error.message, "error"));
  });
  elements.openExtensionFolderButton.addEventListener("click", () => {
    openExtensionFolder().catch((error) => setStatus(error.message, "error"));
  });
  elements.currentText.addEventListener("input", updateWordCount);
  if (elements.saveProjectBriefButton) {
    elements.saveProjectBriefButton.addEventListener("click", () => {
      saveProjectBriefFromWorkspace().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.saveVaultSettingsButton) {
    elements.saveVaultSettingsButton.addEventListener("click", () => {
      saveVaultSettings().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.planPrimaryActionButton) {
    elements.planPrimaryActionButton.addEventListener("click", () => {
      runPlanPrimaryAction().catch((error) => setStatus(error.message, "error"));
    });
  }
  elements.generatePackButton.addEventListener("click", generatePromptPack);
  elements.refreshVaultButton.addEventListener("click", () => {
    refreshVaultState().catch((error) => setStatus(error.message, "error"));
  });
  elements.openLatestPackButton.addEventListener("click", openLatestPackFolder);
  elements.packList.addEventListener("click", handlePackListClick);
  elements.projectSelect.addEventListener("change", () => applyProject(elements.projectSelect.value));
  if (elements.projectName) {
    elements.projectName.addEventListener("input", () => {
      updatePlanPrimaryAction();
      if (!projectDraftState.isActive) {
        return;
      }
      syncDraftFieldsFromName(elements.projectName.value);
    });
  }
  if (elements.projectIdea) {
    elements.projectIdea.addEventListener("input", updatePlanPrimaryAction);
  }
  if (elements.projectPath) {
    elements.projectPath.addEventListener("input", () => {
      if (!projectDraftState.isActive) {
        return;
      }
      const currentPath = String(elements.projectPath.value || "").trim();
      if (!currentPath) {
        projectDraftState.pathManuallyEdited = false;
        return;
      }
      if (currentPath !== projectDraftState.previousAutoPath) {
        projectDraftState.pathManuallyEdited = true;
      }
    });
  }
  if (elements.defaultProjectsFolder) {
    elements.defaultProjectsFolder.addEventListener("input", () => {
      if (projectDraftState.isActive && elements.projectName) {
        syncDraftFieldsFromName(elements.projectName.value);
      }
    });
  }
  if (elements.newProjectButton) {
    elements.newProjectButton.addEventListener("click", () => {
      createProjectFromSidebar().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.seeAllProjectsButton) {
    elements.seeAllProjectsButton.addEventListener("click", showAllProjects);
  }
  if (elements.openProjectFolderButton) {
    elements.openProjectFolderButton.addEventListener("click", () => {
      openSelectedProjectFolder().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.projectBrowserTree) {
    elements.projectBrowserTree.addEventListener("click", (event) => {
      hideProjectContextMenu();
      handleProjectBrowserClick(event).catch((error) => setStatus(error.message, "error"));
    });
    elements.projectBrowserTree.addEventListener("contextmenu", openProjectContextMenu);
    elements.projectBrowserTree.addEventListener("dblclick", handleProjectBrowserDoubleClick);
  }
  if (elements.projectContextMenu) {
    elements.projectContextMenu.addEventListener("click", (event) => {
      handleProjectContextMenuClick(event).catch((error) => setStatus(error.message, "error"));
    });
  }
  document.addEventListener("click", (event) => {
    if (elements.projectContextMenu && !event.target.closest("#projectContextMenu")) {
      hideProjectContextMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideProjectContextMenu();
  });
  elements.workspaceTabs.forEach((node) => {
    node.addEventListener("click", () => setWorkspaceMode(node.getAttribute("data-workspace-tab")));
  });
  elements.inspectorTabs.forEach((node) => {
    node.addEventListener("click", () => setInspectorTab(node.getAttribute("data-inspector-tab")));
  });
  if (elements.saveWorkspaceTaskButton) {
    elements.saveWorkspaceTaskButton.addEventListener("click", () => {
      saveWorkspaceTask().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.copyWorkspaceTaskButton) {
    elements.copyWorkspaceTaskButton.addEventListener("click", async () => {
      const selected = getSelectedChunk();
      if (!selected) return;
      await desktopApi.copyChunk({ packId: selected.pack.id, chunkId: selected.chunk.id });
      setStatus("Task copied.", "success");
    });
  }
  if (elements.sendWorkspaceTaskButton) {
    elements.sendWorkspaceTaskButton.addEventListener("click", () => {
      sendImprovePrompt().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.copyWorkspaceLauncherButton) {
    elements.copyWorkspaceLauncherButton.addEventListener("click", async () => {
      copySelectedPromptToCodex().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.approvePromptButton) {
    elements.approvePromptButton.addEventListener("click", () => {
      approveSelectedPrompt().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.markPromptDoneButton) {
    elements.markPromptDoneButton.addEventListener("click", () => {
      markSelectedPromptDone().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.copyCodexHandoffButton) {
    elements.copyCodexHandoffButton.addEventListener("click", () => {
      copySelectedRoadmapHandoff().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.buildImprovePromptButton) {
    elements.buildImprovePromptButton.addEventListener("click", () => {
      buildImprovePromptForDrawer().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.sendImprovePromptButton) {
    elements.sendImprovePromptButton.addEventListener("click", () => {
      sendImprovePrompt().catch((error) => setStatus(error.message, "error"));
    });
  }
  if (elements.copyImprovePromptButton) {
    elements.copyImprovePromptButton.addEventListener("click", async () => {
      await window.nextstepClipboard.copyText(drawerState.lastImprovePrompt || "");
      setStatus("Improve task copied.", "success");
    });
  }
  if (elements.addRunNoteButton) {
    elements.addRunNoteButton.addEventListener("click", () => {
      addInspectorRunNote().catch((error) => setStatus(error.message, "error"));
    });
  }

  desktopApi.onResponse((text) => {
    renderResponse(text).catch((error) => {
      drawerState.activeWorkflowContext = "debate_plan";
      drawerState.activeRoadmapPackId = "";
      setBusy(false);
      setStatus(error.message || "Could not process AI response.", "error");
    });
  });

  desktopApi.onStatus((payload) => {
    renderStatus(payload);
  });

  desktopApi.onVaultState((state) => {
    renderVaultState(state);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    installDomReferences();
    installEventListeners();
    resetActionButtons();
    setStatus("Waiting for Chrome extension WebSocket connection...", "neutral");
    drawerState.pendingDebatePrompt = null;
    renderDebateState();
    renderWorkflowStatus();
    updateWordCount();
    renderWorkspace();
    renderInspector();
    refreshVaultState().catch((error) => setStatus(error.message, "error"));
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    getTaskStatusLabel,
    getWorkflowStatusView,
    normalizeExtensionState,
    getProviderDisplayList,
    getNewProjectDraft,
    createRootDebateState,
    createStageWorkflowPayload,
    applyDebateResponse,
    getDebateStageView,
    buildProjectBrowserTree,
    getTaskImprovePayload,
    getMasterPlanImprovePayload,
    getTaskRoadmapPayload,
    getNextEligibleRoadmapItem,
    getPlanPrimaryAction,
    getMasterPlanActionLabel,
    renderProjectPlanHtml,
    getRoundPreview,
    getProjectFolderName,
    getVisibleProjectBrowserNodes,
    getProjectDraftPath,
    getDraftCommitFallback
  };
}
