# NextStep Architecture

NextStep is an Electron Windows desktop app with a strict process split:

- Main process (`main/main.js`): owns app lifecycle and window creation.
- Preload (`preload.js`): exposes a minimal safe bridge from Electron to renderer.
- Renderer (`renderer/*`): vanilla HTML/CSS/JS UI with no Node integration.

Current stack:
- Electron shell
- Vanilla renderer
- Playwright visible browser automation for ChatGPT-assisted planning rounds

Current file map:
- `main/main.js`
- `preload.js`
- `renderer/index.html`
- `renderer/styles.css`
- `renderer/renderer.js`
- `renderer/state.js`
- `renderer/render.js`
- `renderer/prompts.js`
- `renderer/debate-prompts.js`
- `renderer/parser.js`
- `main/storage.js`
- `main/ai-runner.js`
- `main/debate-runner.js`
- `main/browser-context.js`
- `tests/run-tests.js`
- `tests/state-debate.test.js`
- `tests/debate-prompts.test.js`
- `tests/storage-debate.test.js`
- `docs/provider-notes.md`
- `docs/risk-notice.md`

Debate Lab:
- Local state stores `debates` and `active_debate_id` alongside the existing task workflow.
- Debate prompts cover research, initial planning, critique, improvement, consensus JSON, and final Codex implementation stages.
- Browser automation is best effort only. ChatGPT uses a visible persistent browser profile; unsupported providers stay manual.
