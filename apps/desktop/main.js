const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain, clipboard, shell } = require("electron");
const { WebSocketServer, WebSocket } = require("ws");
const { createVaultStore } = require("./prompt-vault");
const {
  createSessionToken,
  writeSessionTokenFile,
  createSessionGate
} = require("./main/ws-session");

const WS_PORT = 8080;
const EXTENSION_MESSAGE_CHANNEL = "AI_RESPONSE_RECEIVED";
const STATUS_CHANNEL = "WORKFLOW_STATUS";
const TRIGGER_WORKFLOW_CHANNEL = "TRIGGER_AI_WORKFLOW";
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
const COPYPASTE_EXTENSION_ID = "akbkdpfnbkafgnfanoddlkdlgdlkacdk";
const COPYPASTE_EXTENSION_WAKE_URL = `chrome-extension://${COPYPASTE_EXTENSION_ID}/wake.html`;
const CHROME_EXTENSIONS_URL = "chrome://extensions";
const EXTENSION_STATE = Object.freeze({
  CONNECTED: "connected",
  LOADED: "loaded",
  DISCONNECTED: "disconnected",
  ERROR: "error"
});

let mainWindow = null;
let extensionSocket = null;
let extensionState = EXTENSION_STATE.DISCONNECTED;
let connectionCounter = 0;
let vaultStore = null;

const extensionRoot = path.join(__dirname, "..", "extension");
const wsSessionToken = createSessionToken();
writeSessionTokenFile(extensionRoot, wsSessionToken);

const wss = new WebSocketServer({ port: WS_PORT });

function logServer(message, details) {
  if (details) {
    console.log(`[Next Step][WS] ${message}`, details);
    return;
  }

  console.log(`[Next Step][WS] ${message}`);
}

function isSocketOpen(socket) {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

function normalizeExtensionState(state) {
  return Object.values(EXTENSION_STATE).includes(state) ? state : EXTENSION_STATE.DISCONNECTED;
}

function setExtensionState(state) {
  extensionState = normalizeExtensionState(state);
  return extensionState;
}

function getExtensionState() {
  if (isSocketOpen(extensionSocket)) {
    return EXTENSION_STATE.CONNECTED;
  }

  if (extensionState === EXTENSION_STATE.CONNECTED) {
    return EXTENSION_STATE.DISCONNECTED;
  }

  return extensionState;
}

function getExtensionStatusMessage(state) {
  const safeState = normalizeExtensionState(state);

  if (safeState === EXTENSION_STATE.CONNECTED) {
    return "Extension connected. Ready for next AI step.";
  }

  if (safeState === EXTENSION_STATE.LOADED) {
    return "Extension loaded, waiting for WebSocket handshake.";
  }

  if (safeState === EXTENSION_STATE.ERROR) {
    return "Extension connection check failed. Click Connect extension. If this is first use, click Setup extension once.";
  }

  return "Extension is not connected. Install it once, then click Connect extension.";
}

function getVaultStore() {
  if (!vaultStore) {
    vaultStore = createVaultStore({
      dbPath: path.join(app.getPath("userData"), "prompt-vault-db.json")
    });
  }

  return vaultStore;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 980,
    minHeight: 620,
    title: "AI Project Builder",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    logServer("Renderer window is not available; dropping message.", payload);
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function sendStatusToRenderer(message, tone = "neutral") {
  sendToRenderer(STATUS_CHANNEL, {
    message,
    tone,
    extensionState: getExtensionState(),
    nextTarget: "ChatGPT"
  });
}

function sendWorkflowStatusToRenderer(message, tone = "neutral", nextTarget = "ChatGPT", state = getExtensionState()) {
  sendToRenderer(STATUS_CHANNEL, {
    message,
    tone,
    extensionState: normalizeExtensionState(state),
    nextTarget
  });
}

function sendVaultStateToRenderer(state) {
  sendToRenderer(VAULT_STATE_CHANNEL, state);
}

async function invokeSafely(handler) {
  try {
    return await handler();
  } catch (error) {
    logServer("IPC handler failed.", { error: error.message });
    return {
      ok: false,
      error: error.message || "IPC handler failed."
    };
  }
}

function sendWorkflowToExtension(payload) {
  if (!isSocketOpen(extensionSocket)) {
    const state = getExtensionState();
    const errorPayload = {
      ok: false,
      extensionState: state,
      error: "Chrome extension WebSocket client is not connected."
    };
    if (state === EXTENSION_STATE.LOADED) {
      errorPayload.error = "Extension is loaded but not connected. Click Connect extension, wait for Connected, then retry.";
    } else if (state === EXTENSION_STATE.DISCONNECTED) {
      errorPayload.error = "Extension is not connected. Install it once, then click Connect extension.";
    }
    logServer("Cannot dispatch workflow; extension socket is not active.");
    sendStatusToRenderer(errorPayload.error, "error");
    return errorPayload;
  }

  const serialized = JSON.stringify(payload);
  logServer("Dispatching workflow payload to extension.", payload);
  try {
    extensionSocket.send(serialized);
    return {
      ok: true,
      extensionState: EXTENSION_STATE.CONNECTED
    };
  } catch (error) {
    setExtensionState(EXTENSION_STATE.DISCONNECTED);
    const errorPayload = {
      ok: false,
      extensionState: EXTENSION_STATE.DISCONNECTED,
      error: error.message || "Chrome extension WebSocket client is not connected."
    };
    sendStatusToRenderer(errorPayload.error, "error");
    return errorPayload;
  }
}

function launchDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve(command);
    });
  });
}

