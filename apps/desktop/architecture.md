# NextStep Architecture X-Ray

Tech stack:
- Electron main process + preload bridge
- Vanilla JS renderer (event delegation, single app root listeners)
- Local JSON persistence (`app.getPath("userData")/nextstep-db.json`)
- Playwright persistent browser context (visible Chrome/Edge, no stealth)
- Local WebSocket server (`ws`) on `ws://localhost:8080` for Chrome extension orchestration

Core folders:
- Root Electron controller files:
  - `package.json`: Electron app scripts and runtime dependencies, including `ws`.
  - `main.js`: lightweight Electron main process for the CopyPaste orchestration bridge.
- `prompt-vault.js`: local Project/Prompt Pack database, task-based Codex handoff generator, and Markdown export writer. It still stores generated tasks in the internal `chunks` array for backwards compatibility.
  - `index.html`: standalone local controller UI loaded by root `main.js`.
  - `renderer.js`: standalone controller frontend logic that sends workflow payloads and receives AI responses.
- `main/`
: Electron main runtime, storage, browser context, provider execution.
- `main/providers/`
: Selector config + ChatGPT provider + provider utilities.
- `../../packages/protocol/`
: Pure shared protocol package that can be loaded by Node tests and the renderer without Electron APIs.
- `renderer/`
: UI render/state/prompt/parser logic.
- `tests/`
: Node-based regression tests for pure state, storage migration, and prompt generation.
- `docs/`
: architecture, provider notes, risk notice, manual test plan.

Main process modules:
- `main/main.js`: window lifecycle, IPC for storage/AI/browser/selectors/clipboard.
- `main/storage.js`: default state, migration, sanitization, atomic save, import backup.
- `main/ai-runner.js`: run lock, cancel flow, retry extraction, status events.
- `main/debate-runner.js`: best-effort debate round automation adapter; ChatGPT uses the visible browser provider, unsupported providers stay manual.
- `main/browser-context.js`: detect Chrome/Edge, launch persistent context, close registry.
- `main/debug-artifacts.js`: local-only debug artifacts on failure.

Renderer modules:
- `../../packages/protocol/index.js`: AI Project Builder provider registry, ordered debate workflow steps, and critique decision model.
- `renderer/state.js`: project/task CRUD, plan finalization helpers.
- `renderer/prompts.js`: mega-prompt + codex-step prompt generation.
- `renderer/debate-prompts.js`: research, plan, critique, improve, consensus, and final Codex stage prompt generation.
- `renderer/parser.js`: robust JSON extraction/validation/normalization.
- `renderer/render.js`: Debate Lab, kanban + task workflow UI, settings/logs.
- `renderer/renderer.js`: app orchestration, delegated events, debate actions, persistence.
- `tests/run-tests.js`: simple aggregate test runner.
- `tests/state-debate.test.js`: debate state API coverage.
- `tests/debate-prompts.test.js`: prompt generation and final stage pack coverage.
- `tests/storage-debate.test.js`: debate migration/sanitize coverage.

Security boundaries:
- Renderer has no direct Node access.
- Preload exposes minimal explicit APIs.
- Clipboard reads happen only on user action.

Current MVP workflow:
- Clarification -> Run AI -> Parse plan -> Flaw decisions -> Finalize -> Codex step picker -> Done.

AI Project Builder protocol:
- The app concept is moving from Next Step Controller / Prompt Vault toward AI Project Builder.
- The first implementation is a pure workflow/protocol layer, not the full UI.
- Provider registry:
  - `chatgpt`: active, enabled, validated OpenAI provider.
  - `claude`: active, enabled, validated Anthropic provider.
  - `gemini`: present in metadata, disabled, coming later.
  - `grok`: present in metadata, disabled, coming later.
- Debate workflow order:
  1. Idea
  2. GPT Clarifier
  3. GPT Planner
  4. Claude Critic
  5. GPT Rebuttal
  6. GPT Revised Plan
  7. Claude Final Review
  8. GPT Final Synthesis
  9. Codex Prompt Forge
  10. Claude Prompt QA
  11. GPT Prompt Polish
- Claude critique items are normalized separately from GPT rebuttal decisions.
- Critique item decisions are exactly `accept`, `reject`, or `needs_user_decision`; GPT can reject Claude critique items with a recorded reason.
- Persistent debate/project-builder state uses the existing `debates[]` storage path for backward compatibility.
- Project-builder debate records persist `raw_idea`, `current_stage_id`, `current_stage_index`, `status`, `human_gated`, provider metadata, workflow steps, rounds, critique items, timestamps, and legacy Debate Lab fields.
- Round records persist `stage_id`, `stage_label`, `provider`, `role`, `status`, `prompt_sent`, `response_received`, `sent_at`, `received_at`, `created_at`, and `updated_at`, while keeping old `prompt`, `response`, `type`, and `participant_id` aliases.
- The next prompt helper is pure and side-effect free: it creates the prompt for the current stage without appending a round or advancing state.
- Every generated debate prompt includes clean-output rules for ChatGPT and Claude: plain text only, simple Markdown headings/bullets only, and no artifacts, widgets, cards, tables, diagrams, interactive views, HTML, CSS, or custom UI formatting.
- The workflow is human-gated. The app can prepare the next prompt, but the user must click the next send/save/advance action; no infinite auto-looping is part of the protocol.

