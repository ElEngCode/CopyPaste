const assert = require("node:assert/strict");
const test = require("node:test");

function loadContentModule() {
  global.window = global;
  global.window.hasExtensionRun = false;
  global.location = { hostname: "chatgpt.com" };
  delete global.chrome;
  delete require.cache[require.resolve("./content.js")];
  return require("./content.js");
}

function loadContentModuleForHost(hostname) {
  global.window = global;
  global.window.hasExtensionRun = false;
  global.location = { hostname };
  delete global.chrome;
  delete require.cache[require.resolve("./content.js")];
  return require("./content.js");
}

test("handleWriteAndSend populates the prompt container, dispatches events, and submits the parent form", async () => {
  const dispatchedEvents = [];
  const buttonEvents = [];
  let promptNode;
  const sendButton = {
    disabled: false,
    getAttribute(name) {
      if (name === "data-testid") {
        return "send-button";
      }

      if (name === "aria-label") {
        return "Send";
      }

      if (name === "type") {
        return "submit";
      }

      return "";
    },
    dispatchEvent(event) {
      buttonEvents.push(event.type);
      if (event.type === "click") {
        promptNode.textContent = "";
        promptNode.innerText = "";
      }
      return true;
    },
    click() {
      buttonEvents.push("native-click");
    },
    focus() {},
    scrollIntoView() {},
    getBoundingClientRect() {
      return { left: 200, top: 100, width: 32, height: 32 };
    }
  };
  const form = {
    querySelectorAll(selector) {
      if (selector.includes("send-button") || selector.includes("submit") || selector.includes("Send") || selector.includes("svg")) {
        return [sendButton];
      }

      return [];
    }
  };
  promptNode = {
    textContent: "",
    innerText: "",
    isContentEditable: true,
    ownerDocument: null,
    focus() {},
    click() {},
    dispatchEvent(event) {
      dispatchedEvents.push([event.type, event.bubbles]);
      return true;
    },
    closest(selector) {
      assert.match(selector, /form/);
      return form;
    },
    matches() {
      return false;
    }
  };

  global.Event = class {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options?.bubbles === true;
    }
  };
  global.InputEvent = global.Event;
  global.MouseEvent = global.Event;
  global.PointerEvent = global.Event;
  global.KeyboardEvent = global.Event;
  global.getComputedStyle = () => ({
    display: "block",
    visibility: "visible",
    pointerEvents: "auto"
  });
  global.document = {
    execCommand() {
      return false;
    },
    querySelector(selector) {
      if (selector === "#prompt-textarea p") {
        return promptNode;
      }

      if (selector === "#prompt-textarea") {
        return promptNode;
      }

      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  promptNode.ownerDocument = global.document;

  const { handleWriteAndSend } = loadContentModule();
  const result = await handleWriteAndSend("hello workflow");

  assert.deepEqual(result, {
    ok: true,
    status: "submitted",
    submitMethod: "submitButtonMouseChain",
    textLength: 14,
    previousText: ""
  });
  assert.equal(promptNode.textContent, "");
  assert.equal(promptNode.innerText, "");
  assert.deepEqual(buttonEvents, [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
    "native-click"
  ]);
  assert.deepEqual(dispatchedEvents, [
    ["beforeinput", true],
    ["beforeinput", true],
    ["input", true],
    ["change", true]
  ]);
});

test("handleReadResponse waits for send control and ignores Thought placeholders until final markdown exists", async () => {
  const sendButton = { disabled: false, offsetParent: {} };
  const markdownNode = { innerText: "Thought for 8 seconds", textContent: "Thought for 8 seconds" };
  const articles = [
    {
      innerText: "older raw article",
      textContent: "older raw article",
      querySelector(selector) {
        return { innerText: "older answer", textContent: "older answer" };
      }
    },
    {
      innerText: "Thought for 8 seconds\n\nhidden chain",
      textContent: "Thought for 8 seconds\n\nhidden chain",
      querySelector(selector) {
        return markdownNode;
      }
    }
  ];

  global.document = {
    querySelector(selector) {
      if (selector === "button[data-testid='send-button']") {
        return sendButton;
      }

      return null;
    },
    querySelectorAll(selector) {
      return selector === "article" ? articles : [];
    }
  };
  global.window = global;
  global.window.hasExtensionRun = false;
  global.location = { hostname: "chatgpt.com" };

  const { handleReadResponse } = loadContentModule();

  setTimeout(() => {
    markdownNode.innerText = "  processed\n\n\noutput\u200b  ";
    markdownNode.textContent = "  processed\n\n\noutput\u200b  ";
  }, 5);

  const result = await handleReadResponse({
    intervalMs: 1,
    timeoutMs: 50
  });

  assert.deepEqual(result, {
    ok: true,
    text: "processed\n\noutput"
  });
});

test("handleReadResponse does not complete before generation starts even with stale response text", async () => {
  let stopActive = false;
  const staleNode = {
    innerText: "stale prior response",
    textContent: "stale prior response"
  };

  global.document = {
    querySelector(selector) {
      if (selector === "button[data-testid='stop-button']") {
        return stopActive ? { disabled: false, getAttribute: () => null } : null;
      }

      return null;
    },
    querySelectorAll(selector) {
      if (selector === "article") {
        return [{
          innerText: staleNode.innerText,
          textContent: staleNode.textContent,
          querySelector() {
            return staleNode;
          }
        }];
      }

      return [];
    }
  };
  global.window = global;
  global.window.hasExtensionRun = false;
  global.location = { hostname: "chatgpt.com" };

  const { handleReadResponse } = loadContentModuleForHost("chatgpt.com");

  await assert.rejects(
    () => handleReadResponse({
      intervalMs: 1,
      timeoutMs: 30,
      previousText: "",
      sourceText: "new prompt text"
    }),
    /timeout waiting for completion/i
  );
});

test("handleReadResponse completes only after generation starts, response changes, and text becomes stable", async () => {
  let stopActive = true;
  let activeText = "Thought for 2 seconds";
  const markdownNode = {
    get innerText() {
      return activeText;
    },
    get textContent() {
      return activeText;
    }
  };

  global.document = {
    querySelector(selector) {
      if (selector === "button[data-testid='stop-button']") {
        return stopActive ? { disabled: false, getAttribute: () => null } : null;
      }

      return null;
    },
    querySelectorAll(selector) {
      if (selector === "article") {
        return [{
          innerText: activeText,
          textContent: activeText,
          querySelector() {
            return markdownNode;
          }
        }];
      }

      return [];
    }
  };
  global.window = global;
  global.window.hasExtensionRun = false;
  global.location = { hostname: "chatgpt.com" };

  const { handleReadResponse } = loadContentModuleForHost("chatgpt.com");

  setTimeout(() => {
    activeText = "Generated line 1";
  }, 5);
  setTimeout(() => {
    activeText = "Generated line 1\nGenerated line 2";
  }, 8);
  setTimeout(() => {
    stopActive = false;
  }, 10);

  const result = await handleReadResponse({
    intervalMs: 1,
    timeoutMs: 100,
    previousText: "",
    sourceText: "new prompt text"
  });

  assert.deepEqual(result, {
    ok: true,
    text: "Generated line 1\nGenerated line 2"
  });
});

test("handleReadResponse does not complete when no stop button exists and response text is empty", async () => {
  global.document = {
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "article") {
        return [{
          innerText: "",
          textContent: "",
          querySelector() {
            return { innerText: "", textContent: "" };
          }
        }];
      }

      return [];
    }
  };
  global.window = global;
  global.window.hasExtensionRun = false;
  global.location = { hostname: "chatgpt.com" };

  const { handleReadResponse } = loadContentModuleForHost("chatgpt.com");

  await assert.rejects(
    () => handleReadResponse({
      intervalMs: 1,
      timeoutMs: 20,
      previousText: "",
      sourceText: "new prompt text"
    }),
    /timeout waiting for completion/i
  );
});