function getChromeCandidates() {
  const candidates = [
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env.ProgramW6432 ? path.join(process.env.ProgramW6432, "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe") : "",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  const seen = new Set();

  return candidates.filter((candidate) => {
    const key = path.normalize(candidate).toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function resolveChromeExecutable() {
  const candidates = getChromeCandidates();
  const executable = candidates.find((candidate) => fs.existsSync(candidate));

  if (!executable) {
    throw new Error(`Google Chrome executable was not found. Checked: ${candidates.join(", ")}`);
  }

  return executable;
}

function assertExtensionFilesExist() {
  const manifestPath = path.join(extensionRoot, "manifest.json");
  const wakePagePath = path.join(extensionRoot, "wake.html");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`CopyPaste extension manifest was not found at ${manifestPath}.`);
  }

  if (!fs.existsSync(wakePagePath)) {
    throw new Error(`CopyPaste extension wake page was not found at ${wakePagePath}.`);
  }
}

async function openChromeUrl(url) {
  if (process.platform === "win32") {
    const chromeExecutable = resolveChromeExecutable();
    try {
      await launchDetached(chromeExecutable, [url]);
    } catch (error) {
      throw new Error(`Could not start Google Chrome at ${chromeExecutable}: ${error.message}`);
    }

    return chromeExecutable;
  }

  await shell.openExternal(url);
  return "default-browser";
}

async function openChromeExtensionsPage() {
  if (process.platform === "win32") {
    const chromeExecutable = resolveChromeExecutable();
    try {
      await launchDetached(chromeExecutable, ["--new-window", CHROME_EXTENSIONS_URL]);
    } catch (error) {
      throw new Error(`Could not start Google Chrome at ${chromeExecutable}: ${error.message}`);
    }

    return chromeExecutable;
  }

  await shell.openExternal(CHROME_EXTENSIONS_URL);
  return "default-browser";
}

async function setupExtensionOnce() {
  assertExtensionFilesExist();
  clipboard.writeText(extensionRoot);
  const openedWith = await openChromeExtensionsPage();
  const message = "Setup started. If Chrome opened a blank tab, type chrome://extensions in the address bar. Extension path is copied and shown below.";

  sendWorkflowStatusToRenderer(message, "neutral", "ChatGPT", getExtensionState());

  return {
    ok: true,
    openedWith,
    setupUrl: CHROME_EXTENSIONS_URL,
    extensionPath: extensionRoot,
    extensionsUrl: CHROME_EXTENSIONS_URL,
    manualFallback: "If Chrome opened a blank tab, type chrome://extensions in the address bar."
  };
}

async function copyExtensionPath() {
  clipboard.writeText(extensionRoot);
  return {
    ok: true,
    extensionPath: extensionRoot
  };
}

async function copyExtensionsUrl() {
  clipboard.writeText(CHROME_EXTENSIONS_URL);
  return {
    ok: true,
    extensionsUrl: CHROME_EXTENSIONS_URL
  };
}

async function openExtensionFolder() {
  const errorMessage = await shell.openPath(extensionRoot);
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return {
    ok: true,
    extensionPath: extensionRoot
  };
}

function requestExtensionManagePageOpen() {
  if (!isSocketOpen(extensionSocket)) {
    return {
      ok: false,
      extensionState: getExtensionState(),
      error: "Extension is not connected. Click Connect extension first."
    };
  }

  try {
    extensionSocket.send(JSON.stringify({
      type: "OPEN_EXTENSIONS_PAGE"
    }));
  } catch (error) {
    return {
      ok: false,
      extensionState: getExtensionState(),
      error: error.message || "Could not request extension manage page."
    };
  }

  return {
    ok: true,
    extensionState: getExtensionState()
  };
}

async function connectInstalledExtension() {
  assertExtensionFilesExist();
  const openedWith = await openChromeUrl(COPYPASTE_EXTENSION_WAKE_URL);
  const currentState = getExtensionState();
  const state = currentState === EXTENSION_STATE.CONNECTED
    ? EXTENSION_STATE.CONNECTED
    : setExtensionState(EXTENSION_STATE.LOADED);

  const message = state === EXTENSION_STATE.CONNECTED
    ? getExtensionStatusMessage(EXTENSION_STATE.CONNECTED)
    : getExtensionStatusMessage(EXTENSION_STATE.LOADED);
  const tone = state === EXTENSION_STATE.CONNECTED ? "success" : "neutral";

  sendWorkflowStatusToRenderer(message, tone, "ChatGPT", state);

  return {
    ok: true,
    openedWith,
    extensionId: COPYPASTE_EXTENSION_ID,
    wakeUrl: COPYPASTE_EXTENSION_WAKE_URL,
    extensionState: state
  };
}

ipcMain.handle(TRIGGER_WORKFLOW_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  return sendWorkflowToExtension({
    chatgptPrefix: String(safePayload.chatgptPrefix || ""),
    claudePrefix: String(safePayload.claudePrefix || ""),
    text: String(safePayload.text || ""),
    targetProvider: String(safePayload.targetProvider || ""),
    currentStageId: String(safePayload.currentStageId || ""),
    currentStageLabel: String(safePayload.currentStageLabel || ""),
    currentRole: String(safePayload.currentRole || "")
  });
}));

