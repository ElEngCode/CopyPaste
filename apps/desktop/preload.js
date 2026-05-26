const { contextBridge, ipcRenderer } = require("electron");
const projectBuilderProtocol = require("../../packages/protocol");

const TRIGGER_WORKFLOW_CHANNEL = "TRIGGER_AI_WORKFLOW";
const RESPONSE_CHANNEL = "AI_RESPONSE_RECEIVED";
const STATUS_CHANNEL = "WORKFLOW_STATUS";
const VAULT_STATE_CHANNEL = "VAULT_STATE_UPDATED";
const VAULT_GET_STATE_CHANNEL = "VAULT_GET_STATE";
const VAULT_GENERATE_PACK_CHANNEL = "VAULT_GENERATE_PACK";
const VAULT_UPDATE_SETTINGS_CHANNEL = "VAULT_UPDATE_SETTINGS";
const VAULT_COPY_CHUNK_CHANNEL = "VAULT_COPY_CHUNK";
const VAULT_COPY_LAUNCHER_CHANNEL = "VAULT_COPY_LAUNCHER";
const VAULT_MARK_CHUNK_CHANNEL = "VAULT_MARK_CHUNK";
const VAULT_OPEN_FOLDER_CHANNEL = "VAULT_OPEN_FOLDER";
const VAULT_DELETE_PACK_CHANNEL = "VAULT_DELETE_PACK";
const VAULT_DELETE_TASK_CHANNEL = "VAULT_DELETE_TASK";
const VAULT_DELETE_PROJECT_CHANNEL = "VAULT_DELETE_PROJECT";
const VAULT_UPDATE_CHUNK_CONTENT_CHANNEL = "VAULT_UPDATE_CHUNK_CONTENT";
const VAULT_ADD_CHUNK_VERSION_CHANNEL = "VAULT_ADD_CHUNK_VERSION";
const VAULT_APPLY_CHUNK_VERSION_CHANNEL = "VAULT_APPLY_CHUNK_VERSION";
const VAULT_ADD_CHUNK_RUN_HISTORY_CHANNEL = "VAULT_ADD_CHUNK_RUN_HISTORY";
const VAULT_CREATE_MANUAL_CHUNK_CHANNEL = "VAULT_CREATE_MANUAL_CHUNK";
const VAULT_BUILD_CHUNK_IMPROVE_PROMPT_CHANNEL = "VAULT_BUILD_CHUNK_IMPROVE_PROMPT";
const VAULT_SAVE_PROJECT_BRIEF_CHANNEL = "VAULT_SAVE_PROJECT_BRIEF";
const VAULT_CREATE_DEBATE_WORKFLOW_CHANNEL = "VAULT_CREATE_DEBATE_WORKFLOW";
const VAULT_GET_ACTIVE_DEBATE_WORKFLOW_CHANNEL = "VAULT_GET_ACTIVE_DEBATE_WORKFLOW";
const VAULT_GET_DEBATE_WORKFLOW_CHANNEL = "VAULT_GET_DEBATE_WORKFLOW";
const VAULT_SAVE_DEBATE_ROUND_CHANNEL = "VAULT_SAVE_DEBATE_ROUND";
const VAULT_ADVANCE_DEBATE_WORKFLOW_CHANNEL = "VAULT_ADVANCE_DEBATE_WORKFLOW";
const VAULT_COMPLETE_DEBATE_WORKFLOW_CHANNEL = "VAULT_COMPLETE_DEBATE_WORKFLOW";
const VAULT_CREATE_MASTER_PLAN_FROM_DEBATE_CHANNEL = "VAULT_CREATE_MASTER_PLAN_FROM_DEBATE";
const VAULT_ADD_MASTER_PLAN_VERSION_CHANNEL = "VAULT_ADD_MASTER_PLAN_VERSION";
const VAULT_APPLY_MASTER_PLAN_VERSION_CHANNEL = "VAULT_APPLY_MASTER_PLAN_VERSION";
const VAULT_ARCHIVE_MASTER_PLAN_VERSION_CHANNEL = "VAULT_ARCHIVE_MASTER_PLAN_VERSION";
const VAULT_LIST_MASTER_PLAN_VERSIONS_CHANNEL = "VAULT_LIST_MASTER_PLAN_VERSIONS";
const VAULT_ADD_ROADMAP_VERSION_CHANNEL = "VAULT_ADD_ROADMAP_VERSION";
const VAULT_PREPARE_ROADMAP_GENERATION_CHANNEL = "VAULT_PREPARE_ROADMAP_GENERATION";
const VAULT_APPLY_ROADMAP_VERSION_CHANNEL = "VAULT_APPLY_ROADMAP_VERSION";
const VAULT_LIST_ROADMAP_VERSIONS_CHANNEL = "VAULT_LIST_ROADMAP_VERSIONS";
const VAULT_ARCHIVE_ROADMAP_VERSION_CHANNEL = "VAULT_ARCHIVE_ROADMAP_VERSION";
const VAULT_GET_ROADMAP_ELIGIBILITY_CHANNEL = "VAULT_GET_ROADMAP_ELIGIBILITY";
const VAULT_GET_NEXT_ROADMAP_ITEM_CHANNEL = "VAULT_GET_NEXT_ROADMAP_ITEM";
const VAULT_MARK_ROADMAP_IN_PROGRESS_CHANNEL = "VAULT_MARK_ROADMAP_IN_PROGRESS";
const VAULT_MARK_ROADMAP_DONE_CHANNEL = "VAULT_MARK_ROADMAP_DONE";
const VAULT_CREATE_TASK_PROMPT_CHANNEL = "VAULT_CREATE_TASK_PROMPT";
const VAULT_UPDATE_TASK_PROMPT_CHANNEL = "VAULT_UPDATE_TASK_PROMPT";
const VAULT_ADD_TASK_PROMPT_VERSION_CHANNEL = "VAULT_ADD_TASK_PROMPT_VERSION";
const VAULT_APPLY_TASK_PROMPT_VERSION_CHANNEL = "VAULT_APPLY_TASK_PROMPT_VERSION";
const VAULT_LIST_TASK_PROMPT_VERSIONS_CHANNEL = "VAULT_LIST_TASK_PROMPT_VERSIONS";
const VAULT_PREPARE_TASK_IMPROVE_CHANNEL = "VAULT_PREPARE_TASK_IMPROVE";
const VAULT_SAVE_TASK_IMPROVE_CHANNEL = "VAULT_SAVE_TASK_IMPROVE";
const VAULT_APPROVE_TASK_PROMPT_CHANNEL = "VAULT_APPROVE_TASK_PROMPT";
const VAULT_COPY_CODEX_HANDOFF_CHANNEL = "VAULT_COPY_CODEX_HANDOFF";
const VAULT_MARK_TASK_PROMPT_DONE_CHANNEL = "VAULT_MARK_TASK_PROMPT_DONE";
const VAULT_START_ROADMAP_PROMPT_CHANNEL = "VAULT_START_ROADMAP_PROMPT";
const VAULT_APPROVE_PROMPT_CHANNEL = "VAULT_APPROVE_PROMPT";
const VAULT_COPY_PROMPT_TO_CODEX_CHANNEL = "VAULT_COPY_PROMPT_TO_CODEX";
const VAULT_MARK_PROMPT_DONE_CHANNEL = "VAULT_MARK_PROMPT_DONE";
const VAULT_COPY_ROADMAP_HANDOFF_CHANNEL = "VAULT_COPY_ROADMAP_HANDOFF";
const EXTENSION_REFRESH_STATUS_CHANNEL = "EXTENSION_REFRESH_STATUS";
const EXTENSION_SETUP_ONCE_CHANNEL = "EXTENSION_SETUP_ONCE";
const EXTENSION_CONNECT_INSTALLED_CHANNEL = "EXTENSION_CONNECT_INSTALLED";
const EXTENSION_COPY_PATH_CHANNEL = "EXTENSION_COPY_PATH";
const EXTENSION_COPY_URL_CHANNEL = "EXTENSION_COPY_URL";
const EXTENSION_OPEN_FOLDER_CHANNEL = "EXTENSION_OPEN_FOLDER";
const EXTENSION_OPEN_MANAGE_PAGE_CHANNEL = "EXTENSION_OPEN_MANAGE_PAGE";