test("Claude extraction combines response blocks instead of returning only the last paragraph", () => {
  const blocks = [
    {
      innerText: "Here's a structured critique of the plan, organized by theme.",
      textContent: "Here's a structured critique of the plan, organized by theme.",
      matches(selector) {
        return selector === ".font-claude-response";
      },
      querySelector() {
        return null;
      }
    },
    {
      innerText: "Summary of the sharpest issues:\n\nDistribution — the PWA should be primary.",
      textContent: "Summary of the sharpest issues:\n\nDistribution — the PWA should be primary.",
      matches(selector) {
        return selector === ".font-claude-response";
      },
      querySelector() {
        return null;
      }
    },
    {
      innerText: "Everything else in the critique is either fixable during implementation.",
      textContent: "Everything else in the critique is either fixable during implementation.",
      matches(selector) {
        return selector === ".font-claude-response";
      },
      querySelector() {
        return null;
      }
    }
  ];

  global.document = {
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".font-claude-response" ? blocks : [];
    }
  };
  global.window = global;
  global.window.hasExtensionRun = false;
  global.location = { hostname: "claude.ai" };

  const { extractLatestFinalAnswerText } = loadContentModuleForHost("claude.ai");
  const text = extractLatestFinalAnswerText(global.document);

  assert.match(text, /Here's a structured critique/);
  assert.match(text, /Distribution — the PWA should be primary/);
  assert.match(text, /Everything else in the critique/);
});

test("Claude extraction captures structured critique cards and filters widget chrome", () => {
  const cardNodes = [
    {
      innerText: "RISK\nCold start still unresolved\nInvite early reviewers is not a cold-start strategy. Recruit seed reviewers before launch.",
      textContent: "RISK\nCold start still unresolved\nInvite early reviewers is not a cold-start strategy. Recruit seed reviewers before launch."
    },
    {
      innerText: "NEW RISK\nNo API-level rate limiting or abuse prevention is mentioned anywhere\nAdd backend throttling before beta.",
      textContent: "NEW RISK\nNo API-level rate limiting or abuse prevention is mentioned anywhere\nAdd backend throttling before beta."
    }
  ];
  const widgetDoc = {
    querySelectorAll(selector) {
      if (selector === ".crit-wrap" || selector === "[class*='crit-wrap']") {
        return [{
          innerText: [
            "::view-transition-group(*) {",
            "animation-duration: 0.25s;",
            "}",
            "Vvisualize show_widget",
            "Persistent issues — not fixed from round 1",
            cardNodes[0].innerText,
            "New issues in this round",
            cardNodes[1].innerText
          ].join("\n"),
          textContent: "",
          querySelectorAll(innerSelector) {
            return innerSelector === ".crit-item" || innerSelector === "[class*='crit-item']" ? cardNodes : [];
          }
        }];
      }

      if (selector === ".crit-item" || selector === "[class*='crit-item']") {
        return cardNodes;
      }

      return [];
    },
    querySelector() {
      return null;
    }
  };

  global.document = {
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "iframe, frame") {
        return [{ contentDocument: widgetDoc }];
      }

      if (selector === ".font-claude-response") {
        return [{
          innerText: "Thought for 0s\nVvisualizeVvisualize show_widget\nSummary of the sharpest issues.",
          textContent: "Thought for 0s\nVvisualizeVvisualize show_widget\nSummary of the sharpest issues.",
          matches(matchSelector) {
            return matchSelector === ".font-claude-response";
          },
          querySelector() {
            return null;
          }
        }];
      }

      return [];
    }
  };
  global.window = global;
  global.window.hasExtensionRun = false;
  global.location = { hostname: "claude.ai" };

  const { extractLatestFinalAnswerText } = loadContentModuleForHost("claude.ai");
  const text = extractLatestFinalAnswerText(global.document);

  assert.match(text, /Cold start still unresolved/);
  assert.match(text, /No API-level rate limiting/);
  assert.doesNotMatch(text, /view-transition/);
  assert.doesNotMatch(text, /animation-duration/);
  assert.doesNotMatch(text, /Vvisualize/);
  assert.doesNotMatch(text, /Thought for 0s/);
});

