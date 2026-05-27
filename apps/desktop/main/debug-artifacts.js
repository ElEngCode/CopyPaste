const fs = require("node:fs/promises");
const path = require("node:path");

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureRunDebugDir(app, taskId, runId) {
  const safeTask = String(taskId || "unknown-task").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeRun = String(runId || nowStamp()).replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(app.getPath("userData"), "debug", safeTask, safeRun);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function saveFailureScreenshot(page, dir) {
  if (!page) return null;
  const filePath = path.join(dir, "failure-screenshot.png");
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function saveCurrentUrl(page, dir) {
  const filePath = path.join(dir, "current-url.txt");
  const url = page ? page.url() : "";
  await fs.writeFile(filePath, String(url || ""), "utf8");
  return filePath;
}

async function saveRunLog(dir, runLog) {
  const filePath = path.join(dir, "run-log.json");
  await fs.writeFile(filePath, JSON.stringify(runLog || [], null, 2), "utf8");
  return filePath;
}

async function saveSafeTextSnippet(dir, snippet) {
  if (!snippet) return null;
  const filePath = path.join(dir, "safe-text-snippet.txt");
  await fs.writeFile(filePath, String(snippet).slice(0, 4000), "utf8");
  return filePath;
}

module.exports = {
  ensureRunDebugDir,
  saveFailureScreenshot,
  saveCurrentUrl,
  saveRunLog,
  saveSafeTextSnippet
};
