const selectorsStore = require("./providers/selectors-store");
const { runChatGPTProvider } = require("./providers/chatgpt-provider");
const { closeAllBrowserContexts } = require("./browser-context");

let activeRun = null;

function assertRoundInput({ debateId, roundId, prompt }) {
  if (!debateId) throw new Error("Missing debateId for debate round.");
  if (!roundId) throw new Error("Missing roundId for debate round.");
  if (!prompt || !String(prompt).trim()) throw new Error("Empty prompt is not allowed.");
}

async function genericManualAdapter({ debateId, roundId, provider, emitStatus }) {
  emitStatus({
    debateId,
    roundId,
    status: "manual_required",
    message: `${provider || "Provider"} is not automated yet. Copy the prompt and paste the response manually.`
  });
  return { ok: true, manual: true };
}

async function chatgptAdapter({ app, debateId, roundId, prompt, settings, emitStatus, emitFinished, emitWarning, shouldCancel }) {
  const selectors = await selectorsStore.loadSelectors();
  const result = await runChatGPTProvider({
    app,
    settings,
    selectors,
    prompt: String(prompt),
    onStatus: (status) => emitStatus({ debateId, roundId, status, message: `Round status: ${status}` }),
    onWarning: (message) => {
      if (emitWarning) emitWarning({ debateId, roundId, status: "warning", message });
    },
    shouldCancel
  });
  emitFinished({ debateId, roundId, rawResponse: result.rawText, provider: "chatgpt" });
  return { ok: true, rawText: result.rawText };
}

async function cancelRound() {
  if (!activeRun) return { ok: false, error: "No active debate round." };
  activeRun.cancelled = true;
  await closeAllBrowserContexts();
  return { ok: true };
}

async function startRound({ app, debateId, roundId, provider, prompt, settings, emitStatus, emitFinished, emitFailed, emitWarning }) {
  assertRoundInput({ debateId, roundId, prompt });
  if (activeRun) throw new Error("Another debate round is already active.");

  activeRun = { debateId, roundId, startedAt: Date.now(), cancelled: false };
  const selectedProvider = String(provider || "manual").toLowerCase();

  try {
    if (selectedProvider !== "chatgpt") {
      return await genericManualAdapter({ debateId, roundId, provider: selectedProvider, emitStatus });
    }

    return await chatgptAdapter({
      app,
      debateId,
      roundId,
      prompt,
      settings,
      emitStatus,
      emitFinished,
      emitWarning,
      shouldCancel: () => Boolean(activeRun?.cancelled)
    });
  } catch (error) {
    const message = activeRun?.cancelled ? "Round cancelled by user." : error.message || "Debate round failed.";
    emitStatus({ debateId, roundId, status: activeRun?.cancelled ? "cancelled" : "failed", message });
    emitFailed({ debateId, roundId, error: message });
    throw error;
  } finally {
    if (!settings?.keep_browser_open_after_run) {
      await closeAllBrowserContexts();
    }
    activeRun = null;
  }
}

module.exports = {
  startRound,
  cancelRound
};
