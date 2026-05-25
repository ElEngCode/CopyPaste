const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SESSION_TOKEN_FILE = "ws-session-token.json";
const SESSION_HELLO_TYPE = "EXTENSION_SESSION_HELLO";
const UNAUTHORIZED_CLOSE_CODE = 4401;

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function writeSessionTokenFile(extensionRoot, token) {
  const tokenPath = path.join(extensionRoot, SESSION_TOKEN_FILE);
  fs.writeFileSync(tokenPath, JSON.stringify({ token }, null, 2), "utf8");
  return tokenPath;
}

function closeUnauthorized(socket) {
  if (socket && typeof socket.close === "function") {
    socket.close(UNAUTHORIZED_CLOSE_CODE, "Invalid session token.");
  }
}

function parseJson(rawData) {
  return JSON.parse(Buffer.isBuffer(rawData) ? rawData.toString("utf8") : String(rawData));
}

function isValidSessionHello(message, expectedToken) {
  return Boolean(
    message
      && typeof message === "object"
      && message.type === SESSION_HELLO_TYPE
      && typeof message.token === "string"
      && message.token.length > 0
      && message.token === expectedToken
  );
}

function createSessionGate({ expectedToken, onAuthenticated } = {}) {
  let authenticated = false;

  return {
    isAuthenticated: () => authenticated,
    handleMessage(socket, rawData) {
      let message;

      try {
        message = parseJson(rawData);
      } catch (error) {
        if (!authenticated) {
          closeUnauthorized(socket);
        }

        return {
          ok: false,
          authenticated,
          error: "Invalid JSON."
        };
      }

      if (!authenticated) {
        if (!isValidSessionHello(message, expectedToken)) {
          closeUnauthorized(socket);
          return {
            ok: false,
            authenticated: false,
            error: "Invalid session token."
          };
        }

        authenticated = true;
        if (typeof onAuthenticated === "function") {
          onAuthenticated(message);
        }

        return {
          ok: true,
          authenticated: true,
          handshake: true,
          message
        };
      }

      return {
        ok: true,
        authenticated: true,
        handshake: false,
        message
      };
    }
  };
}

module.exports = {
  SESSION_TOKEN_FILE,
  SESSION_HELLO_TYPE,
  UNAUTHORIZED_CLOSE_CODE,
  createSessionToken,
  writeSessionTokenFile,
  isValidSessionHello,
  createSessionGate
};
