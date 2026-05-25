const { contextBridge, ipcRenderer } = require("electron");
const projectBuilderProtocol = require("../../packages/protocol");

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

function onChannel(channel, callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("copypasteDesktop", {
  sendWorkflow: (payload) => ipcRenderer.send(TRIGGER_WORKFLOW_CHANNEL, payload),
  getVaultState: () => ipcRenderer.invoke(VAULT_GET_STATE_CHANNEL),
  generatePromptPack: (payload) => ipcRenderer.invoke(VAULT_GENERATE_PACK_CHANNEL, payload),
  copyChunk: (payload) => ipcRenderer.invoke(VAULT_COPY_CHUNK_CHANNEL, payload),
  copyLauncher: (payload) => ipcRenderer.invoke(VAULT_COPY_LAUNCHER_CHANNEL, payload),
  markChunk: (payload) => ipcRenderer.invoke(VAULT_MARK_CHUNK_CHANNEL, payload),
  openFolder: (payload) => ipcRenderer.invoke(VAULT_OPEN_FOLDER_CHANNEL, payload),
  deletePack: (payload) => ipcRenderer.invoke(VAULT_DELETE_PACK_CHANNEL, payload),
  onResponse: (callback) => onChannel(RESPONSE_CHANNEL, callback),
  onStatus: (callback) => onChannel(STATUS_CHANNEL, callback),
  onVaultState: (callback) => onChannel(VAULT_STATE_CHANNEL, callback)
});

contextBridge.exposeInMainWorld("copypasteProtocol", {
  listWorkflowSteps: () => projectBuilderProtocol.listWorkflowSteps(),
  createProjectBuilderDebate: (input) => projectBuilderProtocol.createProjectBuilderDebate(input),
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
