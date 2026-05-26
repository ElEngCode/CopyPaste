const assert = require("node:assert/strict");
const test = require("node:test");

function loadBackgroundWithChromeMock(chromeMock) {
  global.chrome = chromeMock;
  delete require.cache[require.resolve("./background.js")];
  return require("./background.js");
}

function matchesChromePattern(url, pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(url);
}

function filterTabs(tabs, queryInfo) {
  const patterns = Array.isArray(queryInfo.url) ? queryInfo.url : [queryInfo.url];
  return tabs.filter((tab) => {
    if (queryInfo.currentWindow && !tab.currentWindow) {
      return false;
    }

    return patterns.some((pattern) => matchesChromePattern(tab.url, pattern));
  });
}

function createChromeMock({ storedNextTarget = "chatgpt", readText = "processed output", frameReadText = "" } = {}) {
  const operations = [];
  const storageState = { nextTarget: storedNextTarget };
  const tabs = [
    { id: 12, url: "https://chatgpt.com/c/current-active", active: true, currentWindow: true },
    { id: 20, url: "https://claude.ai/chat/current", active: false, currentWindow: true }
  ];

  const chromeMock = {
    runtime: {
      lastError: null,
      getURL(resourcePath) {
        operations.push(["runtime.getURL", resourcePath]);
        return `chrome-extension://copy/${resourcePath}`;
      },
      onMessage: {
        addListener(listener) {
          operations.push(["runtime.onMessage.addListener", typeof listener]);
        }
      }
    },
    storage: {
      local: {
        get(keys, callback) {
          operations.push(["storage.get", keys]);
          callback({ nextTarget: storageState.nextTarget });
        },
        set(items) {
          operations.push(["storage.set", items]);
          Object.assign(storageState, items);
        }
      }
    },
    scripting: {
      executeScript(details, callback) {
        operations.push(["executeScript", details]);
        callback(frameReadText
          ? [{ frameId: 0, result: true }, { frameId: 4, result: true }]
          : [{ frameId: 0, result: true }]);
      }
    },
    tabs: {
      query(queryInfo, callback) {
        operations.push(["query", queryInfo]);
        callback(filterTabs(tabs, queryInfo));
      },
      update(tabId, updateProperties, callback) {
        operations.push(["update", tabId, updateProperties]);
        callback({ id: tabId, active: updateProperties.active === true });
      },
      sendMessage(tabId, payload, options, callback) {
        const messageOptions = typeof options === "function" ? {} : (options || {});
        const done = typeof options === "function" ? options : callback;
        operations.push(["sendMessage", tabId, payload, messageOptions]);

        if (payload.action === "READ_RESPONSE") {
          done({
            ok: true,
            text: messageOptions.frameId === 4 && frameReadText ? frameReadText : readText
          });
          return;
        }

        done({ ok: true, status: "submitted", previousText: "old output" });
      },
      remove(tabId, callback) {
        operations.push(["remove", tabId]);
        if (callback) callback();
      },
      create(createProperties, callback) {
        operations.push(["create", createProperties]);
        callback({ id: 88, url: createProperties.url });
      }
    }
  };

  return { chromeMock, operations, storageState };
}

test("runManualStep sends a ChatGPT step, reads output, and toggles to Claude", async () => {
  const { chromeMock, operations, storageState } = createChromeMock({
    storedNextTarget: "chatgpt",
    readText: "chatgpt answer"
  });
  const { runManualStep } = loadBackgroundWithChromeMock(chromeMock);

  const result = await runManualStep({
    chatgptPrefix: "Analyze: ",
    claudePrefix: "Critique: ",
    text: "initial prompt"
  });

  assert.deepEqual(result, {
    ok: true,
    target: "chatgpt",
    nextTarget: "claude",
    text: "chatgpt answer"
  });
  assert.equal(storageState.nextTarget, "claude");
  assert.deepEqual(operations, [
    ["storage.get", ["nextTarget"]],
    [
      "query",
      {
        currentWindow: true,
        url: ["*://chatgpt.com/*", "*://*.chatgpt.com/*"]
      }
    ],
    ["update", 12, { active: true }],
    ["executeScript", { target: { tabId: 12 }, files: ["content.js"] }],
    [
      "sendMessage",
      12,
      {
        action: "WRITE_AND_SEND",
        text: "Analyze: initial prompt",
        target: "chatgpt"
      },
      {}
    ],
    [
      "sendMessage",
      12,
      {
        action: "READ_RESPONSE",
        target: "chatgpt",
        sourceText: "Analyze: initial prompt",
        previousText: "old output"
      },
      {}
    ],
    ["storage.set", { nextTarget: "claude" }]
  ]);
});

test("runManualStep uses the Claude prefix when persistent target is Claude", async () => {
  const { chromeMock, operations, storageState } = createChromeMock({
    storedNextTarget: "claude",
    readText: "claude answer"
  });
  const { runManualStep } = loadBackgroundWithChromeMock(chromeMock);

  const result = await runManualStep({
    chatgptPrefix: "Analyze: ",
    claudePrefix: "Critique: ",
    text: "payload"
  });

  assert.deepEqual(result, {
    ok: true,
    target: "claude",
    nextTarget: "chatgpt",
    text: "claude answer"
  });
  assert.equal(storageState.nextTarget, "chatgpt");
  assert.deepEqual(operations[1], [
    "query",
    {
      currentWindow: true,
      url: ["*://claude.ai/*", "*://*.claude.ai/*"]
    }
  ]);
  assert.deepEqual(operations[4], [
    "sendMessage",
    20,
    {
      action: "WRITE_AND_SEND",
      text: "Critique: payload",
      target: "claude"
    },
    {}
  ]);
});