ipcMain.handle(VAULT_GET_STATE_CHANNEL, () => invokeSafely(async () => ({
  ok: true,
  state: getVaultStore().getState()
})));

ipcMain.handle(VAULT_UPDATE_SETTINGS_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().updateSettings(payload || {});
  sendVaultStateToRenderer(result.state);
  return {
    ok: true,
    state: result.state
  };
}));

ipcMain.handle(VAULT_GENERATE_PACK_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().generatePromptPack(payload || {});

  sendVaultStateToRenderer(result.state);
  sendStatusToRenderer(`Codex prompts exported: ${result.pack.exportPath}`, "success");

  return {
    ok: true,
    project: result.project,
    pack: result.pack,
    state: result.state
  };
}));

ipcMain.handle(VAULT_COPY_CHUNK_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const packId = String(payload && payload.packId || "");
  const chunkId = String(payload && payload.chunkId || "");
  const promptData = getVaultStore().getChunkPrompt(packId, chunkId);
  const updated = getVaultStore().updateChunkStatus(packId, chunkId, "copied");

  clipboard.writeText(promptData.prompt);
  sendVaultStateToRenderer(updated.state);
  sendStatusToRenderer(`Copied task ${String(promptData.chunk.order).padStart(3, "0")} to clipboard.`, "success");

  return {
    ok: true,
    chunk: updated.chunk,
    state: updated.state
  };
}));

