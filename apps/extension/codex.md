# Codex Progress

## 2026-05-19

- Rebuilt the extension as a manual step-by-step workflow state machine:
  - `manifest.json` now includes `downloads`.
  - `popup.html` now exposes `chatgptPrefix`, `claudePrefix`, `currentText`, `status`, `nextBtn`, and `saveBtn`.
  - `popup.js` now loads state with `GET_STATE`, executes one step with `EXECUTE_NEXT_STEP`, and saves output with `TRIGGER_SAVE`.
  - `background.js` now maintains in-memory `stagedText = "mesaj de test"` and `nextTarget = "chatgpt"`, injects `content.js`, reads AI output, toggles target, and downloads `ai_final_output.txt`.
  - `content.js` remains a universal ChatGPT/Claude automation script with input insertion, hardware-like submit events, response polling, thought-placeholder filtering, and sanitization.
- Verified runtime file loading with Node.
- Hardened `content.js` submit reliability after manual testing feedback:
  - Removed generic icon-button matching from the main Send detection path.
  - Added explicit ChatGPT/Claude Send/Submit selectors.
  - Added ranked Send-button selection to avoid attach/voice/menu controls.
  - Added submit retry and verification before returning `WRITE_AND_SEND` success.
  - `WRITE_AND_SEND` now fails clearly if the prompt is inserted but submission never starts.
- Added Claude-specific ProseMirror handling in `content.js`:
  - Normalizes wrapper inputs to the nested `.ProseMirror[contenteditable='true']` editor.
  - Dispatches `beforeinput`, `execCommand("insertText")`, paste fallback, then `input`/`change`.
  - Falls back to `form.requestSubmit()`/submit event after Send-button click when Claude does not start generation.
- Added a Claude-only real-key fallback in `background.js` using `chrome.debugger` and `Input.dispatchKeyEvent` for Enter when DOM-level submit fails after text insertion. Added the `debugger` permission to `manifest.json`.
- Reworked Claude execution to always use `WRITE_ONLY` followed by a real Debugger Protocol Enter key event. Added `windows` permission and window focusing before tab activation so the Claude tab owns the key target.
- Removed `debugger`/`windows` permissions and the Debugger Protocol path after the visible Chrome debugging banner was deemed unacceptable.
- Restored Claude to a DOM-only `WRITE_AND_SEND` path with stronger Claude composer selectors, ProseMirror sync waiting, expanded Send selectors, mouseover/move/down/up/click sequence, and right/bottom-scored generic icon-button fallback.
- Updated Claude handling from DOM evidence:
  - Send button is `button[aria-label="Send message"]` and only appears after text exists.
  - Click dispatch now scrolls the button into view and sends pointer/mouse events at the button center with realistic button state.
  - Claude `READ_RESPONSE` no longer requires the Send button to be visible after submit; it waits for Stop to disappear and the latest response text to stabilize.
- Fixed Claude response forwarding:
  - `WRITE_AND_SEND` now snapshots the previous latest AI output before sending.
  - `background.js` passes `previousText` and `sourceText` into `READ_RESPONSE`.
  - `READ_RESPONSE` ignores the previous AI output and exact prompt echoes, then waits for a new stable Claude response before updating `stagedText`.
- Updated Claude extraction from DOM evidence:
  - Claude answer text lives in `.font-claude-response`, not `.font-claude-message`.
  - `extractLatestFinalAnswerText` now prefers `.font-claude-response` blocks before generic message containers.
- Fixed Claude microphone misclick:
  - Removed Claude access to the generic `button:has(svg)` submit fallback that could match the microphone button.
  - Claude now requires an explicit Send/Submit signal for button submission and otherwise falls back to Enter.
  - Added regression coverage proving an unlabeled SVG microphone button is not clicked during Claude submission.
  - Updated the blocker for Claude's inspected DOM where the microphone is `aria-label="Press and hold to record"` and the real submit button is `aria-label="Send message"`.
  - Added regression coverage proving the record button is ignored when a `Send message` button exists beside it.
- Fixed Claude response truncation:
  - Claude can render one answer as multiple `.font-claude-response` blocks.
  - `extractLatestFinalAnswerText` now combines the latest Claude response block group instead of returning only the last paragraph.
  - Added regression coverage for multi-block Claude critique responses so Electron receives the full response for Project Plan.
