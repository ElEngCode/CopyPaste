const fs = require("node:fs/promises");
const path = require("node:path");
const defaults = require("./default-selectors");

let selectorsFilePath = null;

function ensureInit() {
  if (!selectorsFilePath) {
    throw new Error("Selectors store not initialized.");
  }
}

function initializeSelectorsStore(userDataPath) {
  selectorsFilePath = path.join(userDataPath, "selectors.json");
}

async function writeSelectors(data) {
  ensureInit();
  await fs.writeFile(selectorsFilePath, JSON.stringify(data, null, 2), "utf8");
  return data;
}

async function loadSelectors() {
  ensureInit();

  try {
    const raw = await fs.readFile(selectorsFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("selectors.json must contain an object");
    }
    return parsed;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return writeSelectors(defaults);
    }

    const brokenPath = path.join(path.dirname(selectorsFilePath), "selectors.broken.json");
    try {
      await fs.rename(selectorsFilePath, brokenPath);
    } catch {
      // ignore rename failures
    }
    return writeSelectors(defaults);
  }
}

async function saveSelectors(selectors) {
  const sanitized = selectors && typeof selectors === "object" && !Array.isArray(selectors) ? selectors : defaults;
  return writeSelectors(sanitized);
}

async function resetSelectorsToDefaults() {
  return writeSelectors(defaults);
}

module.exports = {
  initializeSelectorsStore,
  loadSelectors,
  saveSelectors,
  resetSelectorsToDefaults
};
