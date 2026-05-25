const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  SESSION_TOKEN_FILE,
  SESSION_HELLO_TYPE,
  createSessionToken,
  writeSessionTokenFile,
  createSessionGate
} = require("../main/ws-session");

const firstToken = createSessionToken();
const secondToken = createSessionToken();

assert.match(firstToken, /^[A-Za-z0-9_-]{32,}$/);
assert.match(secondToken, /^[A-Za-z0-9_-]{32,}$/);
assert.notEqual(firstToken, secondToken);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "copypaste-ws-session-"));

try {
  const tokenPath = path.join(tmpRoot, SESSION_TOKEN_FILE);
  writeSessionTokenFile(tmpRoot, firstToken);
  assert.deepEqual(JSON.parse(fs.readFileSync(tokenPath, "utf8")), {
    token: firstToken
  });
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

function createFakeSocket() {
  return {
    closed: false,
    closeCode: null,
    closeReason: null,
    close(code, reason) {
      this.closed = true;
      this.closeCode = code;
      this.closeReason = reason;
    }
  };
}

const accepted = [];
const gate = createSessionGate({
  expectedToken: firstToken,
  onAuthenticated: (hello) => accepted.push(hello)
});
const validSocket = createFakeSocket();
const validResult = gate.handleMessage(validSocket, JSON.stringify({
  type: SESSION_HELLO_TYPE,
  token: firstToken,
  nextTarget: "Claude"
}));

assert.equal(validResult.authenticated, true);
assert.equal(validSocket.closed, false);
assert.equal(gate.isAuthenticated(), true);
assert.deepEqual(accepted, [{
  type: SESSION_HELLO_TYPE,
  token: firstToken,
  nextTarget: "Claude"
}]);
assert.deepEqual(gate.handleMessage(validSocket, JSON.stringify({ ok: true, text: "answer" })).message, {
  ok: true,
  text: "answer"
});

const missingTokenGate = createSessionGate({ expectedToken: firstToken });
const missingTokenSocket = createFakeSocket();
assert.equal(missingTokenGate.handleMessage(missingTokenSocket, JSON.stringify({
  type: "EXTENSION_CONNECTED"
})).authenticated, false);
assert.equal(missingTokenSocket.closed, true);
assert.equal(missingTokenSocket.closeCode, 4401);
assert.match(missingTokenSocket.closeReason, /Invalid session token/);

const wrongTokenGate = createSessionGate({ expectedToken: firstToken });
const wrongTokenSocket = createFakeSocket();
assert.equal(wrongTokenGate.handleMessage(wrongTokenSocket, JSON.stringify({
  type: SESSION_HELLO_TYPE,
  token: secondToken
})).authenticated, false);
assert.equal(wrongTokenSocket.closed, true);
assert.equal(wrongTokenSocket.closeCode, 4401);
