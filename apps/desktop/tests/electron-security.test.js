const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(desktopRoot, "main.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(desktopRoot, "preload.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(desktopRoot, "renderer.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(desktopRoot, "index.html"), "utf8");
const extensionManifestSource = fs.readFileSync(path.join(desktopRoot, "..", "extension", "manifest.json"), "utf8");
const extensionWakeHtmlSource = fs.readFileSync(path.join(desktopRoot, "..", "extension", "wake.html"), "utf8");
const extensionWakeJsSource = fs.readFileSync(path.join(desktopRoot, "..", "extension", "wake.js"), "utf8");
const extensionManifest = JSON.parse(extensionManifestSource);

function createChromeExtensionId(publicKeyBase64) {
  const hash = crypto.createHash("sha256").update(Buffer.from(publicKeyBase64, "base64")).digest();
  const alphabet = "abcdefghijklmnop";
  let id = "";

  for (const byte of hash.subarray(0, 16)) {
    id += alphabet[(byte >> 4) & 0xf];
    id += alphabet[byte & 0xf];
  }

  return id;
}

assert.match(mainSource, /preload:\s*path\.join\(__dirname,\s*"preload\.js"\)/);
assert.match(mainSource, /contextIsolation:\s*true/);
assert.match(mainSource, /nodeIntegration:\s*false/);
assert.match(mainSource, /sandbox:\s*false/);
assert.doesNotMatch(mainSource, /contextIsolation:\s*false/);
assert.doesNotMatch(mainSource, /nodeIntegration:\s*true/);

assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("copypasteDesktop"/);
assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("copypasteProtocol"/);
assert.match(preloadSource, /TRIGGER_AI_WORKFLOW/);
assert.match(preloadSource, /sendWorkflow:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\(TRIGGER_WORKFLOW_CHANNEL,\s*payload\)/);
assert.match(preloadSource, /VAULT_GENERATE_PACK/);
assert.match(preloadSource, /EXTENSION_SETUP_ONCE/);
assert.match(preloadSource, /EXTENSION_CONNECT_INSTALLED/);
assert.match(preloadSource, /EXTENSION_COPY_PATH/);
assert.match(preloadSource, /EXTENSION_COPY_URL/);
assert.match(preloadSource, /EXTENSION_OPEN_FOLDER/);
assert.match(preloadSource, /setupExtensionOnce:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(EXTENSION_SETUP_ONCE_CHANNEL\)/);
assert.match(preloadSource, /connectInstalledExtension:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(EXTENSION_CONNECT_INSTALLED_CHANNEL\)/);
assert.match(preloadSource, /copyExtensionPath:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(EXTENSION_COPY_PATH_CHANNEL\)/);
assert.match(preloadSource, /copyExtensionsUrl:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(EXTENSION_COPY_URL_CHANNEL\)/);
assert.match(preloadSource, /openExtensionFolder:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(EXTENSION_OPEN_FOLDER_CHANNEL\)/);
assert.doesNotMatch(preloadSource, /EXTENSION_LAUNCH_CHROME/);
assert.match(mainSource, /ipcMain\.handle\(TRIGGER_WORKFLOW_CHANNEL/);
assert.doesNotMatch(mainSource, /ipcMain\.on\(TRIGGER_WORKFLOW_CHANNEL/);
assert.doesNotMatch(mainSource, /--load-extension/);
assert.doesNotMatch(mainSource, /--disable-extensions-except/);
assert.doesNotMatch(mainSource, /--remote-debugging-pipe/);
assert.doesNotMatch(mainSource, /--remote-debugging-port/);
assert.doesNotMatch(mainSource, /--enable-unsafe-extension-debugging/);
assert.doesNotMatch(mainSource, /Extensions\.loadUnpacked/);
assert.doesNotMatch(mainSource, /--user-data-dir/);
assert.match(mainSource, /function resolveChromeExecutable\(\)/);
assert.match(mainSource, /C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome\.exe/);
assert.doesNotMatch(mainSource, /^\s*"chrome\.exe"\s*,?\s*$/m);
assert.doesNotMatch(mainSource, /Chrome exited before DevTools pipe responded/);
assert.doesNotMatch(mainSource, /Remaining managed Chrome PIDs/);
assert.doesNotMatch(mainSource, /profileNeedle/);
assert.doesNotMatch(mainSource, /function runProcessCapture/);
assert.doesNotMatch(mainSource, /process\.kill\(pid\)/);
assert.doesNotMatch(mainSource, /waitForExtensionReady/);
assert.doesNotMatch(mainSource, /chrome-copypaste-profile-v3/);
assert.doesNotMatch(mainSource, /runProcessCapture\("powershell\.exe"/);
assert.match(mainSource, /COPYPASTE_EXTENSION_ID\s*=\s*"akbkdpfnbkafgnfanoddlkdlgdlkacdk"/);
assert.match(mainSource, /chrome-extension:\/\/\$\{COPYPASTE_EXTENSION_ID\}\/wake\.html/);
assert.match(mainSource, /EXTENSION_SETUP_ONCE_CHANNEL/);
assert.match(mainSource, /EXTENSION_CONNECT_INSTALLED_CHANNEL/);
assert.match(mainSource, /EXTENSION_COPY_PATH_CHANNEL/);
assert.match(mainSource, /EXTENSION_COPY_URL_CHANNEL/);
assert.match(mainSource, /EXTENSION_OPEN_FOLDER_CHANNEL/);
assert.match(mainSource, /clipboard\.writeText\(extensionRoot\)/);
assert.match(mainSource, /"--new-window",\s*CHROME_EXTENSIONS_URL/);
assert.match(mainSource, /manualFallback/);

assert.doesNotMatch(rendererSource, /require\(["']electron["']\)/);
assert.doesNotMatch(rendererSource, /require\(/);
assert.doesNotMatch(rendererSource, /ipcRenderer\s*=\s*electron/);
assert.match(rendererSource, /window\.copypasteDesktop/);
assert.match(rendererSource, /window\.copypasteProtocol/);

assert.match(htmlSource, /<script src="renderer\.js"><\/script>/);
assert.match(extensionManifestSource, /"key":\s*"MIIB/);
assert.equal(createChromeExtensionId(extensionManifest.key), "akbkdpfnbkafgnfanoddlkdlgdlkacdk");
assert.match(extensionWakeHtmlSource, /wake\.js/);
assert.match(extensionWakeJsSource, /COPYPASTE_WAKE/);
