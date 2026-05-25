"use strict";

let socket = null;
let nextTarget = "chatgpt";
let reconnectTimer = null;
let heartbeatTimer = null;
let isExecuting = false;

const ELECTRON_WS_URL = "ws://localhost:8080";
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 25000;
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

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToElectron();
  }, RECONNECT_DELAY_MS);
}

function connectToElectron() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  log("Connecting to Electron WebSocket server.", { url: ELECTRON_WS_URL });
  socket = new WebSocket(ELECTRON_WS_URL);

  socket.onopen = async () => {
    log("Connected to Electron WebSocket server.");
    await readStoredNextTarget();
    safeSocketSend({
      ok: true,
      type: "EXTENSION_CONNECTED",
      nextTarget
    });
    startHeartbeat();
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
    warn("WebSocket error.", error);
  };

  socket.onclose = (event) => {
    warn("WebSocket connection closed; reconnecting.", {
      code: event.code,
      reason: event.reason
    });
    stopHeartbeat();
    socket = null;
    scheduleReconnect();
  };
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
    stopHeartbeat
  };
} else {
  connectToElectron();
}
