const { contextBridge, ipcRenderer } = require("electron");

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
