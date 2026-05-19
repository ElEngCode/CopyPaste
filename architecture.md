# CopyPaste Orchestrator Architecture

## Project X-Ray

CopyPaste Orchestrator is a Manifest V3 Chrome extension that acts as the browser-side automation puppet for the Electron controller in `F:\Projects\Next Step`. Electron owns the user-gated workflow UI and runs a WebSocket server on `ws://localhost:8080`. The extension connects as a persistent WebSocket client, receives one manual step payload at a time, controls the active ChatGPT or Claude tab through content-script injection, extracts the finished answer, and sends the clean result back to Electron.

## Files

- `manifest.json`: Manifest V3 configuration for "CopyPaste Orchestrator", tab/scripting/download/storage permissions, ChatGPT/Claude host permissions, explicit local WebSocket CSP, and background service worker registration.
- `background.js`: Resilient WebSocket client and manual state machine. Maintains `nextTarget`, reconnects to Electron, receives `{ chatgptPrefix, claudePrefix, text }`, focuses the selected tab, injects `content.js`, sends `WRITE_AND_SEND`, polls with `READ_RESPONSE`, toggles the target, persists target memory, and returns `{ text }` to Electron.
- `content.js`: Universal dynamic DOM interaction engine injected into ChatGPT or Claude. Handles framework-resilient text insertion, send-button hardware event simulation, Enter fallback, generation completion polling, Claude/ChatGPT response extraction, reasoning-placeholder bypass, stale-output filtering, and sanitization.
- `popup.html`: Legacy popup UI file from the previous extension-controlled workflow. It is not registered by the current manifest and is inactive.
- `popup.js`: Legacy popup controller from the previous extension-controlled workflow. It is not registered by the current manifest and is inactive.
- `background.test.js`: Node regression coverage for the WebSocket manual state machine and ChatGPT/Claude target toggling.
- `content.test.js`: Node regression coverage for prompt insertion/submission and response extraction filtering.
- `codex.md`: Codex implementation progress log.

## Runtime State

- `socket`: Active WebSocket connection to Electron at `ws://localhost:8080`.
- `heartbeatTimer`: 25-second WebSocket heartbeat used to keep the MV3 service worker connection active and expose silent drops.
- `nextTarget`: Current manual destination. Defaults to `chatgpt`, then toggles between `chatgpt` and `claude` after a successful step.
- `chrome.storage.local.nextTarget`: Persistent copy of the next destination so service-worker restarts preserve workflow direction.

## Manual Flow

1. Electron UI sends `TRIGGER_AI_WORKFLOW` with `{ chatgptPrefix, claudePrefix, text }`.
2. Electron main process stringifies the payload and sends it through WebSocket.
3. Extension `background.js` receives the command and reads `nextTarget`.
4. If the target is ChatGPT, it combines `chatgptPrefix + text`; if Claude, it combines `claudePrefix + text`.
5. Background focuses the matching tab in the current window and injects `content.js`.
6. Background sends `WRITE_AND_SEND` with the combined prompt.
7. Background sends `READ_RESPONSE` with the source prompt and previous-output snapshot to avoid stale extraction.
8. `content.js` waits for generation completion, extracts the latest valid assistant output, sanitizes it, and returns it.
9. Background toggles `nextTarget`, persists it, and sends `{ ok: true, target, nextTarget, text }` back to Electron.
10. Electron updates the UI and waits for the next manual user action.

## Tech

- Chrome Extension Manifest V3
- Chrome APIs: `tabs`, `scripting`, `activeTab`, `downloads`, `storage`
- WebSocket client: browser-native `WebSocket`
- Extension CSP: `connect-src ws://localhost:8080 http://localhost:8080` for the local Electron bridge.
- Reconnect behavior: dropped connections schedule `connectToElectron()` after 5000ms and restart the heartbeat after `onopen`.
- Plain JavaScript, HTML, and CSS
- DOM APIs: `document.execCommand`, `InputEvent`, `PointerEvent`, `MouseEvent`, `KeyboardEvent`
- Claude submit path uses DOM-only composer insertion plus scoped Send-button detection. The observed Send control is `button[aria-label="Send message"]`, appears only after composer text exists, and is clicked via a center-point pointer/mouse sequence.
- Claude response completion does not require Send to remain visible; it waits for Stop to disappear and latest `.font-claude-response` text to stabilize.
- ChatGPT response completion also no longer requires the Send button to be active after the prompt is submitted; empty composers can hide or disable Send even when generation has finished. Completion is based on Stop controls disappearing plus latest response text stabilization.
- Each step snapshots the previous latest output before sending so `READ_RESPONSE` can ignore stale Claude text and return only a new response.