- Fixed Claude structured-widget extraction:
  - Added host permissions for `claudeusercontent.com` so the extension can inject into Claude's widget/artifact frames.
  - Background injection now targets all frames and `READ_RESPONSE` gathers readable text from every injected frame.
  - When multiple frames respond, the background returns the longest readable response, which captures structured critique cards instead of the shorter widget shell.
  - Content extraction now prioritizes `.crit-item` card text, scans accessible iframes, and filters widget chrome such as `Thought for 0s`, `Vvisualize`, `show_widget`, and view-transition CSS.
  - Added regression coverage for structured Claude critique cards and frame response selection.

- Rebuilt `manifest.json` as a strict Manifest V3 definition for CopyPaste with required permissions (`tabs`, `scripting`, `activeTab`) and host permissions for ChatGPT and Claude.
- Rebuilt `popup.html` into a minimal one-action UI containing `#startBtn` (`Start workflow`).
- Rebuilt `popup.js` with runtime-safe async messaging that sends `{ action: "START_LOOP", initialPrompt }` to the service worker and handles `chrome.runtime.lastError` / workflow errors.
- Reconstructed `background.js` as a robust async/await service-worker orchestrator:
  - Added Promise wrappers around `chrome.tabs.query`, `chrome.tabs.update`, `chrome.scripting.executeScript`, and `chrome.tabs.sendMessage`.
  - Added strict `chrome.runtime.lastError` checks for every critical API callback.
  - Implemented sequential `runWorkflow` pipeline: Faza 1 (ChatGPT write/send) -> monitoring (`READ_RESPONSE`) -> Faza 2 (Claude write/send).
  - Enforced current-window tab targeting and active-tab prioritization for both ChatGPT and Claude.
  - Injected `content.js` before each write/send dispatch to minimize dropped connections after SPA navigations.
- Rebuilt `content.js` as an environment-aware automation engine with IIFE + `window.hasExtensionRun` guard:
  - Added layered input resolution selectors for contenteditable and textarea fallbacks.
  - Implemented framework-safe insertion using `document.execCommand("insertText")` with native setter + composed/bubbling `input`/`change` fallback.
  - Implemented anti-block submission strategy with aggressive send-button selectors and full pointer/mouse sequence (`pointerdown` -> `mousedown` -> `pointerup` -> `mouseup` -> `click`).
  - Added Enter-key full hardware-like fallback sequence (`keydown`, `keypress`, `keyup`) when no usable send button is available.
  - Preserved robust `READ_RESPONSE` polling (1000ms cadence), stop/send completion guard, thought-placeholder bypass, and response sanitization.
- Updated `architecture.md` to reflect the production-ready MV3 orchestration design and reliability hardening choices.
- Performed syntax/load verification for `background.js`, `content.js`, and `popup.js`.
- Added transport hardening in `background.js`: retryable `tabs.sendMessage` with transient-error detection, reinjection-before-retry, and bounded backoff to survive runtime port drops.
- Improved `content.js` send targeting: de-duplicated multi-selector candidate collection, priority choice for explicit send/submit controls, and button-to-Enter fallback path if processing does not start.
- Fixed no-send condition by normalizing `#prompt-textarea p`/textbox hits to the real editable root, clearing stale content before injection, and forcing a final native `.click()` after pointer/mouse dispatch chain.
- Fixed the remaining no-send path by keeping the caret/selection inside the composer before `document.execCommand("insertText")`, waiting for a visible enabled Send/Submit button before submission, adding current ChatGPT/Claude submit selectors, and filtering non-send icon buttons such as attach/voice/menu controls.
- Updated `content.test.js` for the asynchronous submit pipeline and verified `node --test content.test.js` passes.
- Restored `background.js` test exports and updated `background.test.js` to match the current two-query ChatGPT/Claude pipeline, content-script reinjection before `READ_RESPONSE`, and Claude forwarding step. Verified `node --test background.test.js` passes.

- Converted CopyPaste into the browser-side WebSocket automation puppet for the Electron controller in `F:\Projects\Next Step`:
  - `manifest.json` now defines "CopyPaste Orchestrator" with `tabs`, `scripting`, `activeTab`, `downloads`, and `storage` permissions and no popup entry.
  - `manifest.json` now includes an explicit extension-pages `connect-src` policy for `ws://localhost:8080`.
  - `background.js` now connects to `ws://localhost:8080`, reconnects after drops, accepts one manual workflow payload at a time, chooses the next target from persistent state, injects `content.js`, writes/sends the prompt, reads the finished answer, toggles `nextTarget`, persists it, and returns `{ text }` to Electron.
  - `content.js` now serves as the universal dynamic DOM interaction engine for ChatGPT and Claude with IIFE guard, framework-resilient insertion, send-button hardware event chain, Enter fallback, 1000ms response polling, reasoning placeholder bypass, stale-output filtering, and sanitization.