test("Claude submission ignores unlabeled svg microphone buttons and falls back to Enter", async () => {
  const inputEvents = [];
  const microphoneEvents = [];
  let promptNode;
  const microphoneButton = {
    disabled: false,
    getAttribute() {
      return "";
    },
    textContent: "",
    dispatchEvent(event) {
      microphoneEvents.push(event.type);
      return true;
    },
    click() {
      microphoneEvents.push("native-click");
    },
    focus() {},
    scrollIntoView() {},
    getBoundingClientRect() {
      return { left: 760, top: 420, width: 32, height: 32 };
    }
  };
  const form = {
    querySelectorAll(selector) {
      return selector === "button:has(svg)" ? [microphoneButton] : [];
    }
  };

  promptNode = {
    textContent: "",
    innerText: "",
    ownerDocument: null,
    focus() {},
    click() {},
    dispatchEvent(event) {
      inputEvents.push(event.type);
      return true;
    },
    closest(selector) {
      assert.match(selector, /form/);
      return form;
    },
    matches() {
      return false;
    },
    getBoundingClientRect() {
      return { left: 120, top: 360, width: 700, height: 90 };
    }
  };

  global.Event = class {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options?.bubbles === true;
    }
  };
  global.InputEvent = global.Event;
  global.MouseEvent = global.Event;
  global.PointerEvent = global.Event;
  global.KeyboardEvent = global.Event;
  global.getComputedStyle = () => ({
    display: "block",
    visibility: "visible",
    pointerEvents: "auto"
  });
  global.document = {
    execCommand() {
      return false;
    },
    querySelector(selector) {
      return selector === ".ProseMirror[contenteditable='true']" ? promptNode : null;
    },
    querySelectorAll() {
      return [];
    }
  };
  promptNode.ownerDocument = global.document;

  const { handleWriteAndSend } = loadContentModuleForHost("claude.ai");
  const result = await handleWriteAndSend("critique this plan");

  assert.equal(result.submitMethod, "enterKeyFallbackNoStartSignal");
  assert.deepEqual(microphoneEvents, []);
  assert.ok(inputEvents.includes("keydown"));
  assert.ok(inputEvents.includes("keypress"));
  assert.ok(inputEvents.includes("keyup"));
});

test("Claude submission chooses Send message over record microphone", async () => {
  const buttonEvents = [];
  const recordEvents = [];
  let promptNode;
  const recordButton = {
    disabled: false,
    getAttribute(name) {
      return name === "aria-label" ? "Press and hold to record" : "";
    },
    textContent: "",
    dispatchEvent(event) {
      recordEvents.push(event.type);
      return true;
    },
    click() {
      recordEvents.push("native-click");
    },
    focus() {},
    scrollIntoView() {},
    getBoundingClientRect() {
      return { left: 700, top: 420, width: 32, height: 32 };
    }
  };
  const sendButton = {
    disabled: false,
    getAttribute(name) {
      return name === "aria-label" ? "Send message" : "";
    },
    textContent: "",
    dispatchEvent(event) {
      buttonEvents.push(event.type);
      if (event.type === "click") {
        promptNode.textContent = "";
        promptNode.innerText = "";
      }
      return true;
    },
    click() {
      buttonEvents.push("native-click");
    },
    focus() {},
    scrollIntoView() {},
    getBoundingClientRect() {
      return { left: 748, top: 420, width: 32, height: 32 };
    }
  };
  const form = {
    querySelectorAll(selector) {
      if (selector === "button[aria-label='Send message']") {
        return [sendButton];
      }

      if (selector === "button[aria-label*='send']" || selector === "button:has(svg)") {
        return [recordButton, sendButton];
      }

      return [];
    }
  };

  promptNode = {
    textContent: "",
    innerText: "",
    ownerDocument: null,
    focus() {},
    click() {},
    dispatchEvent() {
      return true;
    },
    closest(selector) {
      assert.match(selector, /form/);
      return form;
    },
    matches() {
      return false;
    },
    getBoundingClientRect() {
      return { left: 120, top: 360, width: 700, height: 90 };
    }
  };

  global.Event = class {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options?.bubbles === true;
    }
  };
  global.InputEvent = global.Event;
  global.MouseEvent = global.Event;
  global.PointerEvent = global.Event;
  global.KeyboardEvent = global.Event;
  global.getComputedStyle = () => ({
    display: "block",
    visibility: "visible",
    pointerEvents: "auto"
  });
  global.document = {
    execCommand() {
      return false;
    },
    querySelector(selector) {
      return selector === ".ProseMirror[contenteditable='true']" ? promptNode : null;
    },
    querySelectorAll() {
      return [];
    }
  };
  promptNode.ownerDocument = global.document;

  const { handleWriteAndSend } = loadContentModuleForHost("claude.ai");
  const result = await handleWriteAndSend("critique this plan");

  assert.equal(result.submitMethod, "submitButtonMouseChain");
  assert.deepEqual(recordEvents, []);
  assert.deepEqual(buttonEvents, [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
    "native-click"
  ]);
});
