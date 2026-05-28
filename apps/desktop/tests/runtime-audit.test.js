const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const desktopRoot = path.join(repoRoot, "apps", "desktop");

const desktopPackage = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8"));
const mainSource = fs.readFileSync(path.join(desktopRoot, "main.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(desktopRoot, "preload.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(desktopRoot, "renderer.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(desktopRoot, "index.html"), "utf8");
const readmeSource = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
const architectureSource = fs.readFileSync(path.join(repoRoot, "architecture.md"), "utf8");

assert.equal(desktopPackage.main, "main.js");
assert.match(mainSource, /preload:\s*path\.join\(__dirname,\s*"preload\.js"\)/);
assert.match(mainSource, /mainWindow\.loadFile\(path\.join\(__dirname,\s*"index\.html"\)\)/);
assert.doesNotMatch(mainSource, /main\/main\.js/);

assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("copypasteDesktop"/);
assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("copypasteProtocol"/);
assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("nextstepClipboard"/);
assert.doesNotMatch(preloadSource, /contextBridge\.exposeInMainWorld\("nextstepApp"/);
assert.doesNotMatch(preloadSource, /contextBridge\.exposeInMainWorld\("nextstepStorage"/);
assert.doesNotMatch(preloadSource, /contextBridge\.exposeInMainWorld\("nextstepAI"/);
assert.doesNotMatch(preloadSource, /contextBridge\.exposeInMainWorld\("nextstepDebateRunner"/);
assert.doesNotMatch(preloadSource, /contextBridge\.exposeInMainWorld\("nextstepBrowser"/);
assert.doesNotMatch(preloadSource, /contextBridge\.exposeInMainWorld\("nextstepSelectors"/);

assert.match(rendererSource, /window\.nextstepClipboard\.copyText/);
assert.doesNotMatch(rendererSource, /window\.nextstepStorage/);
assert.doesNotMatch(rendererSource, /window\.nextstepAI/);
assert.doesNotMatch(rendererSource, /window\.nextstepDebateRunner/);
assert.doesNotMatch(rendererSource, /window\.nextstepBrowser/);
assert.doesNotMatch(rendererSource, /window\.nextstepSelectors/);

assert.doesNotMatch(htmlSource, /AI Debate/);
assert.doesNotMatch(htmlSource, /data-workspace-tab="debate"/);
assert.match(htmlSource, /id="legacyPromptTools"[^>]*style="display:none;"/);

for (const source of [mainSource, preloadSource, rendererSource, htmlSource]) {
  assert.doesNotMatch(source, /F:\\Projects\\CopyPaste/i);
  assert.doesNotMatch(source, /C:\\Users\\[^\\]+\\Desktop/i);
}

assert.match(readmeSource, /npm\.cmd run desktop/);
assert.match(readmeSource, /apps\/extension/);
assert.match(readmeSource, /Project Idea -> Master Plan Draft -> Task Roadmap Draft -> Tasks -> Codex/);
assert.match(readmeSource, /Generate Master Plan/);
assert.match(readmeSource, /Create All Tasks/);
assert.match(architectureSource, /apps\/desktop\/main\.js/);
assert.match(architectureSource, /apps\/desktop\/main\/main\.js/);
assert.match(architectureSource, /not part of the active runtime/i);
