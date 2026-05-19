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
