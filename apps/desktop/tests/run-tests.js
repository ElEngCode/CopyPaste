const path = require("node:path");

const tests = [
  "state-debate.test.js",
  "ai-project-builder-protocol.test.js",
  "debate-prompts.test.js",
  "prompt-vault.test.js",
  "electron-security.test.js",
  "ws-session.test.js",
  "runtime-audit.test.js",
  "controller-ui.test.js",
  "workflow-integration.test.js",
  "session-recovery.test.js"
];

for (const file of tests) {
  console.log(`running ${file}`);
  try {
    require(path.join(__dirname, file));
    console.log(`ok ${file}`);
  } catch (error) {
    console.error(`not ok ${file}`);
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
}
