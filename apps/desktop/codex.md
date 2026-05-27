# Codex Progress

Planning workflow repair:
- Added regression coverage for master-plan and roadmap file mirroring in `prompt-vault.test.js`.
- Added UI regression coverage for the reduced Plan action row and `getPlanPrimaryAction()` labels.
- Prompt Vault now writes applied planning state back to `masterplan.md`, `plan-roadmap.md`, and roadmap task files.
- Existing projects with DB roadmaps and scaffold-only roadmap files are repaired during vault state load.
- The active Plan UI now shows `Save Draft` and one stage-aware primary action instead of multiple competing planning buttons.
- Verified with `npm.cmd run desktop:test` and root `npm.cmd run verify`.

Completed baseline:
- Electron shell + preload bridge + vanilla renderer.
- Local JSON persistence with migration/sanitize + startup recovery.
- Prompt generation, parser, flaw workflow, plan finalization, codex step picker.
- Browser context and ChatGPT provider flow with visible real browser.

Latest hardening update:
- Export/import via Electron file dialogs.
- Import validation + migration/sanitize via storage import.
- Cancel AI run flow (runner flag + context close + status update).
- Retry run and retry extraction actions.
- Settings MVP controls:
  - provider, AI timeout, login timeout,
  - keep browser open,
  - save failure screenshots,
  - local metrics,
  - browser channel preference.
- Metrics tracking and readable logs.
- Risk notice displayed in settings.
- Manual test checklist added in `docs/manual-test-plan.md`.

Open follow-up:
- Full real-time provider response reliability tuning on dynamic ChatGPT UI changes.

MegaPrompt 07-12 implementation:
- Added root debate state (`debates`, `active_debate_id`) and debate helpers in `renderer/state.js`.
- Added storage migration/sanitize support for old DBs without debate fields.
- Added `renderer/debate-prompts.js` and exposed `window.NextStepDebatePrompts`.
- Added Debate Lab UI before the legacy task board while keeping the old task workflow intact.
- Wired delegated debate actions for prompt generation, clipboard copy/paste, response saving, consensus parsing, final MegaPrompt generation, stage completion, and project pack JSON export.
- Added best-effort debate browser runner IPC with visible ChatGPT automation and manual fallback for unsupported providers.
- Added Node regression tests for debate state, prompt generation, and storage migration.

Verification notes:
- Use `npm.cmd test` on Windows PowerShell because `npm.ps1` can be blocked by execution policy.

CopyPaste WebSocket orchestrator integration:
- Added root `package.json` support for the standalone Electron controller entrypoint and `ws` dependency.
- Added root `main.js` that starts a WebSocket server on port `8080`, tracks the active extension socket, receives `TRIGGER_AI_WORKFLOW` over IPC, forwards payloads to the extension, and relays returned AI text to the renderer via `AI_RESPONSE_RECEIVED`.
- Added root `index.html` and `renderer.js` for a minimal desktop controller UI with ChatGPT prefix, Claude prefix, current text, trigger action, save action, connection status, and response display.
- Updated `package-lock.json` with the `ws` package resolution.
- Hardened WebSocket handling by filtering extension readiness/heartbeat control messages and surfacing extension errors without overwriting the response area with empty payloads.
- Split renderer communication into `WORKFLOW_STATUS` for connection/error UI state and `AI_RESPONSE_RECEIVED` for actual AI text, preventing status strings from becoming the next staged prompt.
- Verified root Electron controller syntax with `node --check main.js` and `node --check renderer.js`.
- Verified existing Electron regression tests with `npm.cmd test`.

Prompt Vault implementation:
- Added `prompt-vault.js` as the root Electron Prompt Vault module.
- Added project-specific Prompt Pack generation with exported files under `<ProjectPath>/codex-plans/<pack-slug>/`.
- Added project path validation so packs export only into an existing project directory.
- Generated exports include `master-plan.md`, `final-text.md`, `metadata.json`, and numbered `codex-###-*.md` execution prompts.
- Added Git mode support:
  - `none`: all chunks say not to commit or push.
  - `final_only`: only the final chunk says to commit locally and push online.
  - `every_chunk`: every chunk says to commit locally and push online.
- Added Electron IPC handlers for vault state, pack generation, chunk copy, chunk status updates, and opening pack folders.
- Extended root `index.html` and `renderer.js` with Prompt Vault controls and pack/chunk lists.
- Added `tests/prompt-vault.test.js` and included it in `tests/run-tests.js`.
- Saved implementation plan at `docs/superpowers/plans/2026-05-19-prompt-vault.md`.
- Verified with `node --check prompt-vault.js`, `node --check main.js`, `node --check renderer.js`, and `npm.cmd test`.

