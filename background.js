(function installCopyPasteBackground(root) {
  "use strict";

  var LOG_PREFIX = "[CopyPaste][Background]";
  var CHATGPT_URL_PATTERNS = ["*://chatgpt.com/*", "*://*.chatgpt.com/*"];
  var CLAUDE_URL_PATTERNS = ["*://claude.ai/*", "*://*.claude.ai/*"];
  var SEND_RETRY_ATTEMPTS = 3;
  var SEND_RETRY_DELAY_MS = 250;

  var stagedText = "mesaj de test";
  var nextTarget = "chatgpt";
  var isExecuting = false;

  function log() {
    if (typeof console !== "undefined") {
      console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }
  }

  function getState(extra) {
    return Object.assign({
      ok: true,
      stagedText: stagedText,
      nextTarget: nextTarget,
      isExecuting: isExecuting
    }, extra || {});
  }

  function throwLastError(context) {
    if (chrome.runtime.lastError) {
      throw new Error(context + ": " + chrome.runtime.lastError.message);
    }
  }

  function queryTabs(queryInfo) {
    return new Promise(function resolveQuery(resolve, reject) {
      try {
        chrome.tabs.query(queryInfo, function onTabs(tabs) {
          try {
            throwLastError("tabs.query failed");
            resolve(Array.isArray(tabs) ? tabs : []);
          } catch (caughtError) {
            reject(caughtError);
          }
        });
      } catch (caughtError) {
        reject(caughtError);
      }
    });
  }

  function updateTab(tabId, updateProperties) {
    return new Promise(function resolveUpdate(resolve, reject) {
      try {
        chrome.tabs.update(tabId, updateProperties, function onUpdated(tab) {
          try {
            throwLastError("tabs.update failed");
            resolve(tab);
          } catch (caughtError) {
            reject(caughtError);
          }
        });
      } catch (caughtError) {
        reject(caughtError);
      }
    });
  }

  function executeContentScript(tabId) {
    return new Promise(function resolveExecute(resolve, reject) {
      try {
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            files: ["content.js"]
          },
          function onInjected(result) {
            try {
              throwLastError("scripting.executeScript failed");
              resolve(result || []);
            } catch (caughtError) {
              reject(caughtError);
            }
          }
        );
      } catch (caughtError) {
        reject(caughtError);
      }
    });
  }

  function sendTabMessage(tabId, payload) {
    return new Promise(function resolveMessage(resolve, reject) {
      try {
        chrome.tabs.sendMessage(tabId, payload, function onResponse(response) {
          try {
            throwLastError("tabs.sendMessage failed");

            if (!response) {
              reject(new Error("No response from content script for action: " + payload.action));
              return;
            }

            if (response.ok === false) {
              reject(new Error(response.error || ("Action failed: " + payload.action)));
              return;
            }

            resolve(response);
          } catch (caughtError) {
            reject(caughtError);
          }
        });
      } catch (caughtError) {
        reject(caughtError);
      }
    });
  }

  function downloadTextFile(filename, text) {
    return new Promise(function resolveDownload(resolve, reject) {
      try {
        var url = "data:text/plain;charset=utf-8," + encodeURIComponent(String(text || ""));

        chrome.downloads.download(
          {
            url: url,
            filename: filename,
            conflictAction: "overwrite",
            saveAs: true
          },
          function onDownload(downloadId) {
            try {
              throwLastError("downloads.download failed");
              resolve(downloadId);
            } catch (caughtError) {
              reject(caughtError);
            }
          }
        );
      } catch (caughtError) {
        reject(caughtError);
      }
    });
  }

  function sleep(ms) {
    return new Promise(function resolveSleep(resolve) {
      setTimeout(resolve, ms);
    });
  }

  function isTransientMessageError(message) {
    var normalized = String(message || "").toLowerCase();
    return normalized.indexOf("receiving end does not exist") !== -1
      || normalized.indexOf("message port closed") !== -1
      || normalized.indexOf("extension context invalidated") !== -1;
  }

  async function sendTabMessageWithRetry(tabId, payload) {
    var lastError = null;

    for (var attempt = 1; attempt <= SEND_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await sendTabMessage(tabId, payload);
      } catch (caughtError) {
        lastError = caughtError;

        if (!isTransientMessageError(caughtError && caughtError.message) || attempt === SEND_RETRY_ATTEMPTS) {
          break;
        }

        await executeContentScript(tabId);
        await sleep(SEND_RETRY_DELAY_MS * attempt);
      }
    }

    throw lastError || new Error("Unknown send message failure.");
  }

  function findBestTab(tabs) {
    if (!tabs || !tabs.length) {
      return null;
    }

    var activeTab = tabs.find(function isActive(tab) {
      return Boolean(tab && tab.active);
    });

    return activeTab || tabs[0] || null;
  }

  async function findTargetTab(target) {
    var patterns = target === "claude" ? CLAUDE_URL_PATTERNS : CHATGPT_URL_PATTERNS;
    var tabs = await queryTabs({
      currentWindow: true,
      url: patterns
    });
    var tab = findBestTab(tabs);

    if (!tab || !tab.id) {
      throw new Error((target === "claude" ? "Claude" : "ChatGPT") + " tab was not found in the current window.");
    }

    return tab;
  }

  async function writeSendRead(target, text) {
    var tab = await findTargetTab(target);

    await updateTab(tab.id, { active: true });
    await executeContentScript(tab.id);

    var writeResponse = await sendTabMessageWithRetry(tab.id, {
      action: "WRITE_AND_SEND",
      text: text,
      target: target
    });

    var response = await sendTabMessageWithRetry(tab.id, {
      action: "READ_RESPONSE",
      target: target,
      sourceText: text,
      previousText: writeResponse.previousText || ""
    });
    var responseText = String(response.text || "").trim();

    if (!responseText) {
      throw new Error("READ_RESPONSE returned empty text from " + target + ".");
    }

    return {
      tabId: tab.id,
      text: responseText
    };
  }

  async function executeNextStep(message) {
    if (isExecuting) {
      throw new Error("A workflow step is already running.");
    }

    isExecuting = true;

    try {
      var target = nextTarget;
      var editedText = String(message.text || "");
      var prefix = target === "chatgpt"
        ? String(message.chatgptPrefix || "")
        : String(message.claudePrefix || "");
      var combinedText = prefix + editedText;

      stagedText = editedText;

      if (!combinedText.trim()) {
        throw new Error("Cannot send empty text.");
      }

      log("Executing manual step.", {
        target: target,
        textLength: combinedText.length
      });

      var result = await writeSendRead(target, combinedText);

      stagedText = result.text;
      nextTarget = target === "chatgpt" ? "claude" : "chatgpt";
      isExecuting = false;

      return getState({
        completedTarget: target,
        completedTabId: result.tabId
      });
    } finally {
      isExecuting = false;
    }
  }

  async function triggerSave(message) {
    if (typeof message.text === "string") {
      stagedText = message.text;
    }

    var downloadId = await downloadTextFile("ai_final_output.txt", stagedText);

    return getState({
      downloadId: downloadId
    });
  }

  function installRuntimeListener() {
    if (!root.chrome || !chrome.runtime || !chrome.runtime.onMessage) {
      return;
    }

    chrome.runtime.onMessage.addListener(function onMessage(message, sender, sendResponse) {
      if (!message || !message.action) {
        return false;
      }

      if (message.action === "GET_STATE") {
        sendResponse(getState());
        return false;
      }

      if (message.action === "EXECUTE_NEXT_STEP") {
        executeNextStep(message)
          .then(sendResponse)
          .catch(function onExecuteFailure(caughtError) {
            console.error(LOG_PREFIX, "EXECUTE_NEXT_STEP failed:", caughtError);
            sendResponse({
              ok: false,
              error: caughtError.message,
              stagedText: stagedText,
              nextTarget: nextTarget,
              isExecuting: false
            });
          });
        return true;
      }

      if (message.action === "TRIGGER_SAVE") {
        triggerSave(message)
          .then(sendResponse)
          .catch(function onSaveFailure(caughtError) {
            console.error(LOG_PREFIX, "TRIGGER_SAVE failed:", caughtError);
            sendResponse({
              ok: false,
              error: caughtError.message,
              stagedText: stagedText,
              nextTarget: nextTarget,
              isExecuting: false
            });
          });
        return true;
      }

      sendResponse({
        ok: false,
        error: "Unknown action: " + message.action
      });
      return false;
    });
  }

  installRuntimeListener();

  if (typeof module !== "undefined") {
    module.exports = {
      executeNextStep: executeNextStep,
      findTargetTab: findTargetTab,
      getState: getState,
      triggerSave: triggerSave,
      writeSendRead: writeSendRead
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