ipcMain.handle(VAULT_COPY_LAUNCHER_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const packId = String(payload && payload.packId || "");
  const chunkId = String(payload && payload.chunkId || "");
  const launcherData = getVaultStore().getChunkLauncher(packId, chunkId);
  const updated = getVaultStore().updateChunkStatus(packId, chunkId, "launcher_copied");

  clipboard.writeText(launcherData.launcher);
  sendVaultStateToRenderer(updated.state);
  sendStatusToRenderer(`Copied Codex start for task ${String(launcherData.chunk.order).padStart(3, "0")}.`, "success");

  return {
    ok: true,
    chunk: updated.chunk,
    state: updated.state
  };
}));

ipcMain.handle(VAULT_MARK_CHUNK_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().updateChunkStatus(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || ""),
    String(payload && payload.status || "done")
  );

  sendVaultStateToRenderer(result.state);

  return {
    ok: true,
    chunk: result.chunk,
    state: result.state
  };
}));

ipcMain.handle(VAULT_OPEN_FOLDER_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const folderPath = String(payload && payload.folderPath || "");

  if (!folderPath) {
    throw new Error("Folder path is required.");
  }

  const errorMessage = await shell.openPath(folderPath);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return {
    ok: true
  };
}));

ipcMain.handle(VAULT_DELETE_PACK_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const packId = String(payload && payload.packId || "");
  const result = getVaultStore().deletePromptPack(packId);

  sendVaultStateToRenderer(result.state);
  sendStatusToRenderer(`Deleted Codex prompts: ${result.deletedPack.title}.`, "success");

  return {
    ok: true,
    deletedPack: result.deletedPack,
    state: result.state
  };
}));

ipcMain.handle(VAULT_DELETE_TASK_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().deleteTask(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || "")
  );
  sendVaultStateToRenderer(result.state);
  sendStatusToRenderer(`Deleted task: ${result.deletedTask.title}.`, "success");
  return {
    ok: true,
    deletedTask: result.deletedTask,
    state: result.state
  };
}));

ipcMain.handle(VAULT_DELETE_PROJECT_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().deleteProject(String(payload && payload.projectId || ""));
  sendVaultStateToRenderer(result.state);
  sendStatusToRenderer(`Removed project from browser: ${result.deletedProject.name}.`, "success");
  return {
    ok: true,
    deletedProject: result.deletedProject,
    state: result.state
  };
}));

ipcMain.handle(EXTENSION_REFRESH_STATUS_CHANNEL, () => invokeSafely(async () => {
  const state = getExtensionState();
  const connected = state === EXTENSION_STATE.CONNECTED;
  const message = getExtensionStatusMessage(state);
  const tone = connected ? "success" : state === EXTENSION_STATE.ERROR ? "error" : "neutral";

  sendWorkflowStatusToRenderer(message, tone, "ChatGPT", state);

  return {
    ok: true,
    connected,
    extensionState: state,
    message
  };
}));

ipcMain.handle(VAULT_UPDATE_CHUNK_CONTENT_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().updateChunkContent(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || ""),
    payload || {}
  );
  sendVaultStateToRenderer(result.state);
  return {
    ok: true,
    chunk: result.chunk,
    state: result.state
  };
}));