Prompt Vault phase 2:
- Added smarter chunk strategies:
  - `simple_3`
  - `steps_1_3`
  - `architecture_implementation_tests_release`
- Added source task extraction from numbered, bullet, and heading-style final text.
- Generated chunks now carry distinct `tasks` and scoped instructions instead of repeating the same generic prompt shape.
- Added Codex launcher generation per chunk and exported `codex-###-*-launcher.txt` files next to full prompts.
- Added `VAULT_COPY_LAUNCHER` IPC and renderer `Copy Launcher` buttons.
- Added saved project selector and persisted per-project defaults for path, Git remote, default branch, branch prefix, preferred Git mode, preferred chunk strategy, chunk count, and commit message.
- Updated `tests/prompt-vault.test.js` to verify task extraction, launcher generation, chunk strategy, project defaults, and final `commit_and_push` behavior.
- Verified with `node --check prompt-vault.js`, `node --check main.js`, `node --check renderer.js`, and `npm.cmd test`.

Prompt Vault UI cleanup:
- Restyled Prompt Vault chunk copy actions with an explicit `.copy-btn` class so `Copy Launcher` and `Copy Full Prompt` no longer look disabled while remaining clickable.
- Verified with `node --check renderer.js` and `npm.cmd test`.

Prompt Vault task handoff refactor:
- Refactored generated Prompt Packs so visible work units are task-based Codex handoffs with commit-style task names, task descriptions, per-task `commitMessage`, and default `commit_and_push` behavior.
- Kept the existing internal `chunks` array and IPC names for database/API compatibility, but changed generated copy and UI language to tasks.
- Updated launcher text to say `Copy Codex Start` in the UI and to copy concise instructions that read `master-plan.md`, `architecture.md`, and `codex.md`, execute only the selected numbered task, use that task's commit message, and obey its git action.
- Updated launcher-copy persistence so `launcher_copied` continues to be stored and now renders as `Copied`.
- Reworked the Prompt Vault UI to show only the latest pack in the main area, hide older packs behind collapsed History, hide full-prompt copy from the main task rows, hide filenames from the main task rows, and collapse advanced settings.
- Updated Electron status messages to use task/Codex Start language instead of filename/launcher wording.
- Added regression coverage for commit-style task names, default per-task `commit_and_push`, task commit messages, launcher content, launcher-copy status, UI status-label mapping, fallback task names, and old-pack commit-message fallback.
- Verified with `node --check prompt-vault.js`, `node --check renderer.js`, `node --check main.js`, and `npm.cmd test`.

Prompt Vault pack deletion:
- Added DB-only Prompt Pack deletion via `deletePromptPack`, preserving exported files under `codex-plans`.
- Added `VAULT_DELETE_PACK` IPC and renderer delete handling.
- Added confirm-protected Delete buttons for the latest pack and each collapsed History pack.
- Added regression coverage that deleting a pack removes it from Prompt Vault state while leaving the exported folder on disk.
- Verified with `node --check prompt-vault.js`, `node --check renderer.js`, `node --check main.js`, and `npm.cmd test`.

Final debate plan Codex task generation:
- Added structured final-plan parsing in `prompt-vault.js` for JSON debate outputs with `implementation_stages`.
- Final project plans now generate ordered Codex tasks directly from debate stages: `001`, `002`, `003`, each with a commit-style task name, description/scope, status, `gitAction`, and `commitMessage`.
- Generated tasks continue to default to `commit_and_push`, with `commitMessage` equal to the task name.
- Kept old prompt pack compatibility: line-based final text still generates tasks, fallback tasks still work, and old packs without `commitMessage` still load with the title as the commit message.
- Kept main UI behavior aligned with AI Project Builder handoff rules: latest prompt set only in the main area, older sets under collapsed History, filenames hidden from main UI, `Copy Codex Start` as the visible primary action, and DB-only delete actions.
- Added regression coverage for structured final debate plans and old prompt packs without `commitMessage`.

Controller UI reference polish:
- Restyled the root Electron controller toward the provided reference: app title strip, top connection bar, cleaner cards, larger default window, and stronger button styling.
- Added a top connection pill that renders connected/waiting states and a readiness message without overwriting staged AI text.
- Added `nextTarget` propagation from extension connected/heartbeat messages and a visible `Next target: ChatGPT/Claude` pill in the workflow card.
- Changed ChatGPT and Claude prefix textareas into collapsed dropdown sections under the staged text editor.
- Added a lightweight editor toolbar and live word count for the staged text area.
- Added pure renderer status-view tests in `tests/controller-ui.test.js`.
- Verified with `node --check renderer.js`, `node --check main.js`, `npm.cmd test`, and a Playwright Electron smoke screenshot at `%TEMP%\next-step-ui-check-wide.png`.