CopyPaste Orchestrator bridge:
- Root `main.js` starts a dedicated `WebSocketServer` on port `8080`.
- The active Chrome extension connection is stored as `extensionSocket`.
- Renderer UI sends `TRIGGER_AI_WORKFLOW` through Electron IPC with `{ chatgptPrefix, claudePrefix, text, targetProvider, currentStageId, currentStageLabel, currentRole }`.
- For AI Project Builder, `renderer.js` creates the current stage-specific prompt from `../../packages/protocol`, stores the pending stage locally, and sends that prompt as `text`.
- `targetProvider` is `chatgpt` or `claude`; Gemini and Grok remain metadata-only and are never sent for execution.
- Main process validates the socket state and forwards the JSON payload to the extension.
- Extension returns `{ text }` over WebSocket after the selected AI tab completes generation.
- Main process forwards the returned text to the UI using `AI_RESPONSE_RECEIVED`; the renderer saves it as the current debate round, advances to the next protocol stage, and refreshes current stage/provider/next provider/round history.
- Main process forwards connection, heartbeat, next-target, and error state to the UI using `WORKFLOW_STATUS`; these messages update the top status bar and never overwrite the staged AI text.
- Root `index.html`/`renderer.js` form the manual step controller for this bridge. The process is user-gated and does not run an automatic loop.
- Extension connection control messages (`EXTENSION_CONNECTED`, `EXTENSION_HEARTBEAT`) are logged by the main process and filtered out of response rendering.
- The root controller UI exposes collapsed ChatGPT/Claude prefix dropdowns, a project idea/working plan editor, a visible `Next target` pill, current stage/current provider/next provider fields, round history, and a top Chrome-extension connection pill.
- The latest Project Plan display is presentation-only: renderer keeps the raw AI response in the working plan/state, then uses a safe lightweight escaped renderer to show readable headings, numbered sections, bullets, and compact round previews.

Prompt Vault workflow:
- Renderer keeps a manual project form with project name, project path, and pack title visible; strategy, fallback task count, git mode, branch name, and fallback commit settings live in collapsed advanced settings.
- Main process stores vault state in `app.getPath("userData")/prompt-vault-db.json`.
- `prompt-vault.js` exports every pack into `<ProjectPath>/codex-plans/<pack-slug>/`.
- `prompt-vault.js` first checks whether the final AI output is a structured debate plan JSON with `implementation_stages`. When present, those stages become the Codex task list. If no structured plan is found, the existing numbered/bullet/heading extraction and fallback tasks are used so older prompt flows keep working.
- Each export contains:
  - `master-plan.md`: shared context and execution order for every Codex chat.
  - `final-text.md`: raw final AI output from the ChatGPT/Claude ping-pong workflow.
  - `metadata.json`: structured project, pack, task/chunk, branch, commit message, and git action data.
  - `codex-###-*.md`: task-scoped Codex execution prompts.
- Prompt Packs now present as tasks in the UI. Each generated task has a 001-style order, commit-style title, short description/scope, persistent status, `gitAction`, and `commitMessage`; structured final plans commonly produce `001`, `002`, and `003` from the final debate plan stages.
- Internal records are still named `chunks` and existing `VAULT_*CHUNK*` / `VAULT_COPY_LAUNCHER` IPC names remain for backwards compatibility.
- Default Git behavior is commit per task: generated tasks default to `Git action: commit_and_push`, and each task's commit message defaults to its task title.
- Existing old packs without per-task `commitMessage` sanitize with `commitMessage` falling back to the task title.
- Renderer shows only the latest pack in the main Prompt Vault area. Older packs are summarized under collapsed History.
- Renderer hides filenames and full-prompt copy from the main task rows; the primary visible task action is `Copy Codex Start`.
- `Copy Codex Start` writes concise launcher text to the clipboard, marks the task `launcher_copied`, persists that status, and renders it as `Copied`.
- Prompt Pack deletion is DB-only: confirm-protected UI actions call `VAULT_DELETE_PACK`, remove the pack from `prompt-vault-db.json`, refresh renderer state, and intentionally leave exported files on disk.
- Saved project records persist repo path, Git remote, default branch, branch prefix, preferred Git mode, preferred task strategy, fallback task count, and commit fallback.

Debate Lab workflow:
- Create Debate -> Generate research/plan/critique/improve/consensus prompts.
- Copy/paste or run a visible ChatGPT round where supported; Claude/unsupported providers fall back to manual.
- Save every response into `debates[].rounds`.
- Parse consensus JSON into `debates[].consensus`.
- Generate final per-stage Codex MegaPrompts with checklist state and project pack JSON export.

State model:
- Root state keeps legacy `projects`, `tasks`, `active_project_id`, and `active_task_id`.
- Root state now also keeps `debates: []` and `active_debate_id: null`.
- Debate records contain title, raw idea, current project-builder stage, goal, participants, rounds, research summary, consensus, final megaprompts, logs, and timestamps.
- Round records contain stage, provider, role, status, sent prompt, received response, parse status, parsed data, errors, and timestamps.
- Old debate DB rows without project-builder fields migrate on load; old Prompt Vault packs still load through internal `chunks` fields while UI copy keeps using task/prompt language.
