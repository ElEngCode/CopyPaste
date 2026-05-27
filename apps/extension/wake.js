"use strict";

const statusElement = document.getElementById("status");

function setWakeStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

chrome.runtime.sendMessage({ type: "COPYPASTE_WAKE" }, (response) => {
  const runtimeError = chrome.runtime.lastError ? chrome.runtime.lastError.message : "";

  if (runtimeError) {
    setWakeStatus("CopyPaste desktop is not running. Start the desktop app, then click Connect extension.");
    return;
  }

  if (!response || response.ok === false) {
    const error = response && response.error
      ? response.error
      : "CopyPaste desktop is not running. Start the desktop app, then click Connect extension.";
    setWakeStatus(error);
    return;
  }

  setWakeStatus("CopyPaste connected. Closing this tab...");
});
