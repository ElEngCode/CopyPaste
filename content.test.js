const assert = require("node:assert/strict");
const test = require("node:test");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("observeTypingFinished calls callback only after 2 seconds without DOM changes", async () => {
  let observerCallback;
  const container = { textContent: "" };

  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#target");
      return container;
    }
  };

  global.MutationObserver = class {
    constructor(callback) {
      observerCallback = callback;
    }

    observe(target, options) {
      assert.equal(target, container);
      assert.deepEqual(options, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    disconnect() {}
  };

  const { observeTypingFinished } = require("./content.js");
  const callbackCalls = [];
  const stopObserving = observeTypingFinished("#target", (text) => {
    callbackCalls.push(text);
  });

  container.textContent = "Hel";
  observerCallback();

  await wait(1000);
  container.textContent = "Hello";
  observerCallback();

  await wait(1100);
  assert.deepEqual(callbackCalls, []);

  await wait(1000);
  assert.deepEqual(callbackCalls, ["Hello"]);

  stopObserving();
});

test("simulateReactTyping inserts text and dispatches React-compatible events", () => {
  class FakeTextArea {
    constructor() {
      this._value = "old text";
      this.dispatchedEvents = [];
      this._valueTracker = {
        calls: [],
        setValue(value) {
          this.calls.push(value);
        }
      };
    }

    dispatchEvent(event) {
      this.dispatchedEvents.push(event);
      return true;
    }
  }

  Object.defineProperty(FakeTextArea.prototype, "value", {
    get() {
      return this._value;
    },
    set(value) {
      this.usedNativeSetter = true;
      this._value = value;
    }
  });

  const textarea = new FakeTextArea();

  Object.defineProperty(textarea, "value", {
    get() {
      return this._value;
    },
    set() {
      throw new Error("Direct value assignment should not be used.");
    }
  });

  global.HTMLTextAreaElement = FakeTextArea;
  global.Event = class {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options?.bubbles === true;
    }
  };
  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#message");
      return textarea;
    }
  };

  const { simulateReactTyping } = require("./content.js");
  const result = simulateReactTyping("#message", "hello React");

  assert.equal(result, textarea);
  assert.equal(textarea.value, "hello React");
  assert.equal(textarea.usedNativeSetter, true);
  assert.deepEqual(textarea._valueTracker.calls, ["old text"]);
  assert.deepEqual(
    textarea.dispatchedEvents.map((event) => [event.type, event.bubbles]),
    [
      ["input", true],
      ["change", true]
    ]
  );
});

test("simulateHumanClick waits a human-like delay before dispatching mouse events", async () => {
  class FakeButton {
    constructor() {
      this.dispatchedEvents = [];
    }

    dispatchEvent(event) {
      this.dispatchedEvents.push(event);
      return true;
    }
  }

  const button = new FakeButton();
  const originalRandom = Math.random;

  global.HTMLButtonElement = FakeButton;
  global.MouseEvent = class {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options?.bubbles === true;
      this.cancelable = options?.cancelable === true;
      this.view = options?.view;
    }
  };
  global.window = { name: "test-window" };
  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#submit");
      return button;
    }
  };

  Math.random = () => 0.5;

  try {
    const { simulateHumanClick } = require("./content.js");
    const clickPromise = simulateHumanClick("#submit");

    await wait(600);
    assert.deepEqual(button.dispatchedEvents, []);

    const result = await clickPromise;
    assert.equal(result, button);
    assert.deepEqual(
      button.dispatchedEvents.map((event) => [
        event.type,
        event.bubbles,
        event.cancelable,
        event.view
      ]),
      [
        ["mousedown", true, true, global.window],
        ["mouseup", true, true, global.window],
        ["click", true, true, global.window]
      ]
    );
  } finally {
    Math.random = originalRandom;
  }
});
