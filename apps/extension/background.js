"use strict";

let socket = null;
let nextTarget = "chatgpt";
let heartbeatTimer = null;
let isExecuting = false;
let sessionHelloSent = false;
let lastConnectionError = null;

const ELECTRON_WS_URL = "ws://localhost:8080";
const HEARTBEAT_INTERVAL_MS = 25000;
const WAKE_CONNECT_TIMEOUT_MS = 7000;
const WAKE_POLL_INTERVAL_MS = 25;
const SESSION_TOKEN_FILE = "ws-session-token.json";
const SESSION_HELLO_TYPE = "EXTENSION_SESSION_HELLO";
const WAKE_MESSAGE_TYPE = "COPYPASTE_WAKE";
const OPEN_EXTENSIONS_PAGE_MESSAGE = "OPEN_EXTENSIONS_PAGE";
const CHATGPT_URL_PATTERNS = ["*://chatgpt.com/*", "*://*.chatgpt.com/*"];
const CLAUDE_URL_PATTERNS = ["*://claude.ai/*", "*://*.claude.ai/*"];

function log(message, details) {
  if (details) {
    console.log("[CopyPaste][Background]", message, details);
    return;
  }

  console.log("[CopyPaste][Background]", message);
}

function warn(message, details) {
  if (details) {
    console.warn("[CopyPaste][Background]", message, details);
    return;
  }

  console.warn("[CopyPaste][Background]", message);
}

function getLastErrorMessage() {
  return chrome.runtime.lastError ? chrome.runtime.lastError.message : "";
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = getLastErrorMessage();

      if (error) {
        reject(new Error("chrome.tabs.query failed: " + error));
        return;
      }

      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      const error = getLastErrorMessage();

      if (error) {
        reject(new Error("chrome.tabs.update failed: " + error));
        return;
      }

      resolve(tab);
    });
  });
}

function executeContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["content.js"]
      },
      (result) => {
        const error = getLastErrorMessage();

        if (error) {
          reject(new Error("chrome.scripting.executeScript failed: " + error));
          return;
        }

        resolve(result || []);
      }
    );
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = getLastErrorMessage();

      if (error) {
        reject(new Error("chrome.tabs.sendMessage failed: " + error));
        return;
      }

      if (!response) {
        reject(new Error("No response received from content script for action: " + message.action));
        return;
      }

      if (response.ok === false) {
        reject(new Error(response.error || "Content script action failed: " + message.action));
        return;
      }

      resolve(response);
    });
  });
}

function readStoredNextTarget() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["nextTarget"], (items) => {
      const storedTarget = items && items.nextTarget;

      if (storedTarget === "chatgpt" || storedTarget === "claude") {
        nextTarget = storedTarget;
      }

      resolve(nextTarget);
    });
  });
}

function writeStoredNextTarget(target) {
  nextTarget = target;
  chrome.storage.local.set({ nextTarget: target });
}

function normalizeTargetProvider(value) {
  const target = String(value || "").trim().toLowerCase();
  if (target === "chatgpt" || target === "claude") {
    return target;
  }
  return "";
}

function findBestTab(tabs) {
  if (!tabs || tabs.length === 0) {
    return null;
  }

  return tabs.find((tab) => tab.active) || tabs[0];
}

async function findTargetTab(target) {
  const urlPatterns = target === "claude" ? CLAUDE_URL_PATTERNS : CHATGPT_URL_PATTERNS;
  const tabs = await queryTabs({
    currentWindow: true,
    url: urlPatterns
  });
  const tab = findBestTab(tabs);

  if (!tab || !tab.id) {
    throw new Error((target === "claude" ? "Claude" : "ChatGPT") + " tab was not found in the current window.");
  }

  return tab;
}

function safeSocketSend(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    warn("Cannot send payload to Electron; WebSocket is not open.", payload);
    return false;
  }

  socket.send(JSON.stringify(payload));
  return true;
}

async function loadSessionToken() {
  const tokenUrl = chrome.runtime.getURL(SESSION_TOKEN_FILE);
  const response = await fetch(tokenUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("WebSocket session token is unavailable.");
  }

  const payload = await response.json();
  const token = payload && typeof payload.token === "string" ? payload.token : "";

  if (!token) {
    throw new Error("WebSocket session token is missing.");
  }

  return token;
}

function createSessionHello(token, currentNextTarget) {
  return {
    ok: true,
    type: SESSION_HELLO_TYPE,
    token,
    nextTarget: currentNextTarget
  };
}

function startHeartbeat() {
  stopHeartbeat();

  heartbeatTimer = setInterval(() => {
    safeSocketSend({
      ok: true,
      type: "EXTENSION_HEARTBEAT",
      nextTarget,
      timestamp: Date.now()
    });
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (!heartbeatTimer) {
    return;
  }

  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(tabId) || !chrome.tabs || !chrome.tabs.remove) {
      resolve();
      return;
    }

    chrome.tabs.remove(tabId, () => {
      const error = getLastErrorMessage();
      if (error) {
        warn("Could not close CopyPaste wake tab.", { error });
      }
      resolve();
    });
  });
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, (tab) => {
      const error = getLastErrorMessage();
      if (error) {
        reject(new Error("chrome.tabs.create failed: " + error));
        return;
      }
      resolve(tab || null);
    });
  });
}

