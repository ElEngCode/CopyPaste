const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const activeContexts = new Set();

function pathExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findChromeExecutable() {
  const candidates = [
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : null,
    process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : null
  ].filter(Boolean);
  return candidates.find(pathExists) || null;
}

function findEdgeExecutable() {
  const candidates = [
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe") : null,
    process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe") : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe") : null
  ].filter(Boolean);
  return candidates.find(pathExists) || null;
}

function registerContext(context) {
  activeContexts.add(context);
}

function unregisterContext(context) {
  activeContexts.delete(context);
}

async function closeAllBrowserContexts() {
  const contexts = [...activeContexts];
  activeContexts.clear();
  for (const context of contexts) {
    try {
      await context.close();
    } catch {
      // noop
    }
  }
}

function resolveBrowserExecutable() {
  const chrome = findChromeExecutable();
  const edge = findEdgeExecutable();
  const executablePath = chrome || edge;
  const browserName = chrome ? "chrome" : edge ? "edge" : null;
  return { executablePath, browserName };
}

async function createPersistentContext(app) {
  const { executablePath, browserName } = resolveBrowserExecutable();

  if (!executablePath || !browserName) {
    throw new Error("Browser missing: Chrome/Edge executable was not found.");
  }

  const profileDir = path.join(app.getPath("userData"), "profiles", "chatgpt");
  fs.mkdirSync(profileDir, { recursive: true });

  const baseOptions = {
    executablePath,
    headless: false,
    viewport: null
  };

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      ...baseOptions,
      chromiumSandbox: true
    });
  } catch (error) {
    console.warn("Playwright sandbox launch failed. Retrying without chromiumSandbox.", error?.message || error);
    context = await chromium.launchPersistentContext(profileDir, baseOptions);
  }

  registerContext(context);
  context.on("close", () => unregisterContext(context));

  const page = context.pages()[0] || await context.newPage();
  return { context, page, browserName };
}

async function openChatGPT(app) {
  const result = await createPersistentContext(app);
  await result.page.goto("https://chatgpt.com", { waitUntil: "domcontentloaded" });
  return result;
}

module.exports = {
  findChromeExecutable,
  findEdgeExecutable,
  registerContext,
  unregisterContext,
  closeAllBrowserContexts,
  createPersistentContext,
  openChatGPT
};