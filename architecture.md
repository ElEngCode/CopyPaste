# CopyPaste Architecture

## Project X-Ray

CopyPaste is a minimal Chrome Extension using Manifest V3.

## Files

- `manifest.json`: Chrome extension manifest. Declares Manifest V3, extension metadata, popup entry, background service worker, and the `activeTab`, `scripting`, and `tabs` permissions.
- `popup.html`: Popup UI shown from the extension action. Contains one `startBtn` button and loads `popup.js`.
- `popup.js`: Popup-side script. Sends a `{ action: "START_LOOP" }` message to the extension runtime when `startBtn` is pressed.
- `background.js`: Manifest V3 background service worker. Listens for workflow start messages, finds the ChatGPT and Claude tabs, sends write/read messages, and forwards extracted text between tabs.
- `background.test.js`: Node test covering background tab discovery, write/read/forward message order, and `START_LOOP` listener behavior.
- `content.js`: Content-side utility code. Exposes `observeTypingFinished(selector, onTypingFinished)`, which observes DOM text changes and calls the callback after 2 seconds without new mutations. Also exposes `simulateReactTyping(selector, textToInsert)` for React-compatible textarea input simulation and `simulateHumanClick(selector)` for delayed button click simulation.
- `content.test.js`: Node test covering the content observer debounce behavior, React textarea typing simulation, and delayed mouse click simulation.
- `architecture.md`: Project structure and technical overview.
- `codex.md`: Work log maintained by Codex during the project.

## Tech

- Chrome Extension Manifest V3
- Plain HTML
- Plain JavaScript
- Chrome extension APIs: `chrome.runtime`, `chrome.runtime.onMessage`, `chrome.tabs.query`, `chrome.tabs.sendMessage`
- DOM APIs: `MutationObserver`, `document.querySelector`
- E2E input simulation APIs: native textarea value setter, `_valueTracker`, bubbling `input` and `change` events, bubbling `MouseEvent` click sequence
- Node.js built-in test runner for local behavior tests

## Message Flow

1. User opens the extension popup.
2. User presses the popup button.
3. `popup.js` calls `chrome.runtime.sendMessage`.
4. `background.js` receives the `{ action: "START_LOOP" }` message.
5. `background.js` starts the cross-tab workflow loop.

## Background Workflow Flow

1. `background.js` calls `chrome.tabs.query({})`.
2. It finds the first tab whose URL contains `chatgpt.com`.
3. It finds the first tab whose URL contains `claude.ai`.
4. It sends `{ action: "WRITE_AND_SEND", text: "mesaj de test" }` to the ChatGPT tab.
5. It sends `{ action: "READ_RESPONSE" }` to the ChatGPT tab and awaits the extracted text response.
6. It forwards that text to the Claude tab with `{ action: "WRITE_AND_SEND", text: extractedText }`.
7. The runtime message listener responds with `{ ok: true, result }` or `{ ok: false, error }`.

## Content Observer Flow

1. Code calls `observeTypingFinished(selector, onTypingFinished)`.
2. `content.js` finds the target container with `document.querySelector`.
3. `MutationObserver` listens for `childList`, `characterData`, and nested `subtree` changes.
4. Every mutation resets a 2 second debounce timer.
5. After 2 seconds without DOM changes, `content.js` extracts the final container text and calls `onTypingFinished(extractedText)`.

## React Typing Simulation Flow

1. Code calls `simulateReactTyping(selector, textToInsert)`.
2. `content.js` finds the target `<textarea>` with `document.querySelector`.
3. The function stores the previous textarea value.
4. The function writes the new value through the native `HTMLTextAreaElement.prototype.value` setter.
5. If React's `_valueTracker` exists, it is reset to the previous value so React sees the input as changed.
6. The function dispatches bubbling `input` and `change` events.

## Human Click Simulation Flow

1. Code calls `simulateHumanClick(selector)`.
2. `content.js` finds the target `<button>` with `document.querySelector`.
3. The function waits for a random delay between 400 ms and 900 ms.
4. The function dispatches bubbling, cancelable `mousedown`, `mouseup`, and `click` mouse events in order.