function onChannel(channel, callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("copypasteDesktop", {
  sendWorkflow: (payload) => ipcRenderer.invoke(TRIGGER_WORKFLOW_CHANNEL, payload),
  getVaultState: () => ipcRenderer.invoke(VAULT_GET_STATE_CHANNEL),
  updateVaultSettings: (payload) => ipcRenderer.invoke(VAULT_UPDATE_SETTINGS_CHANNEL, payload),
  generatePromptPack: (payload) => ipcRenderer.invoke(VAULT_GENERATE_PACK_CHANNEL, payload),
  copyChunk: (payload) => ipcRenderer.invoke(VAULT_COPY_CHUNK_CHANNEL, payload),
  copyLauncher: (payload) => ipcRenderer.invoke(VAULT_COPY_LAUNCHER_CHANNEL, payload),
  markChunk: (payload) => ipcRenderer.invoke(VAULT_MARK_CHUNK_CHANNEL, payload),
  openFolder: (payload) => ipcRenderer.invoke(VAULT_OPEN_FOLDER_CHANNEL, payload),
  deletePack: (payload) => ipcRenderer.invoke(VAULT_DELETE_PACK_CHANNEL, payload),
  deleteTask: (payload) => ipcRenderer.invoke(VAULT_DELETE_TASK_CHANNEL, payload),
  deleteProject: (payload) => ipcRenderer.invoke(VAULT_DELETE_PROJECT_CHANNEL, payload),
  updateChunkContent: (payload) => ipcRenderer.invoke(VAULT_UPDATE_CHUNK_CONTENT_CHANNEL, payload),
  addChunkVersion: (payload) => ipcRenderer.invoke(VAULT_ADD_CHUNK_VERSION_CHANNEL, payload),
  applyChunkVersion: (payload) => ipcRenderer.invoke(VAULT_APPLY_CHUNK_VERSION_CHANNEL, payload),
  addChunkRunHistory: (payload) => ipcRenderer.invoke(VAULT_ADD_CHUNK_RUN_HISTORY_CHANNEL, payload),
  createManualChunk: (payload) => ipcRenderer.invoke(VAULT_CREATE_MANUAL_CHUNK_CHANNEL, payload),
  buildChunkImprovePrompt: (payload) => ipcRenderer.invoke(VAULT_BUILD_CHUNK_IMPROVE_PROMPT_CHANNEL, payload),
  saveProjectBrief: (payload) => ipcRenderer.invoke(VAULT_SAVE_PROJECT_BRIEF_CHANNEL, payload),
  createDebateWorkflow: (payload) => ipcRenderer.invoke(VAULT_CREATE_DEBATE_WORKFLOW_CHANNEL, payload),
  getActiveDebateWorkflow: (payload) => ipcRenderer.invoke(VAULT_GET_ACTIVE_DEBATE_WORKFLOW_CHANNEL, payload),
  getDebateWorkflow: (payload) => ipcRenderer.invoke(VAULT_GET_DEBATE_WORKFLOW_CHANNEL, payload),
  saveDebateRound: (payload) => ipcRenderer.invoke(VAULT_SAVE_DEBATE_ROUND_CHANNEL, payload),
  advanceDebateWorkflow: (payload) => ipcRenderer.invoke(VAULT_ADVANCE_DEBATE_WORKFLOW_CHANNEL, payload),
  completeDebateWorkflow: (payload) => ipcRenderer.invoke(VAULT_COMPLETE_DEBATE_WORKFLOW_CHANNEL, payload),
  createMasterPlanVersionFromDebate: (payload) => ipcRenderer.invoke(VAULT_CREATE_MASTER_PLAN_FROM_DEBATE_CHANNEL, payload),
  addMasterPlanVersion: (payload) => ipcRenderer.invoke(VAULT_ADD_MASTER_PLAN_VERSION_CHANNEL, payload),
  applyMasterPlanVersion: (payload) => ipcRenderer.invoke(VAULT_APPLY_MASTER_PLAN_VERSION_CHANNEL, payload),
  archiveMasterPlanVersion: (payload) => ipcRenderer.invoke(VAULT_ARCHIVE_MASTER_PLAN_VERSION_CHANNEL, payload),
  listMasterPlanVersions: (payload) => ipcRenderer.invoke(VAULT_LIST_MASTER_PLAN_VERSIONS_CHANNEL, payload),
  addRoadmapVersion: (payload) => ipcRenderer.invoke(VAULT_ADD_ROADMAP_VERSION_CHANNEL, payload),
  prepareRoadmapGeneration: (payload) => ipcRenderer.invoke(VAULT_PREPARE_ROADMAP_GENERATION_CHANNEL, payload),
  applyRoadmapVersion: (payload) => ipcRenderer.invoke(VAULT_APPLY_ROADMAP_VERSION_CHANNEL, payload),
  listRoadmapVersions: (payload) => ipcRenderer.invoke(VAULT_LIST_ROADMAP_VERSIONS_CHANNEL, payload),
  archiveRoadmapVersion: (payload) => ipcRenderer.invoke(VAULT_ARCHIVE_ROADMAP_VERSION_CHANNEL, payload),
  getRoadmapItemEligibility: (payload) => ipcRenderer.invoke(VAULT_GET_ROADMAP_ELIGIBILITY_CHANNEL, payload),
  getNextEligibleRoadmapItem: (payload) => ipcRenderer.invoke(VAULT_GET_NEXT_ROADMAP_ITEM_CHANNEL, payload),
  markRoadmapItemInProgress: (payload) => ipcRenderer.invoke(VAULT_MARK_ROADMAP_IN_PROGRESS_CHANNEL, payload),
  markRoadmapItemDone: (payload) => ipcRenderer.invoke(VAULT_MARK_ROADMAP_DONE_CHANNEL, payload),
  createTaskPromptFromRoadmapItem: (payload) => ipcRenderer.invoke(VAULT_CREATE_TASK_PROMPT_CHANNEL, payload),
  updateTaskPromptContentById: (payload) => ipcRenderer.invoke(VAULT_UPDATE_TASK_PROMPT_CHANNEL, payload),
  addTaskPromptVersion: (payload) => ipcRenderer.invoke(VAULT_ADD_TASK_PROMPT_VERSION_CHANNEL, payload),
  applyTaskPromptVersion: (payload) => ipcRenderer.invoke(VAULT_APPLY_TASK_PROMPT_VERSION_CHANNEL, payload),
  listTaskPromptVersions: (payload) => ipcRenderer.invoke(VAULT_LIST_TASK_PROMPT_VERSIONS_CHANNEL, payload),
  prepareTaskImprovePrompt: (payload) => ipcRenderer.invoke(VAULT_PREPARE_TASK_IMPROVE_CHANNEL, payload),
  saveTaskImproveResponse: (payload) => ipcRenderer.invoke(VAULT_SAVE_TASK_IMPROVE_CHANNEL, payload),
  approveTaskPrompt: (payload) => ipcRenderer.invoke(VAULT_APPROVE_TASK_PROMPT_CHANNEL, payload),
  copyCodexHandoff: (payload) => ipcRenderer.invoke(VAULT_COPY_CODEX_HANDOFF_CHANNEL, payload),
  markTaskPromptDone: (payload) => ipcRenderer.invoke(VAULT_MARK_TASK_PROMPT_DONE_CHANNEL, payload),
  startRoadmapPrompt: (payload) => ipcRenderer.invoke(VAULT_START_ROADMAP_PROMPT_CHANNEL, payload),
  approvePrompt: (payload) => ipcRenderer.invoke(VAULT_APPROVE_PROMPT_CHANNEL, payload),
  copyPromptToCodex: (payload) => ipcRenderer.invoke(VAULT_COPY_PROMPT_TO_CODEX_CHANNEL, payload),
  markPromptDone: (payload) => ipcRenderer.invoke(VAULT_MARK_PROMPT_DONE_CHANNEL, payload),
  copyRoadmapHandoff: (payload) => ipcRenderer.invoke(VAULT_COPY_ROADMAP_HANDOFF_CHANNEL, payload),
  refreshExtensionStatus: () => ipcRenderer.invoke(EXTENSION_REFRESH_STATUS_CHANNEL),
  setupExtensionOnce: () => ipcRenderer.invoke(EXTENSION_SETUP_ONCE_CHANNEL),
  connectInstalledExtension: () => ipcRenderer.invoke(EXTENSION_CONNECT_INSTALLED_CHANNEL),
  copyExtensionPath: () => ipcRenderer.invoke(EXTENSION_COPY_PATH_CHANNEL),
  copyExtensionsUrl: () => ipcRenderer.invoke(EXTENSION_COPY_URL_CHANNEL),
  openExtensionFolder: () => ipcRenderer.invoke(EXTENSION_OPEN_FOLDER_CHANNEL),
  openExtensionManagePage: () => ipcRenderer.invoke(EXTENSION_OPEN_MANAGE_PAGE_CHANNEL),
  onResponse: (callback) => onChannel(RESPONSE_CHANNEL, callback),
  onStatus: (callback) => onChannel(STATUS_CHANNEL, callback),
  onVaultState: (callback) => onChannel(VAULT_STATE_CHANNEL, callback)
});

contextBridge.exposeInMainWorld("copypasteProtocol", {
  listWorkflowSteps: () => projectBuilderProtocol.listWorkflowSteps(),
  listPlanningDebateStages: () => projectBuilderProtocol.listPlanningDebateStages(),
  getPlanningDebateStage: (stageId) => projectBuilderProtocol.getPlanningDebateStage(stageId),
  getNextPlanningDebateStage: (stageId) => projectBuilderProtocol.getNextPlanningDebateStage(stageId),
  createProjectBuilderDebate: (input) => projectBuilderProtocol.createProjectBuilderDebate(input),
  buildPlanningDebatePrompt: (workflow, project, priorRounds) => projectBuilderProtocol.buildPlanningDebatePrompt(workflow, project, priorRounds),
  buildRoadmapPrompt: (project, activeMasterPlan) => projectBuilderProtocol.buildRoadmapPrompt(project, activeMasterPlan),
  buildTaskImprovePrompt: (project, taskPrompt, activeMasterPlan, runHistory) => projectBuilderProtocol.buildTaskImprovePrompt(project, taskPrompt, activeMasterPlan, runHistory),
  createNextDebatePrompt: (debate) => projectBuilderProtocol.createNextDebatePrompt(debate),
  saveDebateRound: (debate, input) => projectBuilderProtocol.saveDebateRound(debate, input),
  advanceDebateStage: (debate) => projectBuilderProtocol.advanceDebateStage(debate)
});

contextBridge.exposeInMainWorld("nextstepApp", {
  getVersion: () => process.versions.electron
});

contextBridge.exposeInMainWorld("nextstepStorage", {
  loadState: () => ipcRenderer.invoke("storage:load"),
  saveState: (state) => ipcRenderer.invoke("storage:save", state),
  exportState: () => ipcRenderer.invoke("storage:export"),
  importState: (state) => ipcRenderer.invoke("storage:import", state),
  exportWithDialog: () => ipcRenderer.invoke("storage:export-dialog"),
  importWithDialog: () => ipcRenderer.invoke("storage:import-dialog")
});

contextBridge.exposeInMainWorld("nextstepClipboard", {
  copyText: (text) => ipcRenderer.invoke("clipboard:copy-text", text),
  readText: () => ipcRenderer.invoke("clipboard:read-text")
});

contextBridge.exposeInMainWorld("nextstepAI", {
  startAnalysis: (payload) => ipcRenderer.invoke("ai:start-analysis", payload),
  cancelAnalysis: () => ipcRenderer.invoke("ai:cancel-analysis"),
  retryExtraction: (payload) => ipcRenderer.invoke("ai:retry-extraction", payload),
  onStatusChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("ai:status-changed", handler);
    return () => ipcRenderer.removeListener("ai:status-changed", handler);
  },
  onAnalysisFinished: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("ai:analysis-finished", handler);
    return () => ipcRenderer.removeListener("ai:analysis-finished", handler);
  },
  onAnalysisFailed: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("ai:analysis-failed", handler);
    return () => ipcRenderer.removeListener("ai:analysis-failed", handler);
  }
});

contextBridge.exposeInMainWorld("nextstepDebateRunner", {
  startRound: (payload) => ipcRenderer.invoke("debate:start-round", payload),
  cancelRound: () => ipcRenderer.invoke("debate:cancel-round"),
  onStatusChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("debate:status-changed", handler);
    return () => ipcRenderer.removeListener("debate:status-changed", handler);
  },
  onRoundFinished: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("debate:round-finished", handler);
    return () => ipcRenderer.removeListener("debate:round-finished", handler);
  },
  onRoundFailed: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("debate:round-failed", handler);
    return () => ipcRenderer.removeListener("debate:round-failed", handler);
  }
});

contextBridge.exposeInMainWorld("nextstepBrowser", {
  openChatGPT: () => ipcRenderer.invoke("browser:open-chatgpt")
});

contextBridge.exposeInMainWorld("nextstepSelectors", {
  load: () => ipcRenderer.invoke("selectors:load"),
  save: (selectors) => ipcRenderer.invoke("selectors:save", selectors),
  resetDefaults: () => ipcRenderer.invoke("selectors:reset-defaults")
});