ipcMain.handle(VAULT_ADD_CHUNK_VERSION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().addChunkVersion(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || ""),
    payload || {}
  );
  sendVaultStateToRenderer(result.state);
  return {
    ok: true,
    version: result.version,
    chunk: result.chunk,
    state: result.state
  };
}));

ipcMain.handle(VAULT_APPLY_CHUNK_VERSION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().applyChunkVersion(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || ""),
    String(payload && payload.versionId || "")
  );
  sendVaultStateToRenderer(result.state);
  return {
    ok: true,
    version: result.version,
    chunk: result.chunk,
    state: result.state
  };
}));

ipcMain.handle(VAULT_ADD_CHUNK_RUN_HISTORY_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().addChunkRunHistory(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || ""),
    payload || {}
  );
  sendVaultStateToRenderer(result.state);
  return {
    ok: true,
    runItem: result.runItem,
    chunk: result.chunk,
    state: result.state
  };
}));

ipcMain.handle(VAULT_CREATE_MANUAL_CHUNK_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().createManualChunk(
    String(payload && payload.packId || ""),
    payload || {}
  );
  sendVaultStateToRenderer(result.state);
  return {
    ok: true,
    chunk: result.chunk,
    state: result.state
  };
}));

ipcMain.handle(VAULT_BUILD_CHUNK_IMPROVE_PROMPT_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().buildChunkImprovePrompt(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || "")
  );
  return {
    ok: true,
    prompt: result.prompt,
    chunk: result.chunk,
    pack: result.pack
  };
}));

ipcMain.handle(VAULT_SAVE_PROJECT_BRIEF_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().saveProjectBrief(payload || {});
  sendVaultStateToRenderer(result.state);
  return { ok: true, project: result.project, state: result.state };
}));

ipcMain.handle(VAULT_CREATE_DEBATE_WORKFLOW_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().createDebateWorkflow(String(payload && payload.projectId || ""));
  sendVaultStateToRenderer(result.state);
  return { ok: true, workflow: result.workflow, state: result.state };
}));

ipcMain.handle(VAULT_GET_ACTIVE_DEBATE_WORKFLOW_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().getActiveDebateWorkflow(String(payload && payload.projectId || ""));
  return { ok: true, workflow: result.workflow, state: result.state };
}));

ipcMain.handle(VAULT_GET_DEBATE_WORKFLOW_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().getDebateWorkflow(String(payload && payload.workflowId || ""));
  return { ok: true, workflow: result.workflow, state: result.state };
}));

ipcMain.handle(VAULT_SAVE_DEBATE_ROUND_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().saveDebateRound(
    String(payload && payload.workflowId || ""),
    payload || {}
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, workflow: result.workflow, round: result.round, state: result.state };
}));

ipcMain.handle(VAULT_ADVANCE_DEBATE_WORKFLOW_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().advanceDebateWorkflow(String(payload && payload.workflowId || ""));
  sendVaultStateToRenderer(result.state);
  return { ok: true, workflow: result.workflow, state: result.state };
}));

ipcMain.handle(VAULT_COMPLETE_DEBATE_WORKFLOW_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().completeDebateWorkflow(String(payload && payload.workflowId || ""));
  sendVaultStateToRenderer(result.state);
  return { ok: true, workflow: result.workflow, state: result.state };
}));

ipcMain.handle(VAULT_CREATE_MASTER_PLAN_FROM_DEBATE_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().createMasterPlanVersionFromDebate(
    String(payload && payload.workflowId || ""),
    String(payload && payload.roundId || "")
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, version: result.version, project: result.project, workflow: result.workflow, round: result.round, state: result.state };
}));

ipcMain.handle(VAULT_ADD_MASTER_PLAN_VERSION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().addMasterPlanVersion(
    String(payload && payload.projectId || ""),
    payload || {}
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, version: result.version, project: result.project, state: result.state };
}));

ipcMain.handle(VAULT_APPLY_MASTER_PLAN_VERSION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().applyMasterPlanVersion(
    String(payload && payload.projectId || ""),
    String(payload && payload.versionId || "")
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, version: result.version, project: result.project, state: result.state };
}));