- Left legacy `popup.html` and `popup.js` in place but inactive because the new manifest does not register a popup; Electron is now the controller UI.
- Fixed the WebSocket reconnect implementation by replacing the named IIFE with a real `connectToElectron()` declaration visible to the reconnect scheduler.
- Added a 25-second extension heartbeat message so the Electron server can observe the MV3 client and avoid silent idle drops.
- Fixed a runtime stall where ChatGPT could finish generating but `READ_RESPONSE` kept waiting for an active Send button. The completion guard now waits for Stop controls to disappear and then relies on stable latest-output text.
- Hardened reasoning prelude cleanup for variants such as `Thought for a couple of seconds` and fixed the `seconds` regex edge case.
- Updated `background.test.js` and `content.test.js` for the WebSocket orchestrator architecture and guarded Node imports from starting live WebSocket timers.
- Verified extension syntax with `node --check background.js` and `node --check content.js`.
- Verified extension regression tests with `node --test content.test.js background.test.js`.

- Removed the accidental dummy execution-pack fallback created from the test source brief `mesaj de test`:
  - Deleted the generated `codex-plans/copypaste-codex-execution-pack` folder.
  - Removed the `SOURCE_BRIEF_TEXT` fallback and `normalizeWorkflowCommand` test-only path from `background.js`.
  - Restored the architecture notes so empty payloads are rejected instead of converted into dummy content.

## 2026-05-20

- Added backward-compatible AI Project Builder target routing:
  - `background.js` now honors optional `targetProvider: "chatgpt" | "claude"` in Electron WebSocket payloads.
  - Legacy payloads without `targetProvider` still use and toggle persisted `nextTarget`.
  - Explicit provider payloads do not rewrite stored target memory, allowing Electron to control protocol order such as ChatGPT -> ChatGPT -> Claude.
- Added `background.test.js` coverage for explicit `targetProvider` routing.
- Verified with `node background.test.js`.

Conservative Claude automation rollback:
- Removed `claudeusercontent.com` host permissions from `manifest.json`.
- Reverted `background.js` content-script injection to the main tab frame only; removed all-frame response polling and longest-frame response selection.
- Kept the Claude anti-microphone send fix: record/mic controls remain blocked and Claude still requires an explicit Send/Submit button before button-click submission, with Enter as fallback.
- Rationale: the main app now asks ChatGPT and Claude for plain text/minimal Markdown, so the extension does not need broader hosted-widget access for the normal workflow.

WebSocket session handshake:
- `background.js` now loads the Electron-generated `ws-session-token.json` extension resource before announcing readiness.
- The first WebSocket payload is `EXTENSION_SESSION_HELLO` with the per-session token and current next target.
- If the token resource is missing or empty, the extension closes the socket with code `4401` and reconnects later.
- Added `background.test.js` coverage for successful token loading and missing-token failure.
- Verified through root `npm.cmd run verify`.

## 2026-05-25

Project takeover audit, no code changes:
- Inspected repo structure, tracked/untracked files, git status, recent commits, manifest, background service worker, content script, legacy popup files, regression tests, and existing docs.
- Verified there is no `package.json`, lockfile, README, `.env.example`, TypeScript config, bundler config, or `.github` CI directory in `F:\Projects\CopyPaste`.
- Confirmed the active architecture is the WebSocket-driven Chrome extension puppet for the external Electron controller in `F:\Projects\Next Step`.
- Confirmed `F:\Projects\Next Step` exists and exposes `ws://localhost:8080` plus `TRIGGER_AI_WORKFLOW` payloads with `chatgptPrefix`, `claudePrefix`, `text`, and `targetProvider`.
- Verified `popup.html`/`popup.js` are legacy/inactive in the current manifest and their runtime actions are not handled by `background.js`.
- Ran syntax checks: `node --check background.js`, `node --check content.js`, `node --check popup.js`; all passed.
- Ran regression tests: `node --test background.test.js content.test.js`; all 9 tests passed.
- Validated `manifest.json` parses as JSON with PowerShell `ConvertFrom-Json`.
- Noted release gaps: no setup documentation, no install/release checklist, no CI, no Chrome browser/manual test artifact, no packaged extension validation, and untracked execution-pack/text artifacts still present in the worktree.

Monorepo migration note:
- Extension files were moved from the repository root into `apps/extension`.
- The Electron controller was copied into `apps/desktop`.
- Root `architecture.md` and `codex.md` now describe the unified monorepo; this file preserves extension-specific history.