test("runManualStep honors explicit targetProvider without modifying stored next target", async () => {
  const { chromeMock, operations, storageState } = createChromeMock({
    storedNextTarget: "claude",
    readText: "gpt planner answer"
  });
  const { runManualStep } = loadBackgroundWithChromeMock(chromeMock);

  const result = await runManualStep({
    targetProvider: "chatgpt",
    chatgptPrefix: "",
    claudePrefix: "Critique: ",
    text: "Stage: GPT Planner"
  });

  assert.deepEqual(result, {
    ok: true,
    target: "chatgpt",
    nextTarget: "claude",
    text: "gpt planner answer"
  });
  assert.equal(storageState.nextTarget, "claude");
  assert.deepEqual(operations[1], [
    "query",
    {
      currentWindow: true,
      url: ["*://chatgpt.com/*", "*://*.chatgpt.com/*"]
    }
  ]);
  assert.deepEqual(operations[4], [
    "sendMessage",
    12,
    {
      action: "WRITE_AND_SEND",
      text: "Stage: GPT Planner",
      target: "chatgpt"
    },
    {}
  ]);
});

test("loadSessionToken reads the extension session token resource", async () => {
  const { chromeMock } = createChromeMock();
  chromeMock.runtime.getURL = (resourcePath) => `chrome-extension://copy/${resourcePath}`;
  global.fetch = async (url) => ({
    ok: true,
    async json() {
      return {
        token: url.endsWith("ws-session-token.json") ? "session-token-123" : ""
      };
    }
  });

  const { loadSessionToken, createSessionHello } = loadBackgroundWithChromeMock(chromeMock);
  const token = await loadSessionToken();

  assert.equal(token, "session-token-123");
  assert.deepEqual(createSessionHello(token, "claude"), {
    ok: true,
    type: "EXTENSION_SESSION_HELLO",
    token: "session-token-123",
    nextTarget: "claude"
  });
});

test("loadSessionToken rejects missing extension session token resource", async () => {
  const { chromeMock } = createChromeMock();
  chromeMock.runtime.getURL = (resourcePath) => `chrome-extension://copy/${resourcePath}`;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {};
    }
  });

  const { loadSessionToken } = loadBackgroundWithChromeMock(chromeMock);

  await assert.rejects(
    () => loadSessionToken(),
    /WebSocket session token is missing/
  );
});

test("connectToElectron does not create a duplicate socket while connecting", () => {
  const { chromeMock } = createChromeMock();
  const sockets = [];
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      sockets.push(this);
    }
  }
  global.WebSocket = FakeWebSocket;

  const { connectToElectron } = loadBackgroundWithChromeMock(chromeMock);

  connectToElectron();
  connectToElectron();

  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, "ws://localhost:8080");
});

test("handleWakeMessage reads the fresh token, handshakes, and closes the wake tab", async () => {
  const { chromeMock, operations } = createChromeMock({ storedNextTarget: "claude" });
  const fetchCalls = [];
  const sentMessages = [];
  const sockets = [];

  global.fetch = async (url, options) => {
    fetchCalls.push([url, options]);
    return {
      ok: true,
      async json() {
        return { token: "fresh-token-456" };
      }
    };
  };

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      sockets.push(this);
    }

    send(rawPayload) {
      sentMessages.push(JSON.parse(rawPayload));
    }

    close(code, reason) {
      this.readyState = FakeWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({ code, reason });
      }
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      if (this.onopen) {
        this.onopen();
      }
    }
  }
  global.WebSocket = FakeWebSocket;

  const { handleWakeMessage, stopHeartbeat } = loadBackgroundWithChromeMock(chromeMock);
  const wakeResultPromise = handleWakeMessage({ tab: { id: 99 } });
  sockets[0].open();
  const wakeResult = await wakeResultPromise;
  stopHeartbeat();

  assert.deepEqual(wakeResult, {
    ok: true,
    connected: true
  });
  assert.deepEqual(fetchCalls, [
    ["chrome-extension://copy/ws-session-token.json", { cache: "no-store" }]
  ]);
  assert.deepEqual(sentMessages[0], {
    ok: true,
    type: "EXTENSION_SESSION_HELLO",
    token: "fresh-token-456",
    nextTarget: "claude"
  });
  assert.deepEqual(sentMessages[1], {
    ok: true,
    type: "EXTENSION_CONNECTED",
    nextTarget: "claude"
  });
  assert.deepEqual(operations.at(-1), ["remove", 99]);
});

test("createTab opens chrome://extensions from extension context", async () => {
  const { chromeMock, operations } = createChromeMock();
  const { createTab } = loadBackgroundWithChromeMock(chromeMock);

  await createTab("chrome://extensions/");

  assert.deepEqual(operations.at(-1), ["create", { url: "chrome://extensions/" }]);
});

test("createTab surfaces chrome.tabs.create lastError", async () => {
  const { chromeMock } = createChromeMock();
  chromeMock.tabs.create = (createProperties, callback) => {
    chromeMock.runtime.lastError = { message: "not allowed" };
    callback(null);
    chromeMock.runtime.lastError = null;
  };

  const { createTab } = loadBackgroundWithChromeMock(chromeMock);

  await assert.rejects(
    () => createTab("chrome://extensions/"),
    /chrome\.tabs\.create failed: not allowed/
  );
});