ipcMain.handle(VAULT_ARCHIVE_MASTER_PLAN_VERSION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().archiveMasterPlanVersion(String(payload && payload.projectId || ""), String(payload && payload.versionId || ""));
  sendVaultStateToRenderer(result.state);
  return { ok: true, version: result.version, project: result.project, state: result.state };
}));

ipcMain.handle(VAULT_LIST_MASTER_PLAN_VERSIONS_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().listMasterPlanVersions(String(payload && payload.projectId || ""));
  return { ok: true, versions: result.versions, project: result.project, state: result.state };
}));

ipcMain.handle(VAULT_ADD_ROADMAP_VERSION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().addRoadmapVersion(
    String(payload && payload.packId || ""),
    payload || {}
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, version: result.version, pack: result.pack, state: result.state };
}));

ipcMain.handle(VAULT_PREPARE_ROADMAP_GENERATION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().prepareRoadmapGeneration(String(payload && payload.projectId || ""));
  return { ok: true, project: result.project, activeMasterPlan: result.activeMasterPlan, state: result.state };
}));

ipcMain.handle(VAULT_APPLY_ROADMAP_VERSION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().applyRoadmapVersion(
    String(payload && payload.packId || ""),
    String(payload && payload.versionId || "")
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, version: result.version, pack: result.pack, project: result.project, state: result.state };
}));

ipcMain.handle(VAULT_LIST_ROADMAP_VERSIONS_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().listRoadmapVersions(String(payload && payload.projectId || ""));
  return { ok: true, versions: result.versions, project: result.project, pack: result.pack, state: result.state };
}));

ipcMain.handle(VAULT_ARCHIVE_ROADMAP_VERSION_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().archiveRoadmapVersion(String(payload && payload.projectId || ""), String(payload && payload.versionId || ""));
  sendVaultStateToRenderer(result.state);
  return { ok: true, version: result.version, project: result.project, pack: result.pack, state: result.state };
}));

ipcMain.handle(VAULT_GET_ROADMAP_ELIGIBILITY_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().getRoadmapItemEligibility(String(payload && payload.projectId || ""));
  return { ok: true, items: result.items, project: result.project, pack: result.pack, state: result.state };
}));

ipcMain.handle(VAULT_GET_NEXT_ROADMAP_ITEM_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().getNextEligibleRoadmapItem(String(payload && payload.projectId || ""));
  return { ok: true, nextItem: result.nextItem, items: result.items, project: result.project, pack: result.pack, state: result.state };
}));

ipcMain.handle(VAULT_MARK_ROADMAP_IN_PROGRESS_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().markRoadmapItemInProgress(String(payload && payload.projectId || ""), String(payload && payload.roadmapItemId || ""));
  sendVaultStateToRenderer(result.state);
  return { ok: true, project: result.project, pack: result.pack, chunk: result.chunk, state: result.state };
}));

ipcMain.handle(VAULT_MARK_ROADMAP_DONE_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().markRoadmapItemDone(String(payload && payload.projectId || ""), String(payload && payload.roadmapItemId || ""));
  sendVaultStateToRenderer(result.state);
  return { ok: true, project: result.project, pack: result.pack, chunk: result.chunk, state: result.state };
}));

ipcMain.handle(VAULT_CREATE_TASK_PROMPT_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().createTaskPromptFromRoadmapItem(String(payload && payload.projectId || ""), String(payload && payload.roadmapItemId || ""));
  sendVaultStateToRenderer(result.state);
  return { ok: true, taskPrompt: result.taskPrompt, version: result.version, project: result.project, pack: result.pack, chunk: result.chunk, state: result.state };
}));

ipcMain.handle(VAULT_UPDATE_TASK_PROMPT_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().updateTaskPromptContent(String(payload && payload.taskPromptId || ""), payload || {});
  sendVaultStateToRenderer(result.state);
  return { ok: true, taskPrompt: result.taskPrompt, state: result.state };
}));

