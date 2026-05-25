const selectorsStore = require("./providers/selectors-store");
const { runChatGPTProvider, extractLastAssistantMessage } = require("./providers/chatgpt-provider");
const { closeAllBrowserContexts } = require("./browser-context");
const {
  ensureRunDebugDir,
  saveFailureScreenshot,
  saveCurrentUrl,
  saveRunLog,
  saveSafeTextSnippet
} = require("./debug-artifacts");

let activeRun = null;
let lastSession = null;

function assertPrompt(prompt) {
  if (!prompt || !String(prompt).trim()) throw new Error("Empty prompt is not allowed.");
}

async function cancelActiveAnalysis() {
  if (!activeRun) return { ok: false, error: "No active run." };
  activeRun.cancelled = true;
  await closeAllBrowserContexts();
  return { ok: true };
}

async function retryExtraction({ taskId, emitFinished }) {
  if (!lastSession || !lastSession.page) throw new Error("No browser session available for retry extraction.");
  if (taskId && lastSession.taskId !== taskId) throw new Error("Task mismatch for retry extraction.");
  const rawText = await extractLastAssistantMessage(lastSession.page, lastSession.selectors, []);
  emitFinished({ taskId: lastSession.taskId, rawResponse: rawText, parsed: null, promptLength: 0 });
  return { ok: true, rawText };
}

async function startAnalysis({ app, taskId, prompt, settings, emitStatus, emitFinished, emitFailed, emitWarning }) {
  assertPrompt(prompt);
  if (activeRun) throw new Error("Another AI run is already active.");

  activeRun = { taskId, runId: `run_${Date.now()}`, startedAt: Date.now(), cancelled: false };
  let providerResult = null;

  try {
    const selectors = await selectorsStore.loadSelectors();
    const onStatus = (status) => {
      if (!activeRun || activeRun.cancelled) return;
      emitStatus({ taskId, status, at: new Date().toISOString() });
    };

    providerResult = await runChatGPTProvider({
      app,
      settings,
      selectors,
      prompt: String(prompt),
      onStatus,
      onWarning: (message) => {
        if (emitWarning) emitWarning({ taskId, message, at: new Date().toISOString() });
      },
      shouldCancel: () => Boolean(activeRun?.cancelled)
    });

    if (activeRun?.cancelled) {
      emitStatus({ taskId, status: "cancelled", at: new Date().toISOString() });
      emitFailed({ taskId, error: "Run cancelled by user." });
      return { ok: false, cancelled: true };
    }

    lastSession = {
      taskId,
      page: providerResult.page,
      context: providerResult.context,
      selectors
    };

    emitFinished({ taskId, rawResponse: providerResult.rawText, parsed: null, promptLength: String(prompt).length });
    emitStatus({ taskId, status: "finished", at: new Date().toISOString() });
    return { ok: true, rawText: providerResult.rawText };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI run failed.";

    if (settings?.save_failure_screenshots) {
      try {
        const debugDir = await ensureRunDebugDir(app, taskId, activeRun.runId);
        await saveCurrentUrl(error._providerPage, debugDir);
        await saveRunLog(debugDir, error._providerRunLog || []);
        await saveSafeTextSnippet(debugDir, providerResult?.rawText || "");
        await saveFailureScreenshot(error._providerPage, debugDir);
      } catch {}
    }

    emitStatus({ taskId, status: activeRun?.cancelled ? "cancelled" : "failed", at: new Date().toISOString() });
    emitFailed({ taskId, error: activeRun?.cancelled ? "Run cancelled by user." : message });
    throw error;
  } finally {
    if (!settings?.keep_browser_open_after_run) {
      await closeAllBrowserContexts();
      lastSession = null;
    }
    activeRun = null;
  }
}

module.exports = {
  startAnalysis,
  cancelActiveAnalysis,
  retryExtraction
};