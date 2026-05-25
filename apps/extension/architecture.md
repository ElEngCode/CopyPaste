# CopyPaste Orchestrator Architecture

## Project X-Ray

CopyPaste Orchestrator is a Manifest V3 Chrome extension that acts as the browser-side automation puppet for the Electron controller in `F:\Projects\Next Step`. Electron owns the user-gated workflow UI and runs a WebSocket server on `ws://localhost:8080`. The extension connects as a persistent WebSocket client, receives one manual step payload at a time, controls the active ChatGPT or Claude tab through content-script injection, extracts the finished answer, and sends the clean result back to Electron.

## Files

- `manifest.json`: Manifest V3 configuration for "CopyPaste Orchestrator", tab/scripting/download/storage permissions, ChatGPT/Claude host permissions, explicit local WebSocket CSP, and background service worker registration.
- `background.js`: Resilient WebSocket client and manual state machine. Maintains `nextTarget`, reconnects to Electron, receives `{ chatgptPrefix, claudePrefix, text }` plus optional AI Project Builder metadata such as `targetProvider`, focuses the selected tab, injects `content.js` into the main page frame, sends `WRITE_AND_SEND`, sends one main-frame `READ_RESPONSE`, and returns `{ text }` to Electron.
- `content.js`: Universal dynamic DOM interaction engine injected into ChatGPT or Claude. Handles framework-resilient text insertion, send-button hardware event simulation, Enter fallback, generation completion polling, Claude/ChatGPT response extraction, reasoning-placeholder bypass, stale-output filtering, and sanitization.
- `popup.html`: Legacy popup UI file from the previous extension-controlled workflow. It is not registered by the current manifest and is inactive.
- `popup.js`: Legacy popup controller from the previous extension-controlled workflow. It is not registered by the current manifest and is inactive.
- `background.test.js`: Node regression coverage for the WebSocket manual state machine and ChatGPT/Claude target toggling.
- `content.test.js`: Node regression coverage for prompt insertion/submission and response extraction filtering.
- `codex.md`: Codex implementation progress log.

## Runtime State

- `socket`: Active WebSocket connection to Electron at `ws://localhost:8080`.
- `heartbeatTimer`: 25-second WebSocket heartbeat used to keep the MV3 service worker connection active and expose silent drops.
- `nextTarget`: Current manual destination. Defaults to `chatgpt`, then toggles between `chatgpt` and `claude` after a successful legacy step. When Electron sends an explicit `targetProvider`, that provider is used for the current step without rewriting stored target memory.
- `chrome.storage.local.nextTarget`: Persistent copy of the next destination so service-worker restarts preserve workflow direction.

## Manual Flow

1. Electron UI sends `TRIGGER_AI_WORKFLOW` with `{ chatgptPrefix, claudePrefix, text }`; AI Project Builder may also include `targetProvider`, `currentStageId`, `currentStageLabel`, and `currentRole`.
2. Electron main process stringifies the payload and sends it through WebSocket.
3. Extension `background.js` receives the command and reads `nextTarget`.
4. Background rejects empty combined payloads instead of inventing fallback content.
5. If `targetProvider` is `chatgpt` or `claude`, it uses that provider for the current step. Otherwise it falls back to stored `nextTarget`.
6. If the target is ChatGPT, it combines `chatgptPrefix + text`; if Claude, it combines `claudePrefix + text`.
7. Background focuses the matching tab in the current window and injects `content.js`.
8. Background sends `WRITE_AND_SEND` with the combined prompt.
9. Background sends `READ_RESPONSE` with the source prompt and previous-output snapshot to avoid stale extraction.
10. `content.js` waits for generation completion, extracts the latest valid assistant output, sanitizes it, and returns it.
11. Background toggles and persists `nextTarget` only for legacy payloads without explicit `targetProvider`, then sends `{ ok: true, target, nextTarget, text }` back to Electron.
12. Electron updates the UI and waits for the next manual user action.

## Tech

- Chrome Extension Manifest V3
- Chrome APIs: `tabs`, `scripting`, `activeTab`, `downloads`, `storage`
- Host permissions include ChatGPT and Claude only. The extension does not request `claudeusercontent.com` and does not inject into all frames; Claude widget/card artifacts are avoided primarily through clean-output prompt instructions from the Electron app.
- WebSocket client: browser-native `WebSocket`
- Extension CSP: `connect-src ws://localhost:8080 http://localhost:8080` for the local Electron bridge.
- Reconnect behavior: dropped connections schedule `connectToElectron()` after 5000ms and restart the heartbeat after `onopen`.
- Plain JavaScript, HTML, and CSS
- DOM APIs: `document.execCommand`, `InputEvent`, `PointerEvent`, `MouseEvent`, `KeyboardEvent`
- Claude submit path uses DOM-only composer insertion plus scoped Send-button detection. The observed Send control is `button[aria-label="Send message"]`, appears only after composer text exists, and is clicked via a center-point pointer/mouse sequence. Claude does not use the generic SVG-button fallback because that can match microphone/voice controls; controls labelled like `Press and hold to record` are explicitly blocked. If no explicit Send/Submit button is found, the content script falls back to Enter.
- Claude response completion does not require Send to remain visible; it waits for Stop to disappear and latest `.font-claude-response` text to stabilize. Because Claude can split one answer across multiple `.font-claude-response` blocks, extraction combines the latest Claude response block group before returning text to Electron.
- Claude structured critique widgets are not targeted through extra host permissions. The content script may sanitize widget chrome visible in the main page, but background execution stays main-frame-only.
- ChatGPT response completion also no longer requires the Send button to be active after the prompt is submitted; empty composers can hide or disable Send even when generation has finished. Completion is based on Stop controls disappearing plus latest response text stabilization.
- Each step snapshots the previous latest output before sending so `READ_RESPONSE` can ignore stale Claude text and return only a new response.

## Monorepo Location

As of 2026-05-25, this extension lives under `apps/extension` inside the `F:\Projects\CopyPaste` monorepo. The Electron controller lives under `apps/desktop`, and shared workflow protocol code lives under `packages/protocol`.

## 2026-05-25 Handoff Audit Notes

- Current repository shape is a small Chrome extension component, not a standalone product. The active runtime is `manifest.json` -> `background.js` -> dynamic injection of `content.js`.
- The current controller UI is external: `F:\Projects\Next Step` runs an Electron app and a `ws://localhost:8080` WebSocket server. This extension requires that controller to be running for normal operation.
- `popup.html` and `popup.js` remain in the repo but are not registered in `manifest.json`; they are legacy/inactive unless a future release restores a manifest `action.default_popup` and matching background runtime message handlers.
- There is no local package manager metadata in this repo. Verification is currently direct Node execution: `node --check background.js`, `node --check content.js`, `node --check popup.js`, and `node --test background.test.js content.test.js`.
- There is no in-repo README, setup guide, CI config, deployment/release checklist, or browser-level integration test. These are release-readiness gaps rather than runtime architecture pieces.
- The highest-risk runtime surfaces are the DOM selector heuristics in `content.js`, the local WebSocket contract with Electron, and extension lifecycle behavior under Manifest V3 service-worker suspension/reconnect scenarios.