ipcMain.handle(VAULT_START_ROADMAP_PROMPT_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().startRoadmapPrompt(
    String(payload && payload.packId || ""),
    String(payload && payload.roadmapItemId || "")
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, pack: result.pack, chunk: result.chunk, project: result.project, state: result.state };
}));

ipcMain.handle(VAULT_APPROVE_PROMPT_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().approvePrompt(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || "")
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, chunk: result.chunk, state: result.state };
}));

ipcMain.handle(VAULT_COPY_PROMPT_TO_CODEX_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().copyPromptToCodex(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || "")
  );
  clipboard.writeText(result.handoffPrompt);
  sendVaultStateToRenderer(result.state);
  return { ok: true, chunk: result.chunk, handoffPrompt: result.handoffPrompt, state: result.state };
}));

ipcMain.handle(VAULT_MARK_PROMPT_DONE_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().markPromptDone(
    String(payload && payload.packId || ""),
    String(payload && payload.chunkId || ""),
    payload || {}
  );
  sendVaultStateToRenderer(result.state);
  return { ok: true, runItem: result.runItem, chunk: result.chunk, state: result.state };
}));

ipcMain.handle(VAULT_COPY_ROADMAP_HANDOFF_CHANNEL, (_event, payload) => invokeSafely(async () => {
  const result = getVaultStore().copyRoadmapHandoffToCodex(
    String(payload && payload.packId || ""),
    String(payload && payload.selector || "")
  );
  clipboard.writeText(result.handoffPrompt);
  return { ok: true, selector: result.selector, handoffPrompt: result.handoffPrompt, state: result.state };
}));

ipcMain.handle(EXTENSION_SETUP_ONCE_CHANNEL, () => invokeSafely(async () => {
  return setupExtensionOnce();
}));

ipcMain.handle(EXTENSION_CONNECT_INSTALLED_CHANNEL, () => invokeSafely(async () => {
  return connectInstalledExtension();
}));

ipcMain.handle(EXTENSION_COPY_PATH_CHANNEL, () => invokeSafely(async () => {
  return copyExtensionPath();
}));

ipcMain.handle(EXTENSION_COPY_URL_CHANNEL, () => invokeSafely(async () => {
  return copyExtensionsUrl();
}));

ipcMain.handle(EXTENSION_OPEN_FOLDER_CHANNEL, () => invokeSafely(async () => {
  return openExtensionFolder();
}));

ipcMain.handle(EXTENSION_OPEN_MANAGE_PAGE_CHANNEL, () => invokeSafely(async () => {
  return requestExtensionManagePageOpen();
}));