AI Project Builder protocol layer:
- Added `shared/ai-project-builder-protocol.js` as a pure testable model for the new app concept.
- Registered ChatGPT and Claude as active, enabled, validated providers.
- Added Gemini and Grok to provider metadata as disabled `coming_later` providers.
- Defined the ordered workflow: Idea -> GPT Clarifier -> GPT Planner -> Claude Critic -> GPT Rebuttal -> GPT Revised Plan -> Claude Final Review -> GPT Final Synthesis -> Codex Prompt Forge -> Claude Prompt QA -> GPT Prompt Polish.
- Added critique item normalization with `accept`, `reject`, and `needs_user_decision`; GPT rebuttal decisions can reject Claude critique items with a reason.
- Loaded the shared protocol in the renderer bundle for future UI work without changing existing WebSocket or Prompt Vault behavior.
- Added `tests/ai-project-builder-protocol.test.js` and included it in `tests/run-tests.js`.

Persistent AI Project Builder state:
- Extended the shared protocol with helpers to create project-builder debates, create the next stage prompt, save sent/received rounds, and advance one stage at a time.
- Debate records now persist raw idea, current stage, human-gated flags, provider metadata, workflow steps, rounds, critique items, and timestamps.
- Round records now persist stage, provider, role, status, prompt sent, response received, sent/received timestamps, and legacy prompt/response aliases for existing UI compatibility.
- Updated storage migration so old `debates[]` rows load into the richer project-builder shape without losing old `prompt`/`response` data.
- Kept Prompt Vault internal `chunks` compatibility unchanged; existing old-pack coverage remains in `tests/prompt-vault.test.js`.
- Updated renderer debate creation to include project-builder metadata while preserving old Debate Lab fields and behavior.
- Added/extended tests for debate creation, stage prompt generation, round saving, stage advancement, and old DB shape migration.

Root AI Project Builder UI redesign:
- Reworked root `index.html` from the old controller layout into a clean AI Project Builder surface with four visible sections: Idea, AI Debate, Project Plan, and Codex Prompts.
- Kept the top connection pill and next-target display, with simplified `Connected` / `Waiting for extension` wording.
- Replaced `Current staged text` with `Project idea / Working plan` and removed the fake formatting toolbar.
- Kept ChatGPT and Claude prefixes as compact dropdowns.
- Added disabled future-provider chips for Gemini and Grok.
- Made new project fields start empty; only advanced git defaults remain prefilled.
- Renamed the primary Prompt Vault action to `Generate Codex Prompts` and cleaned user-facing copy from pack/chunk language toward prompt/task language while preserving internal `chunks` compatibility.
- Removed fake Help/Settings buttons from the root UI.
- Added renderer helper tests for status rendering, provider display metadata, empty project defaults, and required root UI copy.
- Verified with `node --check renderer.js`, `node --check main.js`, `node --check tests/controller-ui.test.js`, `npm.cmd test`, and a Playwright Electron smoke screenshot at `%TEMP%\ai-project-builder-root-v2.png`.

Root debate stage WebSocket wiring:
- Wired root `renderer.js` to create an in-memory AI Project Builder debate from the project idea, generate the current stage-specific prompt, and send it through the existing `TRIGGER_AI_WORKFLOW` IPC/WebSocket flow.
- Extended the workflow payload with `targetProvider`, `currentStageId`, `currentStageLabel`, and `currentRole` while preserving the existing `chatgptPrefix`, `claudePrefix`, and `text` fields.
- Updated root `main.js` to forward the new metadata fields to the extension.
- On `AI_RESPONSE_RECEIVED`, root `renderer.js` now saves the response as the current debate round, advances the protocol stage, updates the working plan, and refreshes current stage/current provider/next provider/round history.
- Added current stage, current provider, next provider, and round history UI in root `index.html`.
- Added controller helper tests for stage payload creation, response handling, provider advancement, and round history view data.
- The CopyPaste extension contract was a real blocker because persisted target toggling would route GPT Planner to Claude; extension `background.js` now honors explicit `targetProvider` while keeping legacy toggling for old payloads.
- Verified with `node --check renderer.js`, `node --check main.js`, `node --check tests/controller-ui.test.js`, `npm.cmd test`, extension `node --check background.js`, extension `node --check background.test.js`, extension `node background.test.js`, and a Playwright Electron smoke screenshot at `%TEMP%\ai-project-builder-stages.png`.

