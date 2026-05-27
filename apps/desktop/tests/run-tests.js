const path = require("node:path");

const tests = [
  "prompt-vault.test.js"
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
