(function installCopyPasteContent(root) {
  "use strict";

  var LOG_PREFIX = "[CopyPaste][Content]";
  var READ_RESPONSE_INTERVAL_MS = 1000;
  var READ_RESPONSE_TIMEOUT_MS = 180000;
  var SEND_READY_TIMEOUT_MS = 5000;
  var SEND_READY_INTERVAL_MS = 100;
  var SUBMIT_ATTEMPTS = 3;
  var SUBMIT_VERIFY_TIMEOUT_MS = 2200;
  var SUBMIT_VERIFY_INTERVAL_MS = 100;
  var CLAUDE_RESPONSE_STABLE_POLLS = 2;

  var INPUT_SELECTORS = [
    "#prompt-textarea",
    "#prompt-textarea p",
    ".ProseMirror[contenteditable='true']",
    "[contenteditable='true'].ProseMirror",
    "[contenteditable='true'][data-placeholder]",
    "[data-testid='chat-input']",
    "[aria-label='Message Claude']",
    "[aria-label='Talk to Claude']",
    "[enterkeyhint='send']",
    "div[contenteditable='true']",
    "[contenteditable='true'][role='textbox']",
    "[role='textbox']",
    "textarea"
  ];

  var SEND_BUTTON_SELECTORS = [
    "button[data-testid='send-button']",
    "button[data-testid='composer-submit-button']",
    "button[data-testid='send-message-button']",
    "button[data-testid='composer-send-button']",
    "button[data-testid='chat-input-send-button']",
    "button[data-testid*='send']",
    "button[data-testid*='submit']",
    "button[aria-label='Send prompt']",
    "button[aria-label='Send message']",
    "button[aria-label='Send Message']",
    "button[aria-label='Submit message']",
    "button[aria-label='Submit Message']",
    "button[aria-label='Send']",
    "button[title='Send']",
    "button[title='Send message']",
    "button[title='Send Message']",
    "button[aria-label*='Send message']",
    "button[aria-label*='Send Message']",
    "button[aria-label*='Send']",
    "button[aria-label*='send']",
    "button[aria-label*='Submit']",
    "button[aria-label*='submit']",
    "form button[type='submit']"
  ];

  var SEND_BUTTON_FALLBACK_SELECTORS = [
    "form button[type='submit']",
    "button[type='submit']",
    "button:has(svg)"
  ];

  var STOP_BUTTON_SELECTORS = [
    "button[data-testid='stop-button']",
    "button[data-testid*='stop']",
    "button[aria-label='Stop response']",
    "button[aria-label='Stop generating']",
    "button[aria-label='Stop Generation']",
    "button[aria-label*='Stop response']",
    "button[aria-label*='Stop generating']",
    "button[aria-label*='Stop']",
    "button[aria-label*='stop']",
    "button[aria-label*='Cancel']",
    "button[aria-label*='cancel']"
  ];

  var MESSAGE_CONTAINER_SELECTORS = [
    "article",
    "[data-testid*='conversation-turn']",
    "[data-testid*='message']",
    "[data-message-author-role='assistant']",
    "[data-is-streaming]",
    ".font-claude-response",
    "[class*='claude-response']",
    ".font-claude-message",
    "[class*='claude-message']"
  ];

  var OUTPUT_SELECTORS = [
    ".markdown",
    ".prose",
    "[data-message-author-role='assistant'] .whitespace-pre-wrap",
    ".font-claude-response",
    "[class*='claude-response']",
    "[data-is-streaming] .font-claude-message",
    "[data-is-streaming] .font-claude-response",
    "[data-is-streaming='false']",
    "[data-is-streaming='true']",
    ".font-claude-message",
    "[class*='claude-message']"
  ].join(", ");

  function log() {
    if (typeof console !== "undefined") {
      console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }
  }

  function warn() {
    if (typeof console !== "undefined") {
      console.warn.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }
  }

  function error() {
    if (typeof console !== "undefined") {
      console.error.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }
  }

  function getDocument() {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }

    return document;
  }

  function getHostName() {
    return String(root.location && root.location.hostname || "").toLowerCase();
  }

  function isClaudeHost() {
    return getHostName().indexOf("claude.ai") !== -1;
  }

  function sleep(ms) {
    return new Promise(function resolveSleep(resolve) {
      setTimeout(resolve, ms);
    });
  }

  function queryFirst(selectors, rootNode) {
    var scope = rootNode || getDocument();

    for (var index = 0; index < selectors.length; index += 1) {
      try {
        var element = scope.querySelector(selectors[index]);

        if (element) {
          return element;
        }
      } catch (_selectorError) {
        // Ignore selectors unsupported by older DOM implementations.
      }
    }

    return null;
  }

  function queryAll(selectors, rootNode) {
    var scope = rootNode || getDocument();
    var results = [];
    var seen = new Set();

    selectors.forEach(function eachSelector(selector) {
      var nodes = [];

      try {
        nodes = Array.from(scope.querySelectorAll(selector));
      } catch (_selectorError) {
        nodes = [];
      }

      nodes.forEach(function addNode(node) {
        if (!seen.has(node)) {
          seen.add(node);
          results.push(node);
        }
      });
    });

    return results;
  }

  function normalizeInput(input) {
    if (!input || typeof input.closest !== "function") {
      return input;
    }

    if (typeof input.querySelector === "function") {
      var nestedEditor = input.querySelector(".ProseMirror[contenteditable='true'], [contenteditable='true'][role='textbox']");

      if (nestedEditor) {
        return nestedEditor;
      }
    }

    if (input.matches && input.matches("#prompt-textarea p")) {
      return input.closest("#prompt-textarea") || input.closest("[contenteditable='true']") || input;
    }

    if (input.matches && input.matches("[role='textbox']")) {
      return input.closest("[contenteditable='true']") || input;
    }

    return input;
  }

  function resolveInputContainer(doc) {
    var input = normalizeInput(queryFirst(INPUT_SELECTORS, doc || getDocument()));

    if (!input) {
      throw new Error("Could not resolve a prompt input container.");
    }

    return input;
  }

  function setNativeValue(element, value) {
    var prototype = Object.getPrototypeOf(element);
    var descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  function focusInput(input) {
    if (typeof input.focus === "function") {
      input.focus();
    }

    if (typeof input.click === "function") {
      try {
        input.click();
      } catch (_clickError) {
        // Focus can still succeed without click.
      }
    }
  }

  function selectInputContents(input) {
    if ("value" in input) {
      try {
        input.setSelectionRange(0, input.value.length);
      } catch (_selectionError) {
        // Textarea selection is a best-effort preparation.
      }
      return;
    }

    if (typeof root.getSelection !== "function" || typeof document.createRange !== "function") {
      return;
    }

    var selection = root.getSelection();
    var range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function placeCaretAtEnd(input) {
    if ("value" in input) {
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch (_selectionError) {
        // Ignore.
      }
      return;
    }

    if (typeof root.getSelection !== "function" || typeof document.createRange !== "function") {
      return;
    }

    var selection = root.getSelection();
    var range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function createInputEvent(text) {
    if (typeof InputEvent === "function") {
      return new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: "insertText",
        data: text
      });
    }

    return new Event("input", {
      bubbles: true,
      cancelable: true,
      composed: true
    });
  }

  function createBeforeInputEvent(text) {
    if (typeof InputEvent === "function") {
      return new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: "insertText",
        data: text
      });
    }

    return new Event("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true
    });
  }

  function dispatchInputEvents(input, text) {
    input.dispatchEvent(createInputEvent(text));
    input.dispatchEvent(new Event("change", {
      bubbles: true,
      cancelable: true,
      composed: true
    }));
  }

  function fallbackSetInput(input, text) {
    if ("value" in input) {
      setNativeValue(input, text);
      return;
    }

    input.textContent = text;

    try {
      input.innerText = text;
    } catch (_innerTextError) {
      // Some DOM implementations expose read-only innerText.
    }
  }

  function inputContainsText(input, text) {
    var expected = sanitizeExtractedText(text);
    var actual = sanitizeExtractedText(getInputText(input));

    if (!expected) {
      return true;
    }

    return actual.indexOf(expected) !== -1;
  }

  function dispatchPasteEvent(input, text) {
    var event = null;

    try {
      var dataTransfer = typeof DataTransfer === "function" ? new DataTransfer() : null;

      if (dataTransfer) {
        dataTransfer.setData("text/plain", text);
      }

      event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dataTransfer
      });
    } catch (_clipboardError) {
      event = new Event("paste", {
        bubbles: true,
        cancelable: true,
        composed: true
      });
    }

    input.dispatchEvent(event);
  }

  function getInputText(input) {
    if (!input) {
      return "";
    }

    if ("value" in input) {
      return String(input.value || "");
    }

    return String(input.innerText || input.textContent || "");
  }

  function insertPromptText(input, text) {
    var normalizedText = String(text || "");
    var inserted = false;

    focusInput(input);
    selectInputContents(input);
    input.dispatchEvent(createBeforeInputEvent(normalizedText));

    try {
      if (typeof document.execCommand === "function") {
        inserted = document.execCommand("insertText", false, normalizedText);
      }
    } catch (_execError) {
      inserted = false;
    }

    if (!inserted || !inputContainsText(input, normalizedText)) {
      selectInputContents(input);
      dispatchPasteEvent(input, normalizedText);
    }

    if (!inputContainsText(input, normalizedText)) {
      fallbackSetInput(input, normalizedText);
    }

    placeCaretAtEnd(input);
    dispatchInputEvents(input, normalizedText);
  }

  function isVisibleControl(element) {
    if (!element || element.disabled) {
      return false;
    }

    if (typeof element.getAttribute === "function" && element.getAttribute("aria-disabled") === "true") {
      return false;
    }

    var style = root.getComputedStyle ? root.getComputedStyle(element) : null;

    if (style && (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none")) {
      return false;
    }

    var rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;

    if (rect && rect.width === 0 && rect.height === 0) {
      return false;
    }

    return true;
  }

  function dispatchPointerOrMouseEvent(target, type, point) {
    var pointerEvent = type.indexOf("pointer") === 0 && typeof PointerEvent === "function";
    var EventConstructor = pointerEvent ? PointerEvent : MouseEvent;
    var isDown = type === "pointerdown" || type === "mousedown";
    var isUpOrClick = type === "pointerup" || type === "mouseup" || type === "click";
    var eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: isDown ? 1 : 0,
      clientX: point ? point.x : 0,
      clientY: point ? point.y : 0,
      screenX: point ? point.x : 0,
      screenY: point ? point.y : 0,
      view: root.window || root
    };

    if (isUpOrClick) {
      eventOptions.buttons = 0;
    }

    if (pointerEvent) {
      eventOptions.pointerId = 1;
      eventOptions.pointerType = "mouse";
      eventOptions.isPrimary = true;
    }

    target.dispatchEvent(new EventConstructor(type, eventOptions));
  }

  function dispatchMouseSubmitSequence(button) {
    if (typeof button.scrollIntoView === "function") {
      button.scrollIntoView({
        block: "center",
        inline: "center"
      });
    }

    if (typeof button.focus === "function") {
      button.focus();
    }

    var rect = typeof button.getBoundingClientRect === "function" ? button.getBoundingClientRect() : null;
    var point = rect
      ? {
        x: Math.max(0, rect.left + rect.width / 2),
        y: Math.max(0, rect.top + rect.height / 2)
      }
      : { x: 0, y: 0 };

    ["pointerover", "mouseover", "pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function dispatch(type) {
      dispatchPointerOrMouseEvent(button, type, point);
    });

    if (typeof button.click === "function") {
      button.click();
    }
  }

  function submitNearestForm(input, button) {
    var form = null;

    if (button && typeof button.closest === "function") {
      form = button.closest("form");
    }

    if (!form && input && typeof input.closest === "function") {
      form = input.closest("form");
    }

    if (!form) {
      return false;
    }

    if (typeof form.requestSubmit === "function") {
      try {
        form.requestSubmit(button || undefined);
        return true;
      } catch (_requestSubmitError) {
        // Fall through to submit event dispatch below.
      }
    }

    try {
      var submitEvent = typeof SubmitEvent === "function"
        ? new SubmitEvent("submit", {
          bubbles: true,
          cancelable: true,
          composed: true,
          submitter: button || null
        })
        : new Event("submit", {
          bubbles: true,
          cancelable: true,
          composed: true
        });

      form.dispatchEvent(submitEvent);
      return true;
    } catch (_submitEventError) {
      return false;
    }
  }

  function buttonLooksLikeSend(button) {
    var blockedPattern = /(attach|upload|voice|mic|microphone|menu|more|settings|model|tools|stop|cancel)/;
    var data = [
      button.getAttribute("data-testid") || "",
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
      button.getAttribute("type") || ""
    ].join(" ").toLowerCase();

    if (blockedPattern.test(data)) {
      return false;
    }

    return data.indexOf("send") !== -1
      || data.indexOf("submit") !== -1
      || data.indexOf("composer-submit") !== -1
      || String(button.getAttribute("type") || "").toLowerCase() === "submit";
  }

  function scoreSendButton(button) {
    var data = [
      button.getAttribute("data-testid") || "",
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
      button.getAttribute("type") || ""
    ].join(" ").toLowerCase();

    if (/(attach|upload|voice|mic|microphone|menu|more|settings|model|tools|stop|cancel)/.test(data)) {
      return -100;
    }

    var score = 0;

    if (data.indexOf("send") !== -1) {
      score += 50;
    }

    if (data.indexOf("submit") !== -1) {
      score += 35;
    }

    if (data.indexOf("composer") !== -1) {
      score += 15;
    }

    if (String(button.getAttribute("type") || "").toLowerCase() === "submit") {
      score += 10;
    }

    return score;
  }

  function bestButtonFromCandidates(candidates) {
    var bestButton = null;
    var bestScore = -Infinity;

    candidates.forEach(function scoreCandidate(button) {
      var score = scoreSendButton(button);

      if (score > bestScore) {
        bestScore = score;
        bestButton = button;
      }
    });

    return bestScore > 0 ? bestButton : null;
  }

  function scoreGenericButton(button, input) {
    var labelData = [
      button.getAttribute("data-testid") || "",
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
      button.textContent || ""
    ].join(" ").toLowerCase();

    if (/(attach|upload|voice|mic|microphone|menu|more|settings|model|tools|stop|cancel|file|image|plus)/.test(labelData)) {
      return -1000;
    }

    var buttonRect = typeof button.getBoundingClientRect === "function" ? button.getBoundingClientRect() : null;
    var inputRect = input && typeof input.getBoundingClientRect === "function" ? input.getBoundingClientRect() : null;
    var score = 0;

    if (buttonRect) {
      score += buttonRect.right || 0;
      score += (buttonRect.bottom || 0) * 0.5;
    }

    if (buttonRect && inputRect) {
      if (buttonRect.left >= inputRect.left - 20 && buttonRect.top >= inputRect.top - 80) {
        score += 100;
      }

      if (buttonRect.left >= inputRect.left + (inputRect.width * 0.65)) {
        score += 120;
      }

      if (buttonRect.top >= inputRect.top + (inputRect.height * 0.35)) {
        score += 60;
      }
    }

    if (labelData.indexOf("send") !== -1 || labelData.indexOf("submit") !== -1) {
      score += 300;
    }

    return score;
  }

  function bestGenericButtonFromCandidates(candidates, input) {
    var bestButton = null;
    var bestScore = -Infinity;

    candidates.forEach(function scoreCandidate(button) {
      var score = scoreGenericButton(button, input);

      if (score > bestScore) {
        bestScore = score;
        bestButton = button;
      }
    });

    return bestScore > -100 ? bestButton : null;
  }

  function findSendButton(input, allowGenericFallback) {
    var doc = input.ownerDocument || getDocument();
    var scopes = [];

    if (typeof input.closest === "function") {
      var form = input.closest("form");
      var composer = input.closest("form, main, [role='main'], [data-testid*='composer'], [class*='composer']");

      if (form) {
        scopes.push(form);
      }

      if (composer && composer !== form) {
        scopes.push(composer);
      }
    }

    scopes.push(doc);

    for (var scopeIndex = 0; scopeIndex < scopes.length; scopeIndex += 1) {
      var candidates = queryAll(SEND_BUTTON_SELECTORS, scopes[scopeIndex]).filter(isVisibleControl);
      var explicit = bestButtonFromCandidates(candidates);

      if (explicit) {
        return explicit;
      }
    }

    if (!allowGenericFallback) {
      return null;
    }

    for (var fallbackScopeIndex = 0; fallbackScopeIndex < scopes.length; fallbackScopeIndex += 1) {
      var fallbackCandidates = queryAll(SEND_BUTTON_FALLBACK_SELECTORS, scopes[fallbackScopeIndex])
        .filter(isVisibleControl)
        .filter(function rejectBlocked(button) {
          return scoreSendButton(button) > -100;
        });

      var genericButton = bestGenericButtonFromCandidates(fallbackCandidates, input);

      if (genericButton) {
        return genericButton;
      }
    }

    return null;
  }

  async function waitForSendButton(input) {
    var startedAt = Date.now();

    while (Date.now() - startedAt <= SEND_READY_TIMEOUT_MS) {
      var button = findSendButton(input, true);

      if (button && isVisibleControl(button)) {
        return button;
      }

      await sleep(SEND_READY_INTERVAL_MS);
    }

    return null;
  }

  function dispatchEnterFallback(input) {
    focusInput(input);
    placeCaretAtEnd(input);

    ["keydown", "keypress", "keyup"].forEach(function dispatch(type) {
      input.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13
      }));
    });
  }

  function inputLooksCleared(input, beforeText) {
    var currentText = sanitizeExtractedText(getInputText(input));
    var originalText = sanitizeExtractedText(beforeText);
    return originalText.length > 0 && currentText.length === 0;
  }

  function hasSubmitStarted(doc, input, beforeText) {
    if (hasActiveStopControl(doc)) {
      return true;
    }

    if (inputLooksCleared(input, beforeText)) {
      return true;
    }

    var explicitSend = queryAll(SEND_BUTTON_SELECTORS, doc).filter(isVisibleControl);
    return explicitSend.length === 0;
  }

  async function waitForSubmitStart(doc, input, beforeText) {
    var startedAt = Date.now();

    while (Date.now() - startedAt <= SUBMIT_VERIFY_TIMEOUT_MS) {
      if (hasSubmitStarted(doc, input, beforeText)) {
        return true;
      }

      await sleep(SUBMIT_VERIFY_INTERVAL_MS);
    }

    return false;
  }

  async function waitForInputSync(input, expectedText) {
    var startedAt = Date.now();

    while (Date.now() - startedAt <= 1200) {
      if (inputContainsText(input, expectedText)) {
        return true;
      }

      await sleep(100);
    }

    return inputContainsText(input, expectedText);
  }

  async function submitPrompt(input) {
    var doc = input.ownerDocument || getDocument();
    var beforeText = getInputText(input);
    var lastMethod = "none";

    for (var attempt = 1; attempt <= SUBMIT_ATTEMPTS; attempt += 1) {
      var button = await waitForSendButton(input);

      if (button) {
        focusInput(input);
        dispatchMouseSubmitSequence(button);
        lastMethod = "sendButtonMouseSequence";

        if (await waitForSubmitStart(doc, input, beforeText)) {
          return lastMethod;
        }

        if (submitNearestForm(input, button)) {
          lastMethod = "formRequestSubmitAfterButton";

          if (await waitForSubmitStart(doc, input, beforeText)) {
            return lastMethod;
          }
        }
      }

      dispatchEnterFallback(input);
      lastMethod = button ? "sendButtonThenEnterRetry" : "enterFallback";

      if (await waitForSubmitStart(doc, input, beforeText)) {
        return lastMethod;
      }

      await sleep(200 * attempt);
    }

    throw new Error("Prompt was inserted, but submit did not start. Last method: " + lastMethod);
  }

  async function handleWriteAndSend(text) {
    var doc = getDocument();
    var input = resolveInputContainer();
    var normalizedText = String(text || "");
    var previousText = extractLatestFinalAnswerText(doc);

    if (!normalizedText.trim()) {
      throw new Error("WRITE_AND_SEND text is empty.");
    }

    insertPromptText(input, normalizedText);
    await waitForInputSync(input, normalizedText);

    var submitMethod = await submitPrompt(input);

    log("Prompt submitted.", {
      submitMethod: submitMethod,
      textLength: normalizedText.length
    });

    return {
      ok: true,
      status: "submitted",
      submitMethod: submitMethod,
      textLength: normalizedText.length,
      previousText: previousText
    };
  }

  async function handleWriteOnly(text) {
    var input = resolveInputContainer();
    var normalizedText = String(text || "");

    if (!normalizedText.trim()) {
      throw new Error("WRITE_ONLY text is empty.");
    }

    insertPromptText(input, normalizedText);
    focusInput(input);
    placeCaretAtEnd(input);

    log("Prompt inserted without DOM submit.", {
      textLength: normalizedText.length
    });

    return {
      ok: true,
      status: "inserted",
      textLength: normalizedText.length
    };
  }

  function hasActiveStopControl(doc) {
    return STOP_BUTTON_SELECTORS.some(function hasStop(selector) {
      try {
        return isVisibleControl(doc.querySelector(selector));
      } catch (_selectorError) {
        return false;
      }
    });
  }

  function hasActiveSendControl(doc) {
    return SEND_BUTTON_SELECTORS.some(function hasSend(selector) {
      try {
        return isVisibleControl(doc.querySelector(selector));
      } catch (_selectorError) {
        return false;
      }
    });
  }

  function isProcessingComplete(doc) {
    if (isClaudeHost()) {
      return !hasActiveStopControl(doc);
    }

    return !hasActiveStopControl(doc) && hasActiveSendControl(doc);
  }

  function sanitizeExtractedText(text) {
    return String(text || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isThoughtPlaceholder(text) {
    var normalizedText = sanitizeExtractedText(text).toLowerCase();

    if (!normalizedText) {
      return true;
    }

    if (/^thought\s+for\s+\d+(\.\d+)?\s*(second|seconds|sec|secs)\b/.test(normalizedText)) {
      return true;
    }

    return /^thought\s+for\s+/.test(normalizedText) && normalizedText.length < 160;
  }

  function extractTextFromContainer(container) {
    var output = null;

    if (container.matches && (
      container.matches(".font-claude-response")
      || container.matches("[class*='claude-response']")
      || container.matches(".markdown")
      || container.matches(".prose")
    )) {
      return sanitizeExtractedText(container.innerText || container.textContent || "");
    }

    try {
      output = container.querySelector(OUTPUT_SELECTORS);
    } catch (_selectorError) {
      output = null;
    }

    if (!output) {
      output = container;
    }

    return sanitizeExtractedText(output.innerText || output.textContent || "");
  }

  function extractLatestFinalAnswerText(doc) {
    var resolvedDoc = doc || getDocument();
    var claudeResponses = queryAll([
      ".font-claude-response",
      "[class*='claude-response']"
    ], resolvedDoc);
    var containers = claudeResponses.length
      ? claudeResponses
      : queryAll(MESSAGE_CONTAINER_SELECTORS, resolvedDoc);

    for (var index = containers.length - 1; index >= 0; index -= 1) {
      var text = extractTextFromContainer(containers[index]);

      if (text && isThoughtPlaceholder(text)) {
        return "";
      }

      if (text) {
        return text;
      }
    }

    return "";
  }

  function isSameExtractedText(firstText, secondText) {
    return sanitizeExtractedText(firstText) === sanitizeExtractedText(secondText);
  }

  function isPromptEcho(text, sourceText) {
    var normalizedText = sanitizeExtractedText(text);
    var normalizedSource = sanitizeExtractedText(sourceText);

    if (!normalizedText || !normalizedSource) {
      return false;
    }

    return normalizedText === normalizedSource;
  }

  function handleReadResponse(options) {
    var doc = getDocument();
    var intervalMs = (options && options.intervalMs) || READ_RESPONSE_INTERVAL_MS;
    var timeoutMs = (options && options.timeoutMs) || READ_RESPONSE_TIMEOUT_MS;
    var previousText = options && options.previousText || "";
    var sourceText = options && options.sourceText || "";
    var startedAt = Date.now();
    var lastClaudeText = "";
    var stableClaudePolls = 0;

    return new Promise(function monitor(resolve, reject) {
      var intervalId = setInterval(function check() {
        try {
          if (Date.now() - startedAt > timeoutMs) {
            clearInterval(intervalId);
            reject(new Error("Timed out while waiting for response."));
            return;
          }

          if (!isProcessingComplete(doc)) {
            return;
          }

          var text = extractLatestFinalAnswerText(doc);

          if (!text) {
            return;
          }

          if (previousText && isSameExtractedText(text, previousText)) {
            return;
          }

          if (isPromptEcho(text, sourceText)) {
            return;
          }

          if (isClaudeHost()) {
            if (text === lastClaudeText) {
              stableClaudePolls += 1;
            } else {
              lastClaudeText = text;
              stableClaudePolls = 1;
            }

            if (stableClaudePolls < CLAUDE_RESPONSE_STABLE_POLLS) {
              return;
            }
          }

          clearInterval(intervalId);
          resolve({
            ok: true,
            text: text
          });
        } catch (caughtError) {
          clearInterval(intervalId);
          reject(caughtError);
        }
      }, intervalMs);
    });
  }

  function installRuntimeListener() {
    if (!root.window || !root.chrome || !root.chrome.runtime || !root.chrome.runtime.onMessage) {
      return;
    }

    if (root.window.hasExtensionRun) {
      log("Already registered; skipping duplicate listener.");
      return;
    }

    root.window.hasExtensionRun = true;

    root.chrome.runtime.onMessage.addListener(function onRuntimeMessage(message, sender, sendResponse) {
      if (!message || !message.action) {
        return false;
      }

      if (message.action === "WRITE_AND_SEND") {
        handleWriteAndSend(message.text)
          .then(sendResponse)
          .catch(function onWriteFailure(caughtError) {
            error("WRITE_AND_SEND failed:", caughtError);
            sendResponse({
              ok: false,
              error: caughtError.message
            });
          });
        return true;
      }

      if (message.action === "WRITE_ONLY") {
        handleWriteOnly(message.text)
          .then(sendResponse)
          .catch(function onWriteOnlyFailure(caughtError) {
            error("WRITE_ONLY failed:", caughtError);
            sendResponse({
              ok: false,
              error: caughtError.message
            });
          });
        return true;
      }

      if (message.action === "READ_RESPONSE") {
        handleReadResponse({
          previousText: message.previousText,
          sourceText: message.sourceText,
          target: message.target
        })
          .then(sendResponse)
          .catch(function onReadFailure(caughtError) {
            error("READ_RESPONSE failed:", caughtError);
            sendResponse({
              ok: false,
              error: caughtError.message
            });
          });
        return true;
      }

      warn("Unknown action ignored.", { action: message.action });
      return false;
    });
  }

  installRuntimeListener();

  if (typeof module !== "undefined") {
    module.exports = {
      handleReadResponse: handleReadResponse,
      handleWriteAndSend: handleWriteAndSend,
      handleWriteOnly: handleWriteOnly,
      insertPromptText: insertPromptText,
      isProcessingComplete: isProcessingComplete,
      resolveInputContainer: resolveInputContainer,
      sanitizeExtractedText: sanitizeExtractedText
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
