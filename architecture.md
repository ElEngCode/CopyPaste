# CopyPaste Manual Workflow Architecture

## Project X-Ray

CopyPaste is a Manifest V3 Chrome extension for manual, step-by-step workflow automation between ChatGPT (`chatgpt.com`) and Claude (`claude.ai`). The popup controls each step. The background service worker keeps the current staged text and decides which target is next.

## Files

- `manifest.json`: Manifest V3 configuration, permissions, host permissions, popup entry, and background service worker.
- `popup.html`: Modern popup UI with ChatGPT prefix, Claude prefix, editable staged text, status, next-step button, and save button.
- `popup.js`: Popup controller. Loads background state, executes the next manual step, refreshes staged text, and triggers final text download.
- `background.js`: Manual state machine. Maintains `stagedText` and `nextTarget`, handles `GET_STATE`, `EXECUTE_NEXT_STEP`, and `TRIGGER_SAVE`, injects `content.js`, forwards text to the selected AI tab, reads the response, and toggles the next target.
- `content.js`: Universal automation script injected into ChatGPT or Claude. Writes text into the active composer, selects explicit Send/Submit controls, retries submission, verifies that generation started before returning success, polls for completion, extracts latest assistant output, filters reasoning placeholders, and sanitizes text.
- `codex.md`: Codex implementation progress log.

## Runtime State

- `stagedText`: Current editable payload. Defaults to `mesaj de test`.
- `nextTarget`: Current manual destination. Defaults to `chatgpt`, then toggles between `chatgpt` and `claude` after successful steps.
- `isExecuting`: Prevents double execution while a step is already running.

## Manual Flow

1. Popup opens and sends `GET_STATE`.
2. User edits prefixes and `currentText`.
3. User clicks `nextBtn`.
4. Popup sends `EXECUTE_NEXT_STEP` with the current prefixes and text.
5. Background combines the correct prefix with the staged text for the current target.
6. Background focuses the matching tab, injects `content.js`, sends `WRITE_AND_SEND`, then sends `READ_RESPONSE`.
7. Background stores the returned AI output as `stagedText`, toggles `nextTarget`, and returns the new state.
8. Popup refreshes `currentText`, status, and button label.
9. User can click `saveBtn` to download `ai_final_output.txt`.

## Tech

- Chrome Extension Manifest V3
- Chrome APIs: `runtime`, `tabs`, `scripting`, `downloads`
- Plain JavaScript, HTML, and CSS
- DOM APIs: `document.execCommand`, `InputEvent`, `PointerEvent`, `MouseEvent`, `KeyboardEvent`
- Claude submit path uses DOM-only composer insertion plus scoped Send-button detection. The observed Send control is `button[aria-label="Send message"]`, appears only after composer text exists, and is clicked via a center-point pointer/mouse sequence. Claude response completion does not require Send to remain visible; it waits for Stop to disappear and latest `.font-claude-response` text to stabilize. Each step snapshots the previous latest output before sending so `READ_RESPONSE` can ignore stale Claude text and return only a new response.
