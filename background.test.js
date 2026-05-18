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

test("executeNextStep sends the staged text to ChatGPT and toggles next target", async () => {
  const operations = [];
  const tabs = [
    { id: 10, url: "https://chatgpt.com/c/background", active: false, currentWindow: false },
    { id: 12, url: "https://chatgpt.com/c/current-active", active: true, currentWindow: true },
    { id: 20, url: "https://claude.ai/chat/current", active: false, currentWindow: true }
  ];

  const chromeMock = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener() {}
      }
    },
    scripting: {
      executeScript(details, callback) {
        operations.push(["executeScript", details]);
        callback([{ frameId: 0, result: true }]);
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
      sendMessage(tabId, payload, callback) {
        operations.push(["sendMessage", tabId, payload]);

        if (payload.action === "READ_RESPONSE") {
          callback({ ok: true, text: "processed output" });
          return;
        }

        callback({ ok: true, status: "submitted", previousText: "old output" });
      }
    },
    downloads: {
      download() {}
    }
  };

  const { executeNextStep } = loadBackgroundWithChromeMock(chromeMock);
  const result = await executeNextStep({
    chatgptPrefix: "Analyze: ",
    claudePrefix: "Critique: ",
    text: "initial prompt"
  });

  assert.deepEqual(result, {
    ok: true,
    stagedText: "processed output",
    nextTarget: "claude",
    isExecuting: false,
    completedTarget: "chatgpt",
    completedTabId: 12
  });
  assert.deepEqual(operations, [
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
      }
    ],
    [
      "sendMessage",
      12,
      {
        action: "READ_RESPONSE",
        target: "chatgpt",
        sourceText: "Analyze: initial prompt",
        previousText: "old output"
      }
    ]
  ]);
});

test("runtime listener supports GET_STATE, EXECUTE_NEXT_STEP, and TRIGGER_SAVE", async () => {
  let runtimeListener;
  const downloads = [];

  const chromeMock = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener) {
          runtimeListener = listener;
        }
      }
    },
    scripting: {
      executeScript(_details, callback) {
        callback([{ frameId: 0, result: true }]);
      }
    },
    tabs: {
      query(queryInfo, callback) {
        const tabs = [
          { id: 10, url: "https://chatgpt.com/c/test", active: true, currentWindow: true },
          { id: 20, url: "https://claude.ai/chat/test", active: false, currentWindow: true }
        ];
        callback(filterTabs(tabs, queryInfo));
      },
      update(tabId, updateProperties, callback) {
        callback({ id: tabId, active: updateProperties.active === true });
      },
      sendMessage(_tabId, payload, callback) {
        callback(payload.action === "READ_RESPONSE"
          ? { ok: true, text: "final answer" }
          : { ok: true, previousText: "" });
      }
    },
    downloads: {
      download(options, callback) {
        downloads.push(options);
        callback(42);
      }
    }
  };

  loadBackgroundWithChromeMock(chromeMock);

  const stateResponses = [];
  assert.equal(runtimeListener({ action: "GET_STATE" }, {}, (response) => stateResponses.push(response)), false);
  assert.deepEqual(stateResponses, [
    {
      ok: true,
      stagedText: "mesaj de test",
      nextTarget: "chatgpt",
      isExecuting: false
    }
  ]);

  const stepResponses = [];
  assert.equal(runtimeListener(
    {
      action: "EXECUTE_NEXT_STEP",
      chatgptPrefix: "GPT: ",
      claudePrefix: "Claude: ",
      text: "from popup"
    },
    {},
    (response) => stepResponses.push(response)
  ), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(stepResponses, [
    {
      ok: true,
      stagedText: "final answer",
      nextTarget: "claude",
      isExecuting: false,
      completedTarget: "chatgpt",
      completedTabId: 10
    }
  ]);

  const saveResponses = [];
  assert.equal(runtimeListener(
    { action: "TRIGGER_SAVE", text: "saved text" },
    {},
    (response) => saveResponses.push(response)
  ), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(saveResponses[0].ok, true);
  assert.equal(saveResponses[0].downloadId, 42);
  assert.equal(saveResponses[0].stagedText, "saved text");
  assert.equal(downloads[0].filename, "ai_final_output.txt");
  assert.match(downloads[0].url, /^data:text\/plain;charset=utf-8,/);
});
