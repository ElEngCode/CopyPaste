const browserContext = require("../browser-context");
const {
  findFirstVisibleLocator,
  waitForAnySelector,
  safeClick,
  safeInnerText,
  detectProtectiveBlock,
  detectUsageLimit
} = require("./provider-utils");

const PRIMARY_URL = "https://chatgpt.com/";
const FALLBACK_URL = "https://chat.openai.com/";

const CONTINUE_SELECTORS_DEFAULT = [
  "button:has-text('Continue generating')",
  "button:has-text('Continue')",
  "[data-testid='continue-generating-button']",
  "button[aria-label*='Continue']"
];

const ASSISTANT_EXTRACT_FALLBACK = [
  "[data-message-author-role='assistant']",
  "[data-testid*='conversation-turn'] [data-message-author-role='assistant']",
  "main [class*='markdown']",
  "main"
];

function minutesToMs(value, fallbackMinutes) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallbackMinutes * 60 * 1000;
  return n * 60 * 1000;
}

function toSelectorArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  return String(value).split(",").map((s) => s.trim()).filter(Boolean);
}

function throwIfCancelled(shouldCancel) {
  if (typeof shouldCancel === "function" && shouldCancel()) {
    throw new Error("Run cancelled by user.");
  }
}

async function gotoWithFallback(page) {
  try {
    await page.goto(PRIMARY_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    return PRIMARY_URL;
  } catch {
    await page.goto(FALLBACK_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    return FALLBACK_URL;
  }
}

async function openNewConversationIfPossible(page, selectors, onWarning, runLog) {
  const locator = await findFirstVisibleLocator(page, selectors?.newChat, 1500);
  if (!locator) {
    if (onWarning) onWarning("newChat selector not found, continuing current conversation.");
    runLog.push({ at: new Date().toISOString(), event: "new_chat_missing" });
    return false;
  }
  await safeClick(locator);
  runLog.push({ at: new Date().toISOString(), event: "new_chat_clicked" });
  await page.waitForTimeout(400);
  return true;
}

async function sendPrompt(page, selectors, prompt, shouldCancel) {
  throwIfCancelled(shouldCancel);
  const input = await findFirstVisibleLocator(page, selectors?.input, 3000);
  if (!input) throw new Error("Input not found");

  const clicked = await safeClick(input);
  if (!clicked) throw new Error("Input not found");

  try {
    await input.fill(prompt, { timeout: 4000 });
  } catch {
    try {
      await input.type(prompt, { delay: 0, timeout: 6000 });
    } catch {
      throw new Error("Send failed");
    }
  }

  throwIfCancelled(shouldCancel);
  const sendBtn = await findFirstVisibleLocator(page, selectors?.sendButton, 1500);
  if (sendBtn) {
    const ok = await safeClick(sendBtn);
    if (!ok) await page.keyboard.press("Enter");
  } else {
    await page.keyboard.press("Enter");
  }
}

async function waitForChatGPTResponse(page, selectors, settings, runLog, shouldCancel) {
  const maxWait = minutesToMs(settings?.max_ai_run_minutes, 3);
  const started = Date.now();
  const assistantSelectors = toSelectorArray(selectors?.assistantMessages, ["[data-message-author-role='assistant']"]);
  let lastStableText = "";
  let stableCount = 0;

  while (Date.now() - started < maxWait) {
    throwIfCancelled(shouldCancel);
    if (await detectProtectiveBlock(page)) throw new Error("Protective block detected");
    if (await detectUsageLimit(page)) throw new Error("Usage limit detected");

    const assistant = await findFirstVisibleLocator(page, assistantSelectors, 1200);
    if (assistant) {
      const text = await safeInnerText(assistant);
      if (text && text === lastStableText) stableCount += 1;
      else {
        stableCount = 0;
        lastStableText = text;
      }

      const stopBtn = await findFirstVisibleLocator(page, selectors?.stopGenerating || "", 700);
      const sendBtn = await findFirstVisibleLocator(page, selectors?.sendButton || "", 700);
      if (!stopBtn || !!sendBtn || stableCount >= 3) {
        runLog.push({ at: new Date().toISOString(), event: "response_generation_complete", stableCount });
        return true;
      }
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Timed out waiting for response.");
}

async function handleContinueGenerating(page, selectors, runLog, maxContinues = 5, shouldCancel) {
  const selectorsList = toSelectorArray(selectors?.continueGenerating, CONTINUE_SELECTORS_DEFAULT);

  for (let i = 0; i < maxContinues; i += 1) {
    throwIfCancelled(shouldCancel);
    const locator = await findFirstVisibleLocator(page, selectorsList, 1200);
    if (!locator) return i;
    const clicked = await safeClick(locator);
    runLog.push({ at: new Date().toISOString(), event: "continue_generating", clicked });
    await page.waitForTimeout(1000);
  }

  return maxContinues;
}

async function extractLastAssistantMessage(page, selectors, runLog = []) {
  const candidateSelectors = [...toSelectorArray(selectors?.assistantMessages, []), ...ASSISTANT_EXTRACT_FALLBACK];

  for (const selector of candidateSelectors) {
    try {
      const nodes = page.locator(selector);
      const count = await nodes.count();
      if (!count) continue;

      for (let i = count - 1; i >= 0; i -= 1) {
        const text = (await nodes.nth(i).innerText({ timeout: 1500 })).trim();
        if (text.length >= 20) {
          runLog.push({ at: new Date().toISOString(), event: "assistant_text_extracted", selector });
          return text;
        }
      }
    } catch {}
  }

  throw new Error("Assistant response extraction failed.");
}

async function runChatGPTProvider({ app, settings, selectors, prompt, onStatus, onWarning, shouldCancel }) {
  const { context, page, browserName } = await browserContext.createPersistentContext(app);
  const runLog = [];

  try {
    if (onStatus) onStatus("opening");
    throwIfCancelled(shouldCancel);
    const navigated = await gotoWithFallback(page);
    runLog.push({ at: new Date().toISOString(), event: "goto", url: navigated });

    if (await detectProtectiveBlock(page)) throw new Error("Protective block detected");
    if (await detectUsageLimit(page)) throw new Error("Usage limit detected");

    if (onStatus) onStatus("finding_input");
    let input = await findFirstVisibleLocator(page, selectors?.input, 2000);
    if (!input) {
      if (onStatus) onStatus("waiting_login");
      const timeout = minutesToMs(settings?.login_timeout_minutes, 2);
      input = await waitForAnySelector(page, selectors?.input, timeout);
    }
    throwIfCancelled(shouldCancel);
    if (!input) throw new Error("Login timeout");

    await openNewConversationIfPossible(page, selectors, onWarning, runLog);

    if (onStatus) onStatus("sending_prompt");
    await sendPrompt(page, selectors, prompt, shouldCancel);

    if (onStatus) onStatus("waiting_response");
    await waitForChatGPTResponse(page, selectors, settings, runLog, shouldCancel);
    if (onStatus) onStatus("extracting_response");
    await handleContinueGenerating(page, selectors, runLog, 5, shouldCancel);
    await waitForChatGPTResponse(page, selectors, settings, runLog, shouldCancel);
    const rawText = await extractLastAssistantMessage(page, selectors, runLog);

    return { ok: true, rawText, browserName, context, page, runLog };
  } catch (error) {
    error._providerPage = page;
    error._providerContext = context;
    error._providerRunLog = runLog;
    throw error;
  }
}

module.exports = {
  runChatGPTProvider,
  waitForChatGPTResponse,
  handleContinueGenerating,
  extractLastAssistantMessage
};