const CHATGPT_URL_PART = "chatgpt.com";
const CLAUDE_URL_PART = "claude.ai";
const TEST_MESSAGE = "mesaj de test";

async function findWorkflowTabs() {
  const tabs = await chrome.tabs.query({});
  const chatGptTab = tabs.find((tab) => tab.url?.includes(CHATGPT_URL_PART));
  const claudeTab = tabs.find((tab) => tab.url?.includes(CLAUDE_URL_PART));

  if (!chatGptTab?.id) {
    throw new Error("Could not find a tab with chatgpt.com in the URL.");
  }

  if (!claudeTab?.id) {
    throw new Error("Could not find a tab with claude.ai in the URL.");
  }

  return {
    chatGptTabId: chatGptTab.id,
    claudeTabId: claudeTab.id
  };
}

async function writeAndSendToTab(tabId, text) {
  return chrome.tabs.sendMessage(tabId, {
    action: "WRITE_AND_SEND",
    text
  });
}

function extractResponseText(response) {
  if (typeof response === "string") {
    return response;
  }

  if (typeof response?.text === "string") {
    return response.text;
  }

  if (typeof response?.extractedText === "string") {
    return response.extractedText;
  }

  throw new Error("READ_RESPONSE did not return extracted text.");
}

async function readResponseFromTab(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, {
    action: "READ_RESPONSE"
  });

  return extractResponseText(response);
}

async function forwardFirstTabResponseToSecondTab(firstTabId, secondTabId) {
  const extractedText = await readResponseFromTab(firstTabId);
  await writeAndSendToTab(secondTabId, extractedText);
  return extractedText;
}

async function startWorkflowLoop() {
  const { chatGptTabId, claudeTabId } = await findWorkflowTabs();

  await writeAndSendToTab(chatGptTabId, TEST_MESSAGE);
  const forwardedText = await forwardFirstTabResponseToSecondTab(chatGptTabId, claudeTabId);

  return {
    chatGptTabId,
    claudeTabId,
    forwardedText
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== "START_LOOP") {
    return false;
  }

  startWorkflowLoop()
    .then((result) => {
      sendResponse({ ok: true, result });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message
      });
    });

  return true;
});

if (typeof module !== "undefined") {
  module.exports = {
    findWorkflowTabs,
    writeAndSendToTab,
    readResponseFromTab,
    forwardFirstTabResponseToSecondTab,
    startWorkflowLoop
  };
}
