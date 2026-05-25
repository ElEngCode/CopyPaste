const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(desktopRoot, "main.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(desktopRoot, "preload.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(desktopRoot, "renderer.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(desktopRoot, "index.html"), "utf8");

assert.match(mainSource, /preload:\s*path\.join\(__dirname,\s*"preload\.js"\)/);
assert.match(mainSource, /contextIsolation:\s*true/);
assert.match(mainSource, /nodeIntegration:\s*false/);
assert.doesNotMatch(mainSource, /contextIsolation:\s*false/);
assert.doesNotMatch(mainSource, /nodeIntegration:\s*true/);

assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("copypasteDesktop"/);
assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("copypasteProtocol"/);
assert.match(preloadSource, /TRIGGER_AI_WORKFLOW/);
assert.match(preloadSource, /VAULT_GENERATE_PACK/);

assert.doesNotMatch(rendererSource, /require\(["']electron["']\)/);
assert.doesNotMatch(rendererSource, /require\(/);
assert.doesNotMatch(rendererSource, /ipcRenderer\s*=\s*electron/);
assert.match(rendererSource, /window\.copypasteDesktop/);
assert.match(rendererSource, /window\.copypasteProtocol/);

assert.match(htmlSource, /<script src="renderer\.js"><\/script>/);
