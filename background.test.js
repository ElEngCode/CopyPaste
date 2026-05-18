const assert = require("node:assert/strict");
const test = require("node:test");

function loadBackgroundWithChromeMock(chromeMock) {
  global.chrome = chromeMock;
  delete require.cache[require.resolve("./background.js")];
  return require("./background.js");
}

test("START_LOOP coordinates writing, reading, and forwarding between ChatGPT and Claude tabs", async () => {
  let runtimeListener;
  const sentMessages = [];
  const tabs = [
    { id: 10, url: "https://chatgpt.com/c/test" },
    { id: 20, url: "https://claude.ai/chat/test" }
  ];

  const chromeMock = {
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeListener = listener;
        }
      }
    },
    tabs: {
      async query(queryInfo) {
        assert.deepEqual(queryInfo, {});
        return tabs;
      },
      async sendMessage(tabId, payload) {
        sentMessages.push([tabId, payload]);

        if (payload.action === "READ_RESPONSE") {
          return { text: "raspuns extras" };
        }

        return { ok: true };
      }
    }
  };

  const { startWorkflowLoop } = loadBackgroundWithChromeMock(chromeMock);

  assert.equal(typeof startWorkflowLoop, "function");

  const loopResult = await startWorkflowLoop();

  assert.deepEqual(loopResult, {
    chatGptTabId: 10,
    claudeTabId: 20,
    forwardedText: "raspuns extras"
  });
  assert.deepEqual(sentMessages, [
    [10, { action: "WRITE_AND_SEND", text: "mesaj de test" }],
    [10, { action: "READ_RESPONSE" }],
    [20, { action: "WRITE_AND_SEND", text: "raspuns extras" }]
  ]);

  const listenerResponses = [];
  const listenerReturnValue = runtimeListener(
    { action: "START_LOOP" },
    {},
    (response) => listenerResponses.push(response)
  );

  assert.equal(listenerReturnValue, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(listenerResponses, [
    {
      ok: true,
      result: {
        chatGptTabId: 10,
        claudeTabId: 20,
        forwardedText: "raspuns extras"
      }
    }
  ]);
});
