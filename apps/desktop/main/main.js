const fs = require("node:fs/promises");
const { app, BrowserWindow, ipcMain, clipboard, dialog } = require("electron");
const path = require("path");
const storage = require("./storage");
const browserContext = require("./browser-context");
const selectorsStore = require("./providers/selectors-store");
const aiRunner = require("./ai-runner");
const debateRunner = require("./debate-runner");

const AI_STATUS_CHANNEL = "ai:status-changed";
const AI_FINISHED_CHANNEL = "ai:analysis-finished";
const AI_FAILED_CHANNEL = "ai:analysis-failed";
const DEBATE_STATUS_CHANNEL = "debate:status-changed";
const DEBATE_FINISHED_CHANNEL = "debate:round-finished";
const DEBATE_FAILED_CHANNEL = "debate:round-failed";

function emitToWindow(channel, payload) {
  const window = BrowserWindow.getAllWindows()[0];
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

function hasMinimalStateShape(value) {
  return Boolean(value && typeof value === "object" && Array.isArray(value.projects) && Array.isArray(value.tasks));
}

function registerStorageIpc() {
  ipcMain.handle("storage:load", async () => storage.loadState());
  ipcMain.handle("storage:save", async (_event, state) => storage.saveState(state));
  ipcMain.handle("storage:export", async () => storage.exportState());
  ipcMain.handle("storage:import", async (_event, importedState) => storage.importState(importedState));

  ipcMain.handle("storage:export-dialog", async () => {
    const window = BrowserWindow.getAllWindows()[0];
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: "Export NextStep State",
      defaultPath: "nextstep-export.json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (canceled || !filePath) return { ok: false, cancelled: true };
    const state = await storage.exportState();
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
    return { ok: true, filePath };
  });

  ipcMain.handle("storage:import-dialog", async () => {
    const window = BrowserWindow.getAllWindows()[0];
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: "Import NextStep State",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (canceled || !filePaths || !filePaths[0]) return { ok: false, cancelled: true };

    const raw = await fs.readFile(filePaths[0], "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Import failed: invalid JSON file.");
    }
    if (!hasMinimalStateShape(parsed)) {
      throw new Error("Import failed: file is missing required projects/tasks arrays.");
    }

    const state = await storage.importState(parsed);
    return { ok: true, state, filePath: filePaths[0] };
  });
}

function registerClipboardIpc() {
  ipcMain.handle("clipboard:copy-text", async (_event, text) => {
    clipboard.writeText(String(text || ""));
    return true;
  });
  ipcMain.handle("clipboard:read-text", async () => clipboard.readText());
}

function registerAiIpc() {
  ipcMain.handle("ai:start-analysis", async (_event, payload) => {
    const taskId = payload?.taskId ? String(payload.taskId) : "";
    const prompt = payload?.prompt ? String(payload.prompt) : "";
    const settings = payload?.settings && typeof payload.settings === "object" ? payload.settings : {};

    if (!taskId) {
      const error = "Missing taskId for analysis.";
      emitToWindow(AI_FAILED_CHANNEL, { taskId: null, error });
      throw new Error(error);
    }

    return aiRunner.startAnalysis({
      app,
      taskId,
      prompt,
      settings,
      emitStatus: (statusPayload) => emitToWindow(AI_STATUS_CHANNEL, statusPayload),
      emitFinished: (finishedPayload) => emitToWindow(AI_FINISHED_CHANNEL, finishedPayload),
      emitFailed: (failedPayload) => emitToWindow(AI_FAILED_CHANNEL, failedPayload),
      emitWarning: (warningPayload) => emitToWindow(AI_STATUS_CHANNEL, { ...warningPayload, status: "warning" })
    });
  });

  ipcMain.handle("ai:cancel-analysis", async () => aiRunner.cancelActiveAnalysis());
  ipcMain.handle("ai:retry-extraction", async (_event, payload) => {
    const taskId = payload?.taskId ? String(payload.taskId) : "";
    return aiRunner.retryExtraction({
      taskId,
      emitFinished: (finishedPayload) => emitToWindow(AI_FINISHED_CHANNEL, finishedPayload)
    });
  });
}

function registerDebateIpc() {
  ipcMain.handle("debate:start-round", async (_event, payload) => {
    const debateId = payload?.debateId ? String(payload.debateId) : "";
    const roundId = payload?.roundId ? String(payload.roundId) : "";
    const prompt = payload?.prompt ? String(payload.prompt) : "";
    const provider = payload?.provider ? String(payload.provider) : "manual";
    const settings = payload?.settings && typeof payload.settings === "object" ? payload.settings : {};

    return debateRunner.startRound({
      app,
      debateId,
      roundId,
      provider,
      prompt,
      settings,
      emitStatus: (statusPayload) => emitToWindow(DEBATE_STATUS_CHANNEL, statusPayload),
      emitFinished: (finishedPayload) => emitToWindow(DEBATE_FINISHED_CHANNEL, finishedPayload),
      emitFailed: (failedPayload) => emitToWindow(DEBATE_FAILED_CHANNEL, failedPayload),
      emitWarning: (warningPayload) => emitToWindow(DEBATE_STATUS_CHANNEL, warningPayload)
    });
  });

  ipcMain.handle("debate:cancel-round", async () => debateRunner.cancelRound());
}

function registerBrowserIpc() {
  ipcMain.handle("browser:open-chatgpt", async () => {
    const { browserName } = await browserContext.openChatGPT(app);
    return { ok: true, browserName };
  });
}

function registerSelectorsIpc() {
  ipcMain.handle("selectors:load", async () => selectorsStore.loadSelectors());
  ipcMain.handle("selectors:save", async (_event, selectors) => selectorsStore.saveSelectors(selectors));
  ipcMain.handle("selectors:reset-defaults", async () => selectorsStore.resetSelectorsToDefaults());
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1260,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(() => {
  const userDataPath = app.getPath("userData");
  storage.initializeStorage(userDataPath);
  selectorsStore.initializeSelectorsStore(userDataPath);

  registerStorageIpc();
  registerClipboardIpc();
  registerAiIpc();
  registerDebateIpc();
  registerBrowserIpc();
  registerSelectorsIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async () => {
  await browserContext.closeAllBrowserContexts();
});

app.on("window-all-closed", async () => {
  await browserContext.closeAllBrowserContexts();
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", async (error) => {
  console.error("uncaughtException", error);
  await browserContext.closeAllBrowserContexts();
  app.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("unhandledRejection", error);
});