wss.on("connection", (ws, request) => {
  connectionCounter += 1;
  const connectionId = connectionCounter;
  const remoteAddress = request && request.socket ? request.socket.remoteAddress : "unknown";
  const sessionGate = createSessionGate({
    expectedToken: wsSessionToken,
    onAuthenticated: (hello) => {
      extensionSocket = ws;
      setExtensionState(EXTENSION_STATE.CONNECTED);
      logServer(`Extension authenticated (#${connectionId}).`, { remoteAddress });
      sendWorkflowStatusToRenderer("Extension connected. Ready for next AI step.", "success", hello.nextTarget || "ChatGPT", EXTENSION_STATE.CONNECTED);
    }
  });
  const handshakeTimer = setTimeout(() => {
    if (!sessionGate.isAuthenticated()) {
      logServer(`Closing unauthenticated extension socket (#${connectionId}).`, { remoteAddress });
      ws.close(4401, "Missing session token.");
    }
  }, 5000);

  logServer(`Extension socket connected (#${connectionId}); waiting for session handshake.`, { remoteAddress });

  ws.on("message", (rawData) => {
    const sessionResult = sessionGate.handleMessage(ws, rawData);

    if (!sessionResult.ok) {
      logServer("Rejected unauthenticated or invalid WebSocket message.", { error: sessionResult.error });
      if (sessionGate.isAuthenticated()) {
        const rawText = rawData.toString("utf8");
        logServer("Received invalid JSON from extension.", { rawText, error: sessionResult.error });
        sendStatusToRenderer("Extension returned invalid JSON.", "error");
      } else {
        sendStatusToRenderer("Extension WebSocket session rejected.", "error");
      }
      return;
    }

    if (sessionResult.handshake) {
      clearTimeout(handshakeTimer);
      return;
    }

    const parsedData = sessionResult.message;

    if (parsedData && parsedData.type === "EXTENSION_CONNECTED") {
      logServer("Extension client announced readiness.", parsedData);
      setExtensionState(EXTENSION_STATE.CONNECTED);
      sendWorkflowStatusToRenderer("Extension connected. Ready for next AI step.", "success", parsedData.nextTarget || "ChatGPT", EXTENSION_STATE.CONNECTED);
      return;
    }

    if (parsedData && parsedData.type === "EXTENSION_HEARTBEAT") {
      logServer("Extension heartbeat received.", {
        nextTarget: parsedData.nextTarget,
        timestamp: parsedData.timestamp
      });
      setExtensionState(EXTENSION_STATE.CONNECTED);
      sendWorkflowStatusToRenderer("Extension connected. Ready for next AI step.", "success", parsedData.nextTarget || "ChatGPT", EXTENSION_STATE.CONNECTED);
      return;
    }

    if (parsedData && parsedData.ok === false) {
      const errorMessage = typeof parsedData.error === "string"
        ? parsedData.error
        : "Extension reported a workflow error.";
      logServer("Extension reported an error.", parsedData);
      sendStatusToRenderer(errorMessage, "error");
      return;
    }

    logServer("Received AI response from extension.", parsedData);
    if (typeof parsedData.text === "string" && parsedData.text.trim()) {
      sendToRenderer(EXTENSION_MESSAGE_CHANNEL, parsedData.text);
      return;
    }

    logServer("Extension message did not include response text; dropping renderer update.", parsedData);
  });

  ws.on("close", (code, reasonBuffer) => {
    clearTimeout(handshakeTimer);
    const reason = reasonBuffer ? reasonBuffer.toString("utf8") : "";

    if (extensionSocket === ws) {
      extensionSocket = null;
      setExtensionState(EXTENSION_STATE.DISCONNECTED);
    }

    logServer(`Extension disconnected (#${connectionId}).`, { code, reason });
    sendStatusToRenderer("Extension disconnected. Click Connect extension to reconnect.", "error");
  });

  ws.on("error", (error) => {
    logServer(`Extension socket error (#${connectionId}).`, { error: error.message });
  });
});

wss.on("listening", () => {
  logServer(`WebSocket server listening on ws://localhost:${WS_PORT}`);
});

wss.on("error", (error) => {
  logServer("WebSocket server error.", { error: error.message });
});

app.whenReady().then(() => {
  createWindow();
  setTimeout(() => {
    connectInstalledExtension().catch((error) => {
      setExtensionState(EXTENSION_STATE.ERROR);
      logServer("Could not wake installed extension on startup.", { error: error.message });
      sendWorkflowStatusToRenderer(getExtensionStatusMessage(EXTENSION_STATE.ERROR), "error", "ChatGPT", EXTENSION_STATE.ERROR);
    });
  }, 500);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (extensionSocket) {
    extensionSocket.close(1001, "Electron app is shutting down.");
    extensionSocket = null;
  }

  wss.close(() => {
    logServer("WebSocket server closed.");
  });
});

process.on("uncaughtException", (error) => {
  console.error("[Next Step][Main] uncaughtException", error);
});

process.on("unhandledRejection", (error) => {
  console.error("[Next Step][Main] unhandledRejection", error);
});
