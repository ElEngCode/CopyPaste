(function installPopup(root) {
  "use strict";

  var LOG_PREFIX = "[CopyPaste][Popup]";
  var DEFAULT_CHATGPT_PREFIX = "Analyze and improve this text: ";
  var DEFAULT_CLAUDE_PREFIX = "Critique and condense this text: ";

  var elements = {};

  function log() {
    if (typeof console !== "undefined") {
      console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise(function resolveRuntimeMessage(resolve, reject) {
      try {
        chrome.runtime.sendMessage(message, function onResponse(response) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            reject(new Error("No response received from background service worker."));
            return;
          }

          if (response.ok === false) {
            reject(new Error(response.error || "Background action failed."));
            return;
          }

          resolve(response);
        });
      } catch (caughtError) {
        reject(caughtError);
      }
    });
  }

  function setBusy(isBusy, label) {
    elements.nextBtn.disabled = isBusy;
    elements.saveBtn.disabled = isBusy;

    if (label) {
      elements.status.textContent = label;
    }
  }

  function targetLabel(nextTarget) {
    return nextTarget === "claude" ? "Claude" : "ChatGPT";
  }

  function renderState(state) {
    var nextTarget = state.nextTarget || "chatgpt";
    var label = targetLabel(nextTarget);

    elements.currentText.value = state.stagedText || "";
    elements.status.textContent = "Next Up: " + label;
    elements.nextBtn.textContent = "🚀 Send to " + label;
  }

  async function refreshState() {
    var state = await sendRuntimeMessage({ action: "GET_STATE" });
    renderState(state);
  }

  async function executeNextStep() {
    var target = elements.nextBtn.textContent.indexOf("Claude") !== -1 ? "Claude" : "ChatGPT";
    setBusy(true, "Sending to " + target + "...");

    try {
      var response = await sendRuntimeMessage({
        action: "EXECUTE_NEXT_STEP",
        chatgptPrefix: elements.chatgptPrefix.value,
        claudePrefix: elements.claudePrefix.value,
        text: elements.currentText.value
      });

      renderState(response);
      log("Step completed.", response);
    } catch (caughtError) {
      elements.status.textContent = "Error: " + caughtError.message;
      console.error(LOG_PREFIX, caughtError);
    } finally {
      elements.nextBtn.disabled = false;
      elements.saveBtn.disabled = false;
    }
  }

  async function triggerSave() {
    setBusy(true, "Saving final text...");

    try {
      await sendRuntimeMessage({
        action: "TRIGGER_SAVE",
        text: elements.currentText.value
      });
      await refreshState();
      elements.status.textContent = "Saved ai_final_output.txt";
    } catch (caughtError) {
      elements.status.textContent = "Save failed: " + caughtError.message;
      console.error(LOG_PREFIX, caughtError);
    } finally {
      elements.nextBtn.disabled = false;
      elements.saveBtn.disabled = false;
    }
  }

  function install() {
    var doc = root.document;

    if (!doc) {
      return;
    }

    elements = {
      chatgptPrefix: doc.getElementById("chatgptPrefix"),
      claudePrefix: doc.getElementById("claudePrefix"),
      currentText: doc.getElementById("currentText"),
      status: doc.getElementById("status"),
      nextBtn: doc.getElementById("nextBtn"),
      saveBtn: doc.getElementById("saveBtn")
    };

    elements.chatgptPrefix.value = DEFAULT_CHATGPT_PREFIX;
    elements.claudePrefix.value = DEFAULT_CLAUDE_PREFIX;

    elements.nextBtn.addEventListener("click", function onNextClick() {
      executeNextStep();
    });

    elements.saveBtn.addEventListener("click", function onSaveClick() {
      triggerSave();
    });

    refreshState().catch(function onLoadError(caughtError) {
      elements.status.textContent = "State load failed: " + caughtError.message;
      console.error(LOG_PREFIX, caughtError);
    });
  }

  install();
})(typeof globalThis !== "undefined" ? globalThis : this);
