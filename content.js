const TYPING_FINISHED_DELAY_MS = 2000;
const HUMAN_CLICK_MIN_DELAY_MS = 400;
const HUMAN_CLICK_MAX_DELAY_MS = 900;

function observeTypingFinished(selector, onTypingFinished) {
  if (typeof selector !== "string" || selector.trim() === "") {
    throw new Error("A valid selector is required.");
  }

  if (typeof onTypingFinished !== "function") {
    throw new Error("onTypingFinished callback is required.");
  }

  const container = document.querySelector(selector);

  if (!container) {
    return () => {};
  }

  let debounceTimer = null;
  let lastExtractedText = "";

  const extractText = () => (container.innerText || container.textContent || "").trim();

  const scheduleTypingFinished = () => {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      const extractedText = extractText();

      if (extractedText === "" || extractedText === lastExtractedText) {
        return;
      }

      lastExtractedText = extractedText;
      onTypingFinished(extractedText);
    }, TYPING_FINISHED_DELAY_MS);
  };

  const observer = new MutationObserver(scheduleTypingFinished);

  observer.observe(container, {
    childList: true,
    characterData: true,
    subtree: true
  });

  return () => {
    clearTimeout(debounceTimer);
    observer.disconnect();
  };
}

function simulateReactTyping(selector, textToInsert) {
  if (typeof selector !== "string" || selector.trim() === "") {
    throw new Error("A valid selector is required.");
  }

  const textarea = document.querySelector(selector);

  if (!textarea) {
    throw new Error(`No textarea found for selector: ${selector}`);
  }

  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error(`Element for selector "${selector}" is not a textarea.`);
  }

  const previousValue = textarea.value;
  const nextValue = String(textToInsert ?? "");
  const nativeValueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;

  if (nativeValueSetter) {
    nativeValueSetter.call(textarea, nextValue);
  } else {
    textarea.value = nextValue;
  }

  if (textarea._valueTracker && typeof textarea._valueTracker.setValue === "function") {
    textarea._valueTracker.setValue(previousValue);
  }

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));

  return textarea;
}

function getRandomHumanClickDelay() {
  const delayRange = HUMAN_CLICK_MAX_DELAY_MS - HUMAN_CLICK_MIN_DELAY_MS + 1;
  return Math.floor(Math.random() * delayRange) + HUMAN_CLICK_MIN_DELAY_MS;
}

function waitForDelay(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function simulateHumanClick(selector) {
  if (typeof selector !== "string" || selector.trim() === "") {
    throw new Error("A valid selector is required.");
  }

  const button = document.querySelector(selector);

  if (!button) {
    throw new Error(`No button found for selector: ${selector}`);
  }

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Element for selector "${selector}" is not a button.`);
  }

  await waitForDelay(getRandomHumanClickDelay());

  ["mousedown", "mouseup", "click"].forEach((eventType) => {
    button.dispatchEvent(new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  });

  return button;
}

if (typeof module !== "undefined") {
  module.exports = {
    observeTypingFinished,
    simulateReactTyping,
    simulateHumanClick
  };
}
// Ascultăm comenzile de la background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'WRITE_AND_SEND') {
    // Apelăm funcția de inserare
    simulateReactTyping(message.textareaSelector, message.text);
    // Apelăm funcția de click cu delay
    simulateHumanClick(message.buttonSelector);
    sendResponse({ status: 'action_completed' });
  } 
  else if (message.action === 'READ_RESPONSE') {
    // Apelăm funcția de citire cu observer (așteaptă să termine de tastat)
    observeTypingFinished(message.containerSelector, (extractedText) => {
      sendResponse({ text: extractedText });
    });
    // Returnăm 'true' pentru a menține canalul deschis (deoarece e o funcție asincronă)
    return true; 
  }
});