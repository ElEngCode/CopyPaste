const path = require("node:path");
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
const VAULT_COPY_CHUNK_CHANNEL = "VAULT_COPY_CHUNK";
const VAULT_COPY_LAUNCHER_CHANNEL = "VAULT_COPY_LAUNCHER";
const VAULT_MARK_CHUNK_CHANNEL = "VAULT_MARK_CHUNK";
const VAULT_OPEN_FOLDER_CHANNEL = "VAULT_OPEN_FOLDER";
const VAULT_DELETE_PACK_CHANNEL = "VAULT_DELETE_PACK";

let mainWindow = null;
let extensionSocket = null;
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
      nodeIntegration: false
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
    nextTarget: "ChatGPT"
  });
}

function sendWorkflowStatusToRenderer(message, tone = "neutral", nextTarget = "ChatGPT") {
  sendToRenderer(STATUS_CHANNEL, {
    message,
    tone,
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
    const errorPayload = {
      ok: false,
      error: "Chrome extension WebSocket client is not connected."
    };
    logServer("Cannot dispatch workflow; extension socket is not active.");
    sendStatusToRenderer(errorPayload.error, "error");
    return false;
  }

  const serialized = JSON.stringify(payload);
  logServer("Dispatching workflow payload to extension.", payload);
  extensionSocket.send(serialized);
  return true;
}

ipcMain.on(TRIGGER_WORKFLOW_CHANNEL, (event, payload) => {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const didSend = sendWorkflowToExtension({
    chatgptPrefix: String(safePayload.chatgptPrefix || ""),
    claudePrefix: String(safePayload.claudePrefix || ""),
    text: String(safePayload.text || ""),
    targetProvider: String(safePayload.targetProvider || ""),
    currentStageId: String(safePayload.currentStageId || ""),
    currentStageLabel: String(safePayload.currentStageLabel || ""),
    currentRole: String(safePayload.currentRole || "")
  });

  if (!didSend && event && event.sender) {
    event.sender.send(STATUS_CHANNEL, {
      message: "Extension is not connected. Reload the Chrome extension or open Chrome.",
      tone: "error"
    });
  }
});

ipcMain.handle(VAULT_GET_STATE_CHANNEL, () => invokeSafely(async () => ({
  ok: true,
  state: getVaultStore().getState()
})));

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

wss.on("connection", (ws, request) => {
  connectionCounter += 1;
  const connectionId = connectionCounter;
  const remoteAddress = request && request.socket ? request.socket.remoteAddress : "unknown";
  const sessionGate = createSessionGate({
    expectedToken: wsSessionToken,
    onAuthenticated: (hello) => {
      extensionSocket = ws;
      logServer(`Extension authenticated (#${connectionId}).`, { remoteAddress });
      sendWorkflowStatusToRenderer("Extension connected. Ready for next AI step.", "success", hello.nextTarget || "ChatGPT");
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
      sendWorkflowStatusToRenderer("Extension connected. Ready for next AI step.", "success", parsedData.nextTarget || "ChatGPT");
      return;
    }

    if (parsedData && parsedData.type === "EXTENSION_HEARTBEAT") {
      logServer("Extension heartbeat received.", {
        nextTarget: parsedData.nextTarget,
        timestamp: parsedData.timestamp
      });
      sendWorkflowStatusToRenderer("Extension connected. Ready for next AI step.", "success", parsedData.nextTarget || "ChatGPT");
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
    }

    logServer(`Extension disconnected (#${connectionId}).`, { code, reason });
    sendStatusToRenderer("Extension disconnected. Waiting for reconnect...", "error");
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
