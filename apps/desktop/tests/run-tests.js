const path = require("node:path");

const tests = [
  "state-debate.test.js",
  "ai-project-builder-protocol.test.js",
  "debate-prompts.test.js",
  "storage-debate.test.js",
  "prompt-vault.test.js",
  "electron-security.test.js",
  "controller-ui.test.js"
];

let failed = 0;

for (const file of tests) {
  try {
    require(path.join(__dirname, file));
    console.log(`ok ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok ${file}`);
    console.error(error && error.stack ? error.stack : error);
  }
}

if (failed) process.exit(1);