async function runManualStep(command) {
  if (isExecuting) {
    throw new Error("A workflow step is already running.");
  }

  isExecuting = true;

  try {
    const payload = command && typeof command === "object" ? command : {};

    await readStoredNextTarget();

    const explicitTarget = normalizeTargetProvider(payload.targetProvider || payload.target);
    const target = explicitTarget || nextTarget;
    const tab = await findTargetTab(target);
    const prefix = target === "chatgpt"
      ? String(payload.chatgptPrefix || "")
      : String(payload.claudePrefix || "");
    const sourceText = String(payload.text || "");
    const combinedText = prefix + sourceText;

    if (!combinedText.trim()) {
      throw new Error("Cannot send an empty workflow payload.");
    }

    log("Running manual workflow step.", {
      target,
      tabId: tab.id,
      textLength: combinedText.length
    });

    await updateTab(tab.id, { active: true });
    await executeContentScript(tab.id);

    const writeResult = await sendTabMessage(tab.id, {
      action: "WRITE_AND_SEND",
      text: combinedText,
      target
    });

    const readResult = await sendTabMessage(tab.id, {
      action: "READ_RESPONSE",
      target,
      sourceText: combinedText,
      previousText: writeResult.previousText || ""
    });
    const capturedResult = String(readResult.text || "").trim();

    if (!capturedResult) {
      throw new Error("The captured AI response was empty.");
    }

    const next = explicitTarget ? nextTarget : target === "chatgpt" ? "claude" : "chatgpt";
    if (!explicitTarget) {
      writeStoredNextTarget(next);
    }

    const resultPayload = {
      ok: true,
      target,
      nextTarget: next,
      text: capturedResult
    };

    safeSocketSend(resultPayload);
    return resultPayload;
  } finally {
    isExecuting = false;
  }
}

function connectToElectron() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }

  log("Connecting to Electron WebSocket server.", { url: ELECTRON_WS_URL });
  sessionHelloSent = false;
  lastConnectionError = null;
  socket = new WebSocket(ELECTRON_WS_URL);

  socket.onopen = async () => {
    log("Connected to Electron WebSocket server.");
    try {
      await readStoredNextTarget();
      const sessionToken = await loadSessionToken();
      safeSocketSend(createSessionHello(sessionToken, nextTarget));
      safeSocketSend({
        ok: true,
        type: "EXTENSION_CONNECTED",
        nextTarget
      });
      sessionHelloSent = true;
      startHeartbeat();
    } catch (error) {
      lastConnectionError = error;
      warn("Could not authenticate Electron WebSocket session.", { error: error.message });
      socket.close(4401, "Missing session token.");
    }
  };

  socket.onmessage = (event) => {
    let command;

    try {
      command = JSON.parse(event.data);
    } catch (error) {
      warn("Invalid JSON command received from Electron.", {
        data: event.data,
        error: error.message
      });
      safeSocketSend({
        ok: false,
        error: "Invalid JSON command received by extension."
      });
      return;
    }

    if (command && typeof command.type === "string" && command.type !== "RUN_WORKFLOW") {
      if (command.type === OPEN_EXTENSIONS_PAGE_MESSAGE) {
        createTab("chrome://extensions/")
          .then(() => {
            safeSocketSend({
              ok: true,
              type: "EXTENSION_MANAGE_PAGE_OPENED"
            });
          })
          .catch((error) => {
            safeSocketSend({
              ok: false,
              type: "EXTENSION_MANAGE_PAGE_FAILED",
              error: error.message || "Could not open chrome://extensions."
            });
          });
      }
      log("Ignoring WebSocket control message from Electron.", command);
      return;
    }

    runManualStep(command).catch((error) => {
      console.error("[CopyPaste][Background] Manual workflow step failed:", error);
      safeSocketSend({
        ok: false,
        error: error.message || "Manual workflow step failed."
      });
    });
  };

  socket.onerror = (error) => {
    lastConnectionError = error instanceof Error ? error : new Error("CopyPaste desktop WebSocket connection failed.");
    warn("WebSocket error.", error);
  };

  socket.onclose = (event) => {
    warn("WebSocket connection closed.", {
      code: event.code,
      reason: event.reason
    });
    stopHeartbeat();
    socket = null;
    sessionHelloSent = false;
  };

  return socket;
}

function waitForSessionHandshake(timeoutMs = WAKE_CONNECT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const check = () => {
      if (socket && socket.readyState === WebSocket.OPEN && sessionHelloSent) {
        resolve();
        return;
      }

      if (lastConnectionError) {
        reject(lastConnectionError);
        return;
      }

      if (!socket || socket.readyState === WebSocket.CLOSED) {
        reject(new Error("CopyPaste desktop is not running. Start the desktop app, then click Connect extension."));
        return;
      }

      if (Date.now() >= deadline) {
        reject(new Error("CopyPaste desktop did not accept the extension WebSocket handshake."));
        return;
      }

      setTimeout(check, WAKE_POLL_INTERVAL_MS);
    };

    check();
  });
}

async function handleWakeMessage(sender = {}) {
  connectToElectron();
  await waitForSessionHandshake();
  const tabId = sender && sender.tab ? sender.tab.id : null;
  await removeTab(tabId);

  return {
    ok: true,
    connected: true
  };
}

function handleRuntimeMessage(message, sender, sendResponse) {
  if (!message || message.type !== WAKE_MESSAGE_TYPE) {
    return false;
  }

  handleWakeMessage(sender)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({
      ok: false,
      error: error.message || "CopyPaste desktop is not running. Start the desktop app, then click Connect extension."
    }));

  return true;
}

function registerWakeMessageHandler() {
  if (!chrome.runtime || !chrome.runtime.onMessage || !chrome.runtime.onMessage.addListener) {
    return;
  }

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    connectToElectron,
    findTargetTab,
    runManualStep,
    safeSocketSend,
    readStoredNextTarget,
    writeStoredNextTarget,
    startHeartbeat,
    stopHeartbeat,
    loadSessionToken,
    createSessionHello,
    handleWakeMessage,
    handleRuntimeMessage,
    waitForSessionHandshake,
    createTab
  };
} else {
  registerWakeMessageHandler();
  connectToElectron();
}
