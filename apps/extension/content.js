(function installCopyPasteContentScript(root) {
  "use strict";

  if (!root.window || root.window.hasExtensionRun) {
    return;
  }

  root.window.hasExtensionRun = true;

  var LOG_PREFIX = "[CopyPaste][Content]";
  var REASONING_PLACEHOLDER_SENTINEL = "__COPYPASTE_REASONING_PLACEHOLDER__";
  var READ_RESPONSE_INTERVAL_MS = 1000;
  var READ_RESPONSE_TIMEOUT_MS = 180000;
  var SUBMIT_READY_TIMEOUT_MS = 7000;
  var SUBMIT_READY_INTERVAL_MS = 100;
  var STABLE_RESPONSE_POLLS = 2;
  var COMPLETION_STATES = {
    BEFORE_SEND: "before_send",
    SUBMITTED: "submitted",
    GENERATION_STARTED: "generation_started",
    RESPONSE_CHANGING: "response_changing",
    STABLE_COMPLETE: "stable_complete",
    TIMEOUT: "timeout"
  };

  var INPUT_SELECTORS = [
    "#prompt-textarea p",
    "#prompt-textarea",
    ".ProseMirror[contenteditable='true']",
    "[contenteditable='true'].ProseMirror",
    "[contenteditable='true'][data-placeholder]",
    "[contenteditable='true'][role='textbox']",
    "div[contenteditable='true']",
    "[role='textbox']",
    "textarea"
  ];

  var SEND_BUTTON_SELECTORS = [
    "button[data-testid='send-button']",
    "button[data-testid='composer-submit-button']",
    "button[data-testid='send-message-button']",
    "button[data-testid*='send']",
    "button[data-testid*='submit']",
    "button[aria-label='Send message']",
    "button[aria-label='Send Message']",
    "button[aria-label='Send prompt']",
    "button[aria-label='Trimite']",
    "button[aria-label*='Send']",
    "button[aria-label*='send']",
    "button[aria-label*='Trimite']",
    "button[type='submit']",
    "form button[type='submit']"
  ];
  var GENERIC_SEND_BUTTON_SELECTORS = [
    "button:has(svg)"
  ];

  var STOP_BUTTON_SELECTORS = [
    "button[data-testid='stop-button']",
    "button[data-testid*='stop']",
    "button[aria-label='Stop response']",
    "button[aria-label='Stop generating']",
    "button[aria-label*='Stop']",
    "button[aria-label*='stop']",
    "button[aria-label*='Cancel']",
    "button[aria-label*='cancel']"
  ];

  var RESPONSE_CONTAINER_SELECTORS = [
    "article",
    ".font-claude-response",
    ".font-claude-message",
    "[class*='claude-response']",
    "[class*='claude-message']",
    "[data-testid='assistant-message']",
    "[data-testid*='assistant-message']",
    "[data-testid*='conversation-turn']",
    "[data-message-author-role='assistant']",
    "[data-is-streaming]"
  ];

  var RESPONSE_BODY_SELECTOR = [
    ".markdown",
    ".prose",
    ".font-claude-response",
    ".font-claude-message",
    "[class*='claude-response']",
    "[class*='claude-message']",
    "[data-message-author-role='assistant'] .whitespace-pre-wrap"
  ].join(", ");

  function log(message, details) {
    if (details) {
      console.log(LOG_PREFIX, message, details);
      return;
    }

    console.log(LOG_PREFIX, message);
  }

  function warn(message, details) {
    if (details) {
      console.warn(LOG_PREFIX, message, details);
      return;
    }

    console.warn(LOG_PREFIX, message);
  }

  function getDocument() {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }

    return document;
  }

  function sleep(ms) {
    return new Promise(function sleepPromise(resolve) {
      setTimeout(resolve, ms);
    });
  }

  function isClaudeHost() {
    return String(root.location && root.location.hostname || "").toLowerCase().indexOf("claude.ai") !== -1;
  }

  function queryFirst(selectors, scope) {
    var rootNode = scope || getDocument();

    for (var index = 0; index < selectors.length; index += 1) {
      try {
        var element = rootNode.querySelector(selectors[index]);

        if (element) {
          return element;
        }
      } catch (_selectorError) {
        // Some browsers may not support every selector, especially :has().
      }
    }

    return null;
  }

  function queryAll(selectors, scope) {
    var rootNode = scope || getDocument();
    var results = [];
    var seen = new Set();

    selectors.forEach(function querySelectorList(selector) {
      var nodes = [];

      try {
        nodes = Array.from(rootNode.querySelectorAll(selector));
      } catch (_selectorError) {
        nodes = [];
      }

      nodes.forEach(function addUnique(node) {
        if (!seen.has(node)) {
          seen.add(node);
          results.push(node);
        }
      });
    });

    return results;
  }

  function normalizeInputElement(element) {
    if (!element) {
      return null;
    }

    if (typeof element.querySelector === "function") {
      var nestedEditable = element.querySelector(".ProseMirror[contenteditable='true'], [contenteditable='true'][role='textbox']");

      if (nestedEditable) {
        return nestedEditable;
      }
    }

    if (typeof element.closest === "function" && element.matches && element.matches("#prompt-textarea p")) {
      return element.closest("#prompt-textarea") || element.closest("[contenteditable='true']") || element;
    }

    return element;
  }

  function resolveInputContainer(doc) {
    var input = normalizeInputElement(queryFirst(INPUT_SELECTORS, doc || getDocument()));

    if (!input) {
      throw new Error("composer not found");
    }

    return input;
  }

  function focusInput(input) {
    if (typeof input.focus === "function") {
      input.focus();
    }

    if (typeof input.click === "function") {
      try {
        input.click();
      } catch (_clickError) {
        // Focusing is enough for most editors.
      }
    }
  }

  function selectInputContents(input) {
    if ("value" in input) {
      try {
        input.setSelectionRange(0, input.value.length);
      } catch (_selectionError) {
        // Not all value-based fields support setSelectionRange.
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

  function setNativeValue(element, value) {
    var prototype = Object.getPrototypeOf(element);
    var descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  function createInputEvent(type, text) {
    if (typeof InputEvent === "function") {
      return new InputEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: "insertText",
        data: text
      });
    }

    return new Event(type, {
      bubbles: true,
      cancelable: true,
      composed: true
    });
  }

  function dispatchInputEvents(input, text) {
    input.dispatchEvent(createInputEvent("beforeinput", text));
    input.dispatchEvent(createInputEvent("input", text));
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
      // Some DOM implementations expose innerText as read-only.
    }
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

  function sanitizeText(text) {
    return String(text || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanResponseText(text) {
    return sanitizeText(text)
      .replace(/\bThought\s+for\s+(?:0|\d+(?:\.\d+)?)s\b/gi, "")
      .replace(/Vvisualize/gi, "")
      .replace(/\bshow_widget\b/gi, "")
      .replace(/::view-transition-[\s\S]*?\}\s*/g, "")
      .replace(/^\s*(?:animation-duration|animation-timing-function|animation-name|transition-property|transition-duration|transition-timing-function)\s*:[^\n]*$/gmi, "")
      .replace(/^\s*[{}]\s*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function inputContainsText(input, text) {
    var expected = sanitizeText(text);
    var actual = sanitizeText(getInputText(input));

    if (!expected) {
      return true;
    }

    return actual.indexOf(expected) !== -1;
  }

  function insertText(input, text) {
    var normalizedText = String(text || "");
    var inserted = false;

    focusInput(input);
    selectInputContents(input);
    input.dispatchEvent(createInputEvent("beforeinput", normalizedText));

    try {
      if (typeof document.execCommand === "function") {
        inserted = document.execCommand("insertText", false, normalizedText);
      }
    } catch (_execError) {
      inserted = false;
    }

    if (!inserted || !inputContainsText(input, normalizedText)) {
      fallbackSetInput(input, normalizedText);
    }

    placeCaretAtEnd(input);
    dispatchInputEvents(input, normalizedText);
  }

  function isVisibleAndEnabled(element) {
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

  function buttonLooksBlocked(button) {
    var data = [
      button.getAttribute("data-testid") || "",
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
      button.textContent || ""
    ].join(" ").toLowerCase();

    return /(attach|upload|voice|mic|microphone|record|menu|more|settings|model|tools|stop|cancel|file|image|plus)/.test(data);
  }

  function scoreButton(button, input) {
    if (buttonLooksBlocked(button)) {
      return -1000;
    }

    var data = [
      button.getAttribute("data-testid") || "",
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
      button.getAttribute("type") || ""
    ].join(" ").toLowerCase();
    var score = 0;
    var hasExplicitSendIntent = data.indexOf("send") !== -1
      || data.indexOf("trimite") !== -1
      || data.indexOf("submit") !== -1
      || String(button.getAttribute("type") || "").toLowerCase() === "submit";

    if (isClaudeHost() && !hasExplicitSendIntent) {
      return -1000;
    }

    if (data.indexOf("send") !== -1 || data.indexOf("trimite") !== -1) {
      score += 200;
    }

    if (data.indexOf("submit") !== -1) {
      score += 80;
    }

    if (String(button.getAttribute("type") || "").toLowerCase() === "submit") {
      score += 40;
    }

    var buttonRect = typeof button.getBoundingClientRect === "function" ? button.getBoundingClientRect() : null;
    var inputRect = input && typeof input.getBoundingClientRect === "function" ? input.getBoundingClientRect() : null;

    if (buttonRect && inputRect) {
      if (buttonRect.left >= inputRect.left + inputRect.width * 0.6) {
        score += 40;
      }

      if (buttonRect.top >= inputRect.top - 80) {
        score += 20;
      }
    }

    return score;
  }

  function findSubmitButton(input) {
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
      var selectors = isClaudeHost()
        ? SEND_BUTTON_SELECTORS
        : SEND_BUTTON_SELECTORS.concat(GENERIC_SEND_BUTTON_SELECTORS);
      var candidates = queryAll(selectors, scopes[scopeIndex]).filter(isVisibleAndEnabled);
      var best = null;
      var bestScore = -Infinity;

      candidates.forEach(function scoreCandidate(button) {
        var score = scoreButton(button, input);

        if (score > bestScore) {
          best = button;
          bestScore = score;
        }
      });

      if (best && bestScore > -100) {
        return best;
      }
    }

    return null;
  }

  async function waitForSubmitButton(input) {
    var startedAt = Date.now();

    while (Date.now() - startedAt <= SUBMIT_READY_TIMEOUT_MS) {
      var button = findSubmitButton(input);

      if (button) {
        return button;
      }

      await sleep(SUBMIT_READY_INTERVAL_MS);
    }

    return null;
  }

  function dispatchPointerOrMouseEvent(target, type) {
    var rect = typeof target.getBoundingClientRect === "function" ? target.getBoundingClientRect() : null;
    var x = rect ? Math.max(0, rect.left + rect.width / 2) : 0;
    var y = rect ? Math.max(0, rect.top + rect.height / 2) : 0;
    var isPointer = type.indexOf("pointer") === 0 && typeof PointerEvent === "function";
    var EventConstructor = isPointer ? PointerEvent : MouseEvent;
    var eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      view: root.window || root
    };

    if (isPointer) {
      eventOptions.pointerId = 1;
      eventOptions.pointerType = "mouse";
      eventOptions.isPrimary = true;
    }

    target.dispatchEvent(new EventConstructor(type, eventOptions));
  }

  function clickSubmitButton(button) {
    if (typeof button.scrollIntoView === "function") {
      button.scrollIntoView({
        block: "center",
        inline: "center"
      });
    }

    if (typeof button.focus === "function") {
      button.focus();
    }

    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function dispatch(type) {
      dispatchPointerOrMouseEvent(button, type);
    });

    if (typeof button.click === "function") {
      button.click();
    }
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

  function hasActiveStopControl(doc) {
    return STOP_BUTTON_SELECTORS.some(function hasStop(selector) {
      try {
        return isVisibleAndEnabled(doc.querySelector(selector));
      } catch (_selectorError) {
        return false;
      }
    });
  }

  function hasActiveSendButton(doc) {
    var selectors = isClaudeHost()
      ? SEND_BUTTON_SELECTORS
      : SEND_BUTTON_SELECTORS.concat(GENERIC_SEND_BUTTON_SELECTORS);

    return selectors.some(function hasSend(selector) {
      try {
        return isVisibleAndEnabled(doc.querySelector(selector));
      } catch (_selectorError) {
        return false;
      }
    });
  }

  function inputLooksCleared(input, beforeText) {
    return sanitizeText(beforeText).length > 0 && sanitizeText(getInputText(input)).length === 0;
  }

  async function waitForSubmitStart(input, beforeText) {
    var doc = input.ownerDocument || getDocument();
    var startedAt = Date.now();

    while (Date.now() - startedAt <= 2500) {
      if (hasActiveStopControl(doc) || inputLooksCleared(input, beforeText)) {
        return true;
      }

      await sleep(100);
    }

    return false;
  }

  async function submitPrompt(input) {
    var button = await waitForSubmitButton(input);
    var beforeText = getInputText(input);

    if (!button && !isClaudeHost()) {
      throw new Error("submit button not found");
    }

    if (button) {
      clickSubmitButton(button);

      if (await waitForSubmitStart(input, beforeText)) {
        return "submitButtonMouseChain";
      }
    }

    dispatchEnterFallback(input);

    if (await waitForSubmitStart(input, beforeText)) {
      return "enterKeyFallback";
    }

    if (!button && !isClaudeHost()) {
      throw new Error("submit button not found");
    }

    return button ? "submitButtonMouseChainNoStartSignal" : "enterKeyFallbackNoStartSignal";
  }

  function stripReasoningPrelude(text) {
    return sanitizeText(text)
      .replace(/^thought\s+for\s+(?:\d+(?:\.\d+)?|a\s+couple(?:\s+of)?|several|few)\s*(?:seconds|second|secs|sec)?\b\s*>?\s*/i, "")
      .trim();
  }

  function isReasoningPlaceholder(text) {
    var normalized = sanitizeText(text).toLowerCase();

    if (!normalized) {
      return true;
    }

    if (/^thought\s+for\s+(?:\d+(\.\d+)?|a\s+couple(?:\s+of)?|several|few)\s*(seconds|second|secs|sec)?\b/.test(normalized)) {
      return true;
    }

    if (/\bthought\s+for\s+(?:\d+(\.\d+)?|a\s+couple(?:\s+of)?|several|few)\s*(seconds|second|secs|sec)?\b/.test(normalized) && normalized.length < 300) {
      return true;
    }

    return false;
  }

  function extractTextFromContainer(container) {
    if (!container) {
      return "";
    }

    if (container.matches && (
      container.matches(".markdown")
      || container.matches(".prose")
      || container.matches(".font-claude-response")
      || container.matches(".font-claude-message")
      || container.matches("[class*='claude-response']")
      || container.matches("[class*='claude-message']")
    )) {
      var directText = container.innerText || container.textContent || "";

      if (isReasoningPlaceholder(directText)) {
        return REASONING_PLACEHOLDER_SENTINEL;
      }

      return cleanResponseText(stripReasoningPrelude(directText));
    }

    var body = null;

    try {
      body = container.querySelector(RESPONSE_BODY_SELECTOR);
    } catch (_selectorError) {
      body = null;
    }

    if (!body) {
      body = container;
    }

    var bodyText = body.innerText || body.textContent || "";

    if (isReasoningPlaceholder(bodyText)) {
      return REASONING_PLACEHOLDER_SENTINEL;
    }

    return cleanResponseText(stripReasoningPrelude(bodyText));
  }

  function combineResponseBlocks(blocks) {
    return cleanResponseText(blocks
      .map(function extractBlockText(block) {
        return extractTextFromContainer(block);
      })
      .filter(function keepText(text) {
        return text && text !== REASONING_PLACEHOLDER_SENTINEL && !isReasoningPlaceholder(text);
      })
      .join("\n\n"));
  }

  function getSearchDocuments(doc) {
    var rootDoc = doc || getDocument();
    var docs = [rootDoc];
    var frames = [];

    try {
      frames = Array.from(rootDoc.querySelectorAll("iframe, frame"));
    } catch (_frameQueryError) {
      frames = [];
    }

    frames.forEach(function addFrameDocument(frame) {
      try {
        var frameDoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);

        if (frameDoc && docs.indexOf(frameDoc) === -1) {
          docs.push(frameDoc);
        }
      } catch (_crossOriginError) {
        // Cross-origin Claude widgets cannot be read from this frame.
      }
    });

    return docs;
  }

  function extractStructuredCritiqueText(doc) {
    var docs = getSearchDocuments(doc);
    var latestText = "";

    docs.forEach(function scanDocument(searchDoc) {
      var wrappers = queryAll([
        ".crit-wrap",
        "[class*='crit-wrap']"
      ], searchDoc);
      var scopes = wrappers.length ? wrappers : [searchDoc];

      scopes.forEach(function scanScope(scope) {
        var items = queryAll([
          ".crit-item",
          "[class*='crit-item']"
        ], scope);

        if (!items.length) {
          return;
        }

        latestText = cleanResponseText(items
          .map(function itemText(item) {
            return sanitizeText(item.innerText || item.textContent || "");
          })
          .filter(Boolean)
          .join("\n\n"));
      });
    });

    return latestText;
  }

  function extractLatestClaudeResponseText(doc) {
    var rootDoc = doc || getDocument();
    var structuredCritiqueText = extractStructuredCritiqueText(rootDoc);

    if (structuredCritiqueText) {
      return structuredCritiqueText;
    }

    var docs = getSearchDocuments(rootDoc);
    var claudeResponses = [];

    docs.forEach(function collectClaudeResponses(searchDoc) {
      claudeResponses = claudeResponses.concat(queryAll([
        ".font-claude-response",
        "[class*='claude-response']"
      ], searchDoc));
    });

    if (!claudeResponses.length) {
      return "";
    }

    var latest = claudeResponses[claudeResponses.length - 1];
    var scopedBlocks = [];

    if (latest && typeof latest.closest === "function") {
      var container = latest.closest("article, [data-testid*='message'], [data-testid*='conversation'], [class*='message'], [class*='response']");

      if (container && typeof container.querySelectorAll === "function") {
        scopedBlocks = queryAll([
          ".font-claude-response",
          "[class*='claude-response']"
        ], container);
      }
    }

    var blocks = scopedBlocks.length ? scopedBlocks : claudeResponses;
    return combineResponseBlocks(blocks);
  }

  function extractLatestFinalAnswerText(doc) {
    var rootDoc = doc || getDocument();
    var claudeText = extractLatestClaudeResponseText(rootDoc);

    if (claudeText) {
      return claudeText;
    }

    var containers = queryAll(RESPONSE_CONTAINER_SELECTORS, rootDoc);

    for (var index = containers.length - 1; index >= 0; index -= 1) {
      var text = extractTextFromContainer(containers[index]);

      if (text === REASONING_PLACEHOLDER_SENTINEL || (text && isReasoningPlaceholder(text))) {
        return "";
      }

      if (text) {
        return text;
      }
    }

    return "";
  }

  function isSameText(first, second) {
    return sanitizeText(first) === sanitizeText(second);
  }

  function isPromptEcho(text, sourceText) {
    var normalizedText = sanitizeText(text);
    var normalizedSource = sanitizeText(sourceText);

    return Boolean(normalizedText && normalizedSource && normalizedText === normalizedSource);
  }

  function getResponseObservation(doc) {
    var rootDoc = doc || getDocument();
    var docs = getSearchDocuments(rootDoc);
    var claudeResponseCount = 0;
    var structuredCritiqueCount = 0;

    docs.forEach(function countClaudeResponses(searchDoc) {
      claudeResponseCount += queryAll([
        ".font-claude-response",
        "[class*='claude-response']"
      ], searchDoc).length;

      structuredCritiqueCount += queryAll([
        ".crit-wrap",
        "[class*='crit-wrap']"
      ], searchDoc).length;
    });

    var genericResponseCount = queryAll(RESPONSE_CONTAINER_SELECTORS, rootDoc).length;
    var responseText = extractLatestFinalAnswerText(rootDoc);
    var hasContainer = claudeResponseCount > 0 || structuredCritiqueCount > 0 || genericResponseCount > 0;
    var signature = [
      claudeResponseCount,
      structuredCritiqueCount,
      genericResponseCount,
      sanitizeText(responseText)
    ].join("|");

    return {
      hasContainer: hasContainer,
      text: responseText,
      signature: signature
    };
  }

  function isProcessingComplete(readState, observation) {
    var hasStop = hasActiveStopControl(readState.doc);
    var responseChangedAfterSubmit = observation.signature !== readState.baselineSignature;

    if (!readState.hasGenerationStarted && (hasStop || responseChangedAfterSubmit)) {
      readState.hasGenerationStarted = true;
      readState.state = COMPLETION_STATES.GENERATION_STARTED;
    }

    if (responseChangedAfterSubmit) {
      readState.hasObservedResponseChange = true;
      if (readState.hasGenerationStarted) {
        readState.state = COMPLETION_STATES.RESPONSE_CHANGING;
      }
    }

    if (!readState.hasGenerationStarted || !readState.hasObservedResponseChange) {
      readState.stablePolls = 0;
      readState.lastText = "";
      return false;
    }

    var text = observation.text;
    var hasValidText = Boolean(
      text
      && !isSameText(text, readState.previousText)
      && !isPromptEcho(text, readState.sourceText)
    );

    if (!hasValidText || hasStop) {
      readState.stablePolls = 0;
      readState.lastText = "";
      return false;
    }

    if (text === readState.lastText) {
      readState.stablePolls += 1;
    } else {
      readState.lastText = text;
      readState.stablePolls = 1;
    }

    if (readState.stablePolls < STABLE_RESPONSE_POLLS) {
      return false;
    }

    readState.state = COMPLETION_STATES.STABLE_COMPLETE;
    return true;
  }

  async function handleWriteAndSend(text) {
    var doc = getDocument();
    var input = resolveInputContainer(doc);
    var normalizedText = String(text || "");
    var previousText = extractLatestFinalAnswerText(doc);

    if (!normalizedText.trim()) {
      throw new Error("WRITE_AND_SEND text is empty.");
    }

    insertText(input, normalizedText);
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

  function handleReadResponse(options) {
    var doc = getDocument();
    var intervalMs = options && options.intervalMs ? Number(options.intervalMs) : READ_RESPONSE_INTERVAL_MS;
    var timeoutMs = options && options.timeoutMs ? Number(options.timeoutMs) : READ_RESPONSE_TIMEOUT_MS;
    var previousText = options && options.previousText ? String(options.previousText) : "";
    var sourceText = options && options.sourceText ? String(options.sourceText) : "";
    var baselineObservation = getResponseObservation(doc);
    var startedAt = Date.now();
    var readState = {
      doc: doc,
      state: COMPLETION_STATES.BEFORE_SEND,
      hasGenerationStarted: false,
      hasObservedResponseChange: false,
      sawAnyResponseContainer: Boolean(baselineObservation.hasContainer),
      baselineSignature: baselineObservation.signature,
      previousText: previousText,
      sourceText: sourceText,
      lastText: "",
      stablePolls: 0
    };

    return new Promise(function readResponsePromise(resolve, reject) {
      readState.state = COMPLETION_STATES.SUBMITTED;
      var intervalId = setInterval(function pollDom() {
        try {
          if (Date.now() - startedAt > timeoutMs) {
            clearInterval(intervalId);
            readState.state = COMPLETION_STATES.TIMEOUT;
            reject(new Error(
              readState.sawAnyResponseContainer
                ? "timeout waiting for completion"
                : "response container not found"
            ));
            return;
          }

          var observation = getResponseObservation(doc);

          if (observation.hasContainer) {
            readState.sawAnyResponseContainer = true;
          }

          if (!isProcessingComplete(readState, observation)) {
            return;
          }

          clearInterval(intervalId);
          resolve({
            ok: true,
            text: observation.text
          });
        } catch (error) {
          clearInterval(intervalId);
          reject(new Error(error && error.message ? error.message : "timeout waiting for completion"));
        }
      }, intervalMs);
    });
  }

  function installRuntimeListener() {
    if (!root.chrome || !root.chrome.runtime || !root.chrome.runtime.onMessage) {
      return;
    }

    root.chrome.runtime.onMessage.addListener(function onRuntimeMessage(message, sender, sendResponse) {
      if (!message || !message.action) {
        return false;
      }

      if (message.action === "WRITE_AND_SEND") {
        handleWriteAndSend(message.text)
          .then(sendResponse)
          .catch(function handleWriteFailure(error) {
            warn("WRITE_AND_SEND failed.", { error: error.message });
            sendResponse({
              ok: false,
              error: error.message
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
          .catch(function handleReadFailure(error) {
            warn("READ_RESPONSE failed.", { error: error.message });
            sendResponse({
              ok: false,
              error: error.message
            });
          });
        return true;
      }

      return false;
    });
  }

  installRuntimeListener();

  if (typeof module !== "undefined") {
    module.exports = {
      extractLatestFinalAnswerText: extractLatestFinalAnswerText,
      handleReadResponse: handleReadResponse,
      handleWriteAndSend: handleWriteAndSend,
      resolveInputContainer: resolveInputContainer,
      sanitizeText: sanitizeText
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
