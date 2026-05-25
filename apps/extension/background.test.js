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
      lastError: null
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