AI Project Builder final polish:
- Added controller UI regression checks for the final visible-language rules: no visible `chunks`, no `Copy Launcher`, no `Generate Codex Pack`, disabled Gemini/Grok future-provider copy, and collapsed advanced settings helper text.
- Rechecked the rendered Electron root screen: AI Project Builder title, waiting/connected pill area, `Next target: ChatGPT`, active ChatGPT/Claude provider chips, disabled Gemini/Grok future chips, enabled primary buttons, collapsed advanced settings, collapsed prompt history, and no stale Prompt Vault labels.
- Confirmed the existing Electron WebSocket flow remains wired through `TRIGGER_AI_WORKFLOW`, `WORKFLOW_STATUS`, and `AI_RESPONSE_RECEIVED`; a fake extension socket received the `GPT Clarifier` payload for ChatGPT, returned text, and the renderer saved it in round history before advancing to `GPT Planner`.
- No Chrome extension changes were made in this pass.
- Verification run:
  - `node --check prompt-vault.js`
  - `node --check renderer.js`
  - `node --check main.js`
  - `npm.cmd test`
- Additional smoke checks:
  - Launched Electron with Playwright and verified visible UI state plus screenshot evidence at `%TEMP%\ai-project-builder-final-polish.png`.
  - Connected a local WebSocket client to `ws://localhost:8080`, clicked `Send Next Debate Step`, verified outbound provider/stage metadata, sent a fake AI response, and verified rendered response, readable round history, and next-stage/provider advancement.

Project Plan readability fix:
- Increased the root `Project Plan` response area from a fixed 520px cap to a viewport-aware height and kept it independently scrollable.
- Added bottom padding, stable scrollbar gutter, hidden horizontal overflow, and `overflow-wrap: anywhere` so long AI output and long unbroken tokens remain readable inside the panel.
- Added controller UI regression checks for the new Project Plan scrolling/wrapping CSS.
- Verified with a Playwright Electron smoke check using 160 generated plan lines; the panel scrolled to the final line with `max-height: none` and `overflow-wrap: anywhere`.

Clean AI output prompt policy:
- Updated the default ChatGPT and Claude prefix text in `index.html` to request plain text only, simple Markdown headings/bullets only, and no artifacts, widgets, cards, tables, diagrams, interactive views, visualizations, HTML, CSS, or custom UI formatting.
- Added the same clean-output rules to `shared/ai-project-builder-protocol.js` so every stage-specific debate prompt carries the restriction even if the UI prefix is changed later.

## 2026-05-25

Monorepo migration note:
- This Electron app was copied into `F:\Projects\CopyPaste\apps\desktop` as part of the unified CopyPaste monorepo.
- The shared AI Project Builder protocol now lives at `F:\Projects\CopyPaste\packages\protocol`.
- Active imports in the copied app were updated to load the monorepo protocol package.
- The original `F:\Projects\Next Step` folder was left untouched.
- Added/kept controller and protocol regression checks for the plain-text prompt rules.

Project Plan readability polish:
- Replaced raw `textContent` display for the latest Project Plan with a safe lightweight HTML renderer that escapes input before presentation.
- The renderer strips top-level `Thinking` noise, preserves Claude-style breadcrumb lines as muted eyebrow text, renders a stronger title, separates headings and numbered risk headings, and converts bullet-like or compact Claude list lines into readable lists.
- Round history now uses a short cleaned preview instead of slicing raw response text.
- Added controller helper coverage for prelude cleanup, title/heading/list rendering, compact Claude responses without bullet markers, and HTML/script escaping.
- Verified with `node --check renderer.js`, `node --check main.js`, `npm.cmd test`, and a Playwright Electron smoke check that rendered the readable Project Plan sample and saved `%TEMP%\ai-project-builder-readable-plan.png`.

Active Electron runtime hardening:
- Added `tests/electron-security.test.js` to lock the package entrypoint runtime to preload, `contextIsolation: true`, and `nodeIntegration: false`.
- Confirmed the regression failed against the old root runtime before implementation.
- Updated root `main.js` to load `preload.js` and disable renderer Node integration for `index.html` / `renderer.js`.
- Extended `preload.js` with `window.copypasteDesktop` for workflow, Prompt Vault, and event subscription IPC, plus `window.copypasteProtocol` for AI Project Builder protocol helpers.
- Updated root `renderer.js` to use the preload APIs for workflow dispatch, Prompt Vault operations, and WebSocket/status event subscriptions.
- Kept the Prompt Vault handlers and channel names intact so existing vault state and UI actions continue to work.
- Verified with `npm.cmd --workspace next-step test` and root `npm.cmd run verify`.

WebSocket session handshake:
- Added `main/ws-session.js` for random session-token generation, token file writing, and authenticated WebSocket gatekeeping.
- Root `main.js` now writes `../extension/ws-session-token.json` on startup, waits for `EXTENSION_SESSION_HELLO`, and only then stores the socket as `extensionSocket`.
- Unauthenticated local WebSocket clients are rejected with close code `4401`; authenticated extension messages continue through the existing workflow/status handling.
- Added `tests/ws-session.test.js` and included it in the desktop runner.
- Verified with root `npm.cmd run verify`.
