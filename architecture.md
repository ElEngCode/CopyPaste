# CopyPaste Monorepo Architecture

## 2026-05-27 CI Path Portability Hotfix

- `apps/desktop/prompt-vault.js`
  - Replaced hardcoded default projects root (`F:\\Projects\\CopyPaste\\Projects`) with repo-relative default: `path.resolve(__dirname, "..", "..", "Projects")`.
  - Added `resolveProjectsBasePath(...)` to guarantee a creatable base path and gracefully fall back from stale machine-specific DB paths.
  - `syncProjectsFromFilesystem()` and `saveProject()` now persist the resolved usable base path before path-dependent operations.
- Result
  - `getState()` no longer crashes on CI runners without `F:` drive when old DB/default values reference Windows-local absolute paths.

## 2026-05-27 Workflow Repair Notes

- `apps/desktop/prompt-vault.js`
  - `createTaskPromptFromRoadmapItem()` now performs roadmap chunk creation and taskPrompt creation in one DB snapshot to preserve `promptPacks[].chunks`.
  - Task prompt content/version application also mirrors content back to the source chunk for legacy tree compatibility.
- `apps/desktop/renderer.js`
  - Task improve, approval, Codex handoff, and done actions now use taskPrompt IPC APIs instead of legacy chunk APIs.
  - Roadmap generation persists an AI response as a draft roadmap version; `applyRoadmapDraft()` applies it only after user action.
  - Primary action state now includes `apply_roadmap` for unapplied roadmap draft versions.
- Tests
  - `prompt-vault.test.js` verifies task prompt creation leaves its source chunk persisted.
  - `workflow-integration.test.js` verifies completing task 001 unlocks exact next item `roadmap_2`.
  - `controller-ui.test.js` guards renderer against reintroducing legacy task-action APIs.

## 2026-05-27 Task Prompt Versioning + Handoff Gate

- Protocol now provides `buildTaskImprovePrompt(...)` for deterministic AI task-improvement prompt generation.
- Prompt Vault now has first-class task prompt version lifecycle:
  - create proposed versions (`addTaskPromptVersion` / `saveTaskImproveResponse`)
  - apply historical/proposed versions (`applyTaskPromptVersion`)
  - list versions newest-first (`listTaskPromptVersions`)
- Codex handoff is now taskPrompt-based (`copyCodexHandoff`) and explicitly gated by `approved` status.
- Task completion path (`markTaskPromptDone`) persists run metadata and computes next roadmap-ready item.
- Desktop IPC/preload bridge includes dedicated task-prompt channels for versioning, improve preparation, approval, handoff copy, and completion.

## 2026-05-27 Roadmap + Task Prompt Hardening (Task 010-015 scope)

- Plan primary action now gates roadmap generation behind an applied master-plan version (`project.activeMasterPlanVersionId`), preventing roadmap prompts from being built from draft/editor-only text.
- Protocol roadmap contract is now exercised by tests for:
  - deterministic roadmap prompt generation from applied master plan
  - strict JSON/fenced-JSON response parsing
  - dependency validation failures (missing dependencies rejected).
- Prompt Vault task prompt generation from roadmap items now embeds execution-critical context directly in the generated prompt:
  - project name/path
  - master plan file path
  - roadmap dependencies
  - git guardrails
  - explicit strict single-task scope constraint.
- Task prompt filesystem sync remains stable-file-name based:
  - first creation assigns `tasks/task-###-slug.md`
  - subsequent content updates rewrite the same file path instead of renaming.

## 2026-05-27 Debate To Master Plan Versioning

- Final synthesis debate output is now persisted as a draft master-plan version, not auto-applied project state.
- Store API includes `createMasterPlanVersionFromDebate(workflowId, roundId)` with ownership and completion guards.
- Renderer calls this method when receiving a `gpt_final_synthesis` round response.
- UI exposes an explicit `Apply Master Plan` primary action when a draft master-plan version is available.
- Applying remains a separate user-controlled step and writes `masterplan.md` only after explicit apply.

## 2026-05-27 Staged Debate Runtime

- The legacy master-plan pingpong chain (automatic GPT->Claude->GPT within one response callback) is removed.
- Planning debate runtime now executes one stage per user action and persists each round before the next stage can be sent.
- Renderer no longer issues automatic cross-provider follow-up sends during `renderResponse`; stage advancement remains human-gated.
- This aligns runtime behavior with the official planning debate protocol and persistent workflow store.

## 2026-05-27 Official Planning Debate Contract

- Planning debate uses a strict protocol surface distinct from later post-plan prompt-forge stages.
- New protocol APIs for planning flow:
  - `listPlanningDebateStages`
  - `getPlanningDebateStage`
  - `getNextPlanningDebateStage`
  - `buildPlanningDebatePrompt`
- Active planning stage sequence is fixed to seven stages from clarifier through final synthesis.
- Prompt generation is deterministic and stage-aware, with required provider-role objective and expected output sections.
- Runtime now prefers planning-stage API in renderer stage selection to avoid accidental use of inactive/post-plan stages.

## 2026-05-27 Renderer Debate Source Of Truth

- Renderer no longer keeps mutable debate workflow state as the product source of truth.
- Debate stage/round UI now derives from persisted `debateWorkflows` inside Prompt Vault state snapshots.
- On project selection, renderer requests an active workflow and creates one if missing.
- Debate response handling is persisted through IPC store calls:
  - save round
  - advance workflow stage
  - rehydrate renderer from updated vault state
- This makes current stage and round history resilient across renderer refresh/reload.

## 2026-05-27 Debate Workflow Store API

- Prompt Vault now stores debate workflows as first-class persisted records under `debateWorkflows`.
- New store API methods:
  - `createDebateWorkflow(projectId)`
  - `getActiveDebateWorkflow(projectId)`
  - `getDebateWorkflow(workflowId)`
  - `saveDebateRound(workflowId, input)`
  - `advanceDebateWorkflow(workflowId)`
  - `completeDebateWorkflow(workflowId)`
- Round persistence includes stage id, provider, role, prompt text, response text, and timestamps.
- Stage advancement is explicit and human-gated: one call advances one stage; final stage transition marks workflow `complete`.
- Main-process IPC handlers and preload bridge now expose the debate workflow API for renderer use without local-only debate state.

## 2026-05-27 Schema v2 Baseline

- Prompt Vault DB now carries `schemaVersion: 2` as the canonical workflow schema marker.
- The DB root includes new workflow arrays:
  - `debateWorkflows`
  - `masterPlanVersions`
  - `roadmapVersions`
  - `taskPrompts`
  - `taskPromptVersions`
  - `taskRuns`
- Legacy `promptPacks` remains present for backward compatibility and staged migration.
- `sanitizeDatabase` performs non-destructive upgrades:
  - fills missing v2 arrays with empty arrays
  - preserves existing `projects`
  - preserves existing `promptPacks`
  - normalizes malformed non-array values back to arrays
- Entity-level sanitize helpers now define a stable persisted shape for debate rounds/workflows, master-plan versions, roadmap versions/items, task prompts/versions, and task runs.

## 2026-05-27 Verification Baseline

- Current baseline verification is the root workspace `npm.cmd run verify` command.
- The verify pipeline runs extension verification first, then desktop tests: `npm run extension:verify && npm run desktop:test`.
- Extension verification runs syntax checks for `background.js`, `content.js`, `popup.js`, and `wake.js`, followed by Node tests for `background.test.js` and `content.test.js`.
- Desktop verification runs `npm --workspace next-step test`, which executes the desktop test suite through `apps/desktop/tests/run-tests.js`.
- Task 002 did not require source or test changes because the baseline was already green locally after dependency install.

## 2026-05-27 Repository Hygiene

- `Projects/` is runtime/generated project output, not source code. The desktop app may create project folders there, including per-project `codex.md`, `architecture.md`, `masterplan.md`, `plan-roadmap.md`, and task files, but those folders are ignored by git.
- `artifacts/` is runtime/debug output, including browser profiles and diagnostic captures, and is ignored by git.
- Local token and DB files are ignored: `apps/extension/ws-session-token.json`, `prompt-vault-db.json`, `nextstep-db.json`, `nextstep-db.backup.json`, `nextstep-db.tmp`, and `*.corrupt-*.bak`.
- The tracked source tree is limited to app code, package/workspace files, tests, and documentation; generated project data is recreated or discovered by the app at runtime.

## 2026-05-26 Project History Documentation

- Added `PROJECT_HISTORY.md` as the human-readable project evolution record: original purpose, expected workflow, major evolution stages, current runtime, current data model, repository link, and active PR link.

## 2026-05-26 Planning Workflow File Sync + Ergonomic Primary Action

- Prompt Vault DB remains the canonical planning store, but applied planning state now mirrors back to project files:
  - applied master-plan versions write `<project>/masterplan.md`
  - applied roadmap versions write `<project>/plan-roadmap.md`
  - started roadmap tasks write `<project>/tasks/task-###-<slug>.md`
- `getState()` now backfills projects whose DB contains roadmap items while `plan-roadmap.md` is still only the scaffold.
- Project progress is recomputed after each mirrored write so `stage` / `nextAction` reflect filesystem reality instead of stale DB state.
- The Plan workspace action row is simplified to `Save Draft` plus one computed primary action.
- `getPlanPrimaryAction()` derives the visible action from the current project, master plan, roadmap, and task status:
  - `Create Master Plan`
  - `Create Task Roadmap`
  - `Create Task 001: <title>`
  - disabled `No Roadmap Tasks Ready`
- The old visible `Start Next Task` and endless visible `Improve Master Plan` controls are removed from the active UI.

## 2026-05-26 Master Plan Ping-Pong + Roadmap Execution

- The Plan workspace master-plan action now runs a three-step AI review loop:
  - ChatGPT creates or improves the master-plan draft.
  - Claude reviews that draft for flaws, missing assumptions, weak task order, test gaps, and risks.
  - ChatGPT revises the final master plan using Claude's critique.
- The renderer routes this loop through `activeWorkflowContext = "master_plan_pingpong"` and stores transient state in `drawerState.masterPlanPingPong`.
- Final master-plan output is written back to the `Master Plan` editor and saved as an `ai_master_plan_pingpong` master-plan version.
- `Create Task Roadmap` is now wired to the extension AI bridge. It sends the saved project idea and master plan to AI and expects JSON roadmap items compatible with Prompt Vault's roadmap parser.
- Roadmap responses are saved as roadmap versions, then immediately applied to the active project prompt pack.
- `Start Next Task` now selects the first eligible roadmap item whose dependencies are done and that has not already been started, then calls Prompt Vault's `startRoadmapPrompt()` API to create the next Codex task file.
- Selecting a saved project now refreshes the Plan editor fields, including project idea and master plan, so stale text from the previous project does not remain visible.

## 2026-05-26 Task-First Project Settings Update

- Desktop project creation now preserves readable Windows folder names instead of slug-only paths. A project named `Proiectul pulii` maps to `F:\Projects\CopyPaste\Projects\Proiectul pulii` by default.
- Prompt Vault now stores an editable app-level `projectsBasePath`; the Plan workspace exposes it as `Default projects folder`, and new project drafts derive their path from that folder.
- The primary workspace vocabulary is now task-first: visible `Prompts` became `Tasks`, `Prompt Roadmap` became `Task Roadmap`, and task edit actions now say `Task name`, `Task content`, `Save Task`, and `Improve Task`.
- Project Browser now focuses on one project at a time by default. Selecting `New project / manual entry` shows only the draft project, selecting a saved project shows only that project, and `See all projects` reveals the full saved project list so users can enter another project.
- Project Browser supports right-click actions:
  - project row: copy project path or remove the project from the browser
  - task row: copy task content or delete the task from the active task list
- Project deletion is a soft browser removal: project files remain on disk and the project path is tombstoned in Prompt Vault so filesystem sync does not immediately re-add it.
- The context-menu close handler avoids DOM writes when the menu is already closed so native controls like the saved-project dropdown continue to open normally after delete actions.
- `Improve Master Plan` now has a real renderer workflow: it saves the current project brief, builds a master-plan prompt from `Project idea` plus any existing plan, sends it through the extension AI bridge, and writes the returned text into the `Master Plan` editor while saving it as a master-plan version for saved projects.
- The master-plan action label is state-aware: empty/default `# Master Plan` content shows `Create Master Plan`; real plan content shows `Improve Master Plan`.
- Internal storage still uses legacy `promptPacks` / `chunks` names for compatibility with existing saved data.
- Project dropdown behavior treats the blank option as a real new-project draft and keeps saved projects available after saving additional projects.
- Added IPC/preload settings bridge: `VAULT_UPDATE_SETTINGS` and `window.copypasteDesktop.updateVaultSettings(payload)`.
- Regression coverage verifies preserved project folder names, configurable default project folder, multi-project persistence, and task-first UI copy.

## 2026-05-26 Sidebar Alignment + New Project Draft Flow

- Updated renderer-side project creation flow in `apps/desktop/renderer.js`:
  - `createProjectFromSidebar()` no longer calls `window.prompt()`.
  - New Project now initializes a local draft state, clears project/pack/chunk selection, and switches workspace to `plan`.
  - Draft defaults are written into workspace fields (`Project name`, `Project path`, empty idea, empty master plan) and project name is focused/selected.
- Added draft synchronization helpers in renderer:
  - `getProjectDraftPath(projectName)` for deterministic `F:\Projects\CopyPaste\Projects\<slug>` paths.
  - `getDraftCommitFallback(projectName)` for legacy fallback commit defaults.
  - `syncDraftFieldsFromName(projectName)` to keep draft path/default fields in sync while preserving manual path edits.
  - Added manual path override detection so typing in `Project path` disables future auto-overwrite from name changes.
- Updated sidebar tree visual alignment in `apps/desktop/index.html`:
  - explicit left alignment override for `.tree-project`, `.tree-pack`, `.tree-item` (`justify-content: flex-start`, left text, wrapping).
  - task title span and status-pill layout now keep label text anchored left while pill remains consistently aligned.
- Test coverage updated in `apps/desktop/tests/controller-ui.test.js`:
  - validates draft path/fallback helper outputs.
  - validates absence of `window.prompt(` in renderer source.
  - validates sidebar left-alignment CSS rules.

## 2026-05-26 Guided Flow Update

- Primary desktop flow remains in `apps/desktop/index.html` + `apps/desktop/renderer.js` + `apps/desktop/main.js` + `apps/desktop/prompt-vault.js`.
- Added file-first project scaffolding under default base `F:\Projects\CopyPaste\Projects`:
  - project folder auto-created when missing
  - required files auto-created when missing: `codex.md`, `architecture.md`, `masterplan.md`, `plan-roadmap.md`, `tasks/`
- Prompt vault now computes per-project stage and next action from filesystem state:
  - `Idea` -> `Master Plan` -> `Roadmap` -> `Tasks` -> `Codex`
- Roadmap parser in `prompt-vault.js` now accepts:
  - JSON roadmap
  - Markdown table roadmap
  - Markdown heading/list roadmap sections
- Task file persistence:
  - roadmap prompt creation writes `tasks/task-<order>-<slug>.md`
  - generated prompt packs also write task files in `tasks/`
- Codex handoff builder:
  - new store API `copyRoadmapHandoffToCodex(packId, selector)`
  - selector supports `1`, `1-3`, `5,7`
  - handoff merges shared project files (`architecture.md`, `codex.md`, `masterplan.md`, `plan-roadmap.md`) + selected task files
- IPC bridge additions:
  - main channel: `VAULT_COPY_ROADMAP_HANDOFF`
  - preload API: `copyRoadmapHandoff(payload)`
- Sidebar UX updates:
  - project cards now show `Stage` and `Next`
  - added `New Project` and `Open Folder` sidebar actions
  - prompt workspace includes explicit task selector + `Copy Codex Handoff`

## Project X-Ray

CopyPaste is now a monorepo for two cooperating runtime artifacts:

- `apps/desktop`: Electron desktop controller copied from `F:\Projects\Next Step`.
- `apps/extension`: Chrome Manifest V3 extension copied from the former CopyPaste root.

The product model stays the same: Electron owns the user-facing AI Project Builder UI and starts a local WebSocket server on `ws://localhost:8080`; the Chrome extension connects to that server, automates existing ChatGPT/Claude browser tabs, captures the generated response, and sends it back to Electron.

## Root Structure

- `apps/desktop/`: Electron controller application, renderer UI, local storage, prompt vault, WebSocket server, and desktop tests.
- `apps/extension/`: Chrome extension manifest, service worker, content script, legacy inactive popup, extension tests, and extension-specific history docs.
- `packages/protocol/`: Shared AI Project Builder provider/stage protocol extracted from the desktop app.
- `docs/`: Setup, release, and planning/spec documentation.
- `package.json`: npm workspace root with shared verification commands.
- `package-lock.json`: Root workspace lockfile generated by `npm install`.
- `architecture.md`: Monorepo architecture x-ray.
- `codex.md`: Monorepo progress log.

## Runtime Flow

1. Run the Electron app from `apps/desktop`.
2. Electron starts a WebSocket server on `ws://localhost:8080` and writes the current session token to `apps/extension/ws-session-token.json`.
3. The Chrome extension is installed once in normal Chrome with `chrome://extensions` -> Developer mode -> Load unpacked -> `apps/extension`.
4. At startup, or when the user clicks `Connect extension`, Electron opens normal Chrome to `chrome-extension://akbkdpfnbkafgnfanoddlkdlgdlkacdk/wake.html`.
5. `wake.html` runs `wake.js`, which sends `COPYPASTE_WAKE` to the MV3 service worker. The service worker reads the fresh token with `fetch(chrome.runtime.getURL("ws-session-token.json"), { cache: "no-store" })`, connects to Electron, sends `EXTENSION_SESSION_HELLO`, then asks Chrome to close the wake tab after the handshake message is sent.
6. The Electron renderer calls the preload-exposed `window.copypasteDesktop.sendWorkflow()` API, which invokes the `TRIGGER_AI_WORKFLOW` IPC handler in the main process. The same bridge exposes extension setup, connect, and diagnostic refresh actions.
7. The main process forwards `{ chatgptPrefix, claudePrefix, text, targetProvider, currentStageId, currentStageLabel, currentRole }` only when the authenticated extension WebSocket is open.
8. The extension selects the target ChatGPT or Claude tab, injects `content.js`, sends the prompt, waits for a stable response, and returns `{ ok, target, nextTarget, text }`.
9. Electron receives the response through WebSocket and updates the AI Project Builder UI.

## Extension Readiness State

- Electron status payloads include `extensionState`: `connected`, `loaded`, `disconnected`, or `error`.
- `connected` means the Chrome extension completed the authenticated WebSocket session handshake and `extensionSocket` is open.
- `loaded` means Electron opened the extension wake page and is waiting for the authenticated WebSocket handshake. This state must not enable workflow dispatch or show the connection pill as connected.
- `disconnected` means Electron has no authenticated extension socket and no wake attempt is currently pending.
- `error` means setup/connect failed or the socket was rejected.
- The active renderer derives extension connection UI from `extensionState`, not from message text or generic success/error tone.
- Workflow dispatch returns immediate `{ ok, extensionState, error }` feedback when Electron cannot send to the extension.
- The normal flow no longer uses Chrome debugging flags, a dedicated Chrome profile, `--load-extension`, or `Extensions.loadUnpacked`. Chrome is opened by absolute `chrome.exe` path with only the extension wake URL or `chrome://extensions`.

## Workspace Packages

- Root package: `copypaste-monorepo`
  - `npm run desktop`: starts Electron.
  - `npm run desktop:dev`: starts Electron dev mode.
  - `npm run extension:verify`: checks and tests the extension.
  - `npm run desktop:test`: runs desktop tests.
  - `npm run verify`: runs extension verification and desktop tests.
- Desktop package: `next-step`
  - Keeps the existing Electron package identity for compatibility.
- Extension package: `@copypaste/extension`
  - Runs syntax checks and Node regression tests from `apps/extension`.
- Protocol package: `@copypaste/protocol`
  - Exports the AI Project Builder provider/workflow protocol as a UMD-compatible module.

## Critical Files

- `apps/desktop/main.js`: Active Electron entry point, WebSocket server, IPC bridge, prompt vault handlers, and hardened BrowserWindow configuration.
- `apps/desktop/preload.js`: Context-isolated bridge exposing the active `copypasteDesktop` workflow/vault API and `copypasteProtocol` wrappers to the renderer.
- `apps/desktop/renderer.js`: Root renderer logic for AI Project Builder, prompt vault flows, visible status messages, and extension recovery controls; uses preload APIs at runtime rather than direct Electron IPC.
- `apps/desktop/main/storage.js`: Desktop persistence helpers using the shared protocol.
- `apps/desktop/tests/run-tests.js`: Desktop test runner.
- `.github/workflows/verify.yml`: GitHub Actions workflow for Windows install plus `npm.cmd run verify` on push and pull request.
- `apps/extension/manifest.json`: Chrome Manifest V3 definition.
- `apps/extension/background.js`: Extension service worker and WebSocket client.
- `apps/extension/content.js`: ChatGPT/Claude DOM automation and response extraction.
- `apps/extension/background.test.js`: Extension background regression tests.
- `apps/extension/content.test.js`: Extension content-script regression tests.
- `packages/protocol/index.js`: Shared provider/stage protocol.

## Current Constraints

- The extension is installed manually once in normal Chrome. After adding the stable manifest `key`, Chrome must reload or reinstall the unpacked extension once so the fixed ID is active.
- Electron opens normal Chrome to the fixed `wake.html` URL to reconnect the installed extension. It does not launch ChatGPT/Claude, use a dedicated profile, or attach a Chrome debug endpoint in the normal flow.
- The desktop app and extension communicate over a local WebSocket guarded by a per-session token handshake. This is local hardening, not a replacement for OS-level trust boundaries.

## 2026-05-26 Sidebar And Drawer Update

- Desktop renderer now includes a persistent left `Project Browser` and right `Task Drawer` in `apps/desktop/index.html`.
- Browser hierarchy is derived from prompt vault state: `Project -> Prompt Pack -> Master Prompt -> Tasks`.
- Single-click updates selection; double-click opens task editing in drawer.
- Drawer tabs:
  - `Content`: task name/content editing, copy prompt, copy launcher.
  - `AI Improve`: build/send improve prompt and keep proposed versions.
  - `Runs`: append-only `What Codex did` notes per task.
- Prompt vault chunk schema in `apps/desktop/prompt-vault.js` now includes:
  - `versions: [{ id, source, promptSnapshot, responseText, createdAt, appliedAt }]`
  - `runHistory: [{ id, note, source, createdAt }]`
- Legacy prompt-vault records migrate automatically by sanitization defaults to empty `versions` and `runHistory`.
- Workflow response routing in renderer now supports explicit context:
  - `debate_plan`: response updates project plan.
  - `task_improve`: response is saved as proposed version for selected task.
- ChatGPT/Claude DOM automation is selector-based and must be regression-tested whenever provider UIs change.
- `popup.html` and `popup.js` remain in `apps/extension` as legacy inactive files because the current manifest does not register a popup action.
- The old `F:\Projects\Next Step` directory was not deleted and remains available as a backup/source reference.

## 2026-05-26 Workspace And Inspector Redesign

- The desktop surface was remodernized to a 3-region productivity shell:
  - left `Project Browser` navigation
  - center `Workspace` editing surface
  - right `Inspector` context panel
- `Task Drawer` is no longer the primary editor. Task `Name`, `Content / Prompt`, and `Status` editing now happens in the center workspace.
- Workspace tabs now control main surface mode: `Tasks`, `Plan`, `AI Debate`.
- Inspector tabs are now secondary context only: `AI Improve`, `Versions`, `Runs`, `Details`.
- Selection routing contract:
  - single-click in sidebar selects item and renders the center workspace
  - double-click on task focuses center task editor
- Workflow routing contract is unchanged:
  - `debate_plan` updates project-plan flow
  - `task_improve` stores AI response as a proposed task version
- Prompt vault schema/API and IPC bridges remain unchanged from the previous update; this pass is UI architecture and interaction refactor only.

## 2026-05-26 Master Plan To Prompt Pipeline

- The active desktop workflow is now modeled as `Project Idea -> Master Plan -> Prompt Roadmap -> one prompt at a time -> approve -> copy to Codex -> record result`.
- The visible workspace has two modes only: `Plan` and `Prompts`. The old visible `AI Debate` tab is removed from the product workflow.
- `Plan` owns project creation and planning:
  - project name
  - project path
  - project idea
  - master plan
  - master plan improvement
  - prompt roadmap creation
- `Prompts` owns execution prompt authoring and handoff:
  - prompt name/content
  - status
  - run note
  - improve prompt
  - approve
  - copy to Codex
  - mark done
- Prompt statuses are normalized to four operational states: `in_progress`, `approved`, `copied`, and `done`.
- Existing prompt vault storage remains the source of truth, with added project fields (`idea`, `masterPlan`, `masterPlanVersions`, `activePromptPackId`) and prompt-pack fields (`roadmap`, `roadmapVersions`, `activePromptId`).
- Legacy generated prompt packs remain readable, but the primary sidebar no longer presents latest/older prompt-pack history as the main workflow.
- Codex handoff is semi-automatic: only approved prompts can be copied, the app marks them copied, and `Done` requires a run-history note.

## 2026-05-25 Takeover Audit Snapshot

### Active Runtime

- Root `package.json` defines npm workspaces for `apps/desktop`, `apps/extension`, and `packages/protocol`.
- `apps/desktop/package.json` starts Electron with `main.js`; the active UI is `apps/desktop/index.html` plus `apps/desktop/renderer.js`.
- `apps/desktop/main.js` creates the desktop window with preload, `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: false` so the preload can require the local protocol package; generates a per-session WebSocket token; starts the WebSocket bridge on port `8080`; rejects clients that do not send the current token in `EXTENSION_SESSION_HELLO`; forwards `TRIGGER_AI_WORKFLOW` payloads to the extension; handles `AI_RESPONSE_RECEIVED`; and owns Prompt Vault IPC handlers.
- `apps/extension/manifest.json` registers only `background.js` as the MV3 service worker; no popup action is active.
- `apps/extension/background.js` connects to `ws://localhost:8080`, receives one command at a time, targets ChatGPT or Claude tabs, injects `content.js`, reads the response, and sends it back to Electron.
- `packages/protocol/index.js` is the shared pure JS provider/workflow model for AI Project Builder stages.

### Legacy Or Duplicate Runtime

- `apps/desktop/main/main.js` and `apps/desktop/renderer/*` are an older alternate Electron architecture and are not the package entry point today. `apps/desktop/preload.js` is now shared by the active root runtime and the alternate runtime, with explicit active `copypaste*` APIs added for the root UI.
- `apps/desktop/shared/ai-project-builder-protocol.js` is a compatibility copy; active imports use `packages/protocol`.
- `apps/extension/popup.html` and `apps/extension/popup.js` are legacy inactive files and still reference old runtime actions (`GET_STATE`, `EXECUTE_NEXT_STEP`, `TRIGGER_SAVE`) that current `background.js` does not handle.
- Root untracked files `2.txt` and `New Text Document.txt` are older prototype background scripts. Root untracked `codex-plans/copypaste-codex-execution-pack` is generated from the dummy source text `mesaj de test`.

### Release State

- `npm.cmd run verify` passes on Node `v24.13.0` and npm `11.6.2`.
- `npm.cmd audit --omit=dev` reports 0 production vulnerabilities.
- Root `.github/workflows/verify.yml` now provides install-and-verify CI. There is still no `.env.example`, lint/typecheck/build script, Electron packaging script, or Chrome Web Store packaging/signing workflow.
- Main release risks are selector-based external provider automation, missing browser-level end-to-end verification, documentation drift between active and legacy desktop runtimes, and the fact that the local WebSocket token is written beside the unpacked extension for development-time loading.

## 2026-05-25 WebSocket Session Handshake

- `apps/desktop/main/ws-session.js` owns token generation, token-file writing, and handshake validation.
- `apps/desktop/main.js` creates a fresh random token when the Electron process starts and writes it to the ignored `apps/extension/ws-session-token.json` file.
- The extension reads that file through `chrome.runtime.getURL("ws-session-token.json")` and sends `EXTENSION_SESSION_HELLO` as the first WebSocket message.
- Electron does not assign `extensionSocket` or forward workflow payloads until the handshake succeeds.
- Clients that send no token, the wrong token, invalid JSON before authentication, or no handshake before the timeout are closed with code `4401`.
- Regression coverage lives in `apps/desktop/tests/ws-session.test.js` and `apps/extension/background.test.js`.

## 2026-05-25 GitHub Actions Verify CI

- `.github/workflows/verify.yml` runs on `push` and `pull_request`.
- The job runs on `windows-latest`, uses `actions/checkout@v4`, `actions/setup-node@v4` with Node `24`, installs with `npm.cmd ci`, and verifies with `npm.cmd run verify`.
- The workflow is verification-only and does not publish release artifacts.

## 2026-05-25 Electron Runtime Hardening

- Active desktop launch path remains `apps/desktop/package.json` -> `apps/desktop/main.js` -> `apps/desktop/index.html` -> `apps/desktop/renderer.js`.
- `apps/desktop/main.js` now creates the active `BrowserWindow` with `preload: path.join(__dirname, "preload.js")`, `contextIsolation: true`, and `nodeIntegration: false`.
- `apps/desktop/preload.js` exposes `window.copypasteDesktop` for workflow dispatch, Prompt Vault invoke calls, and renderer event subscriptions.
- `apps/desktop/preload.js` exposes `window.copypasteProtocol` for the pure AI Project Builder protocol helpers needed by the active renderer.
- `apps/desktop/renderer.js` no longer imports Electron or accesses `ipcRenderer` directly at runtime; workflow and Prompt Vault calls go through the preload bridge.
- Existing Prompt Vault behavior is preserved through the same main-process `VAULT_*` handlers and local `prompt-vault-db.json` persistence.
- Regression coverage lives in `apps/desktop/tests/electron-security.test.js`, which checks the active window hardening, preload bridge exposure, and absence of direct Electron IPC in the active renderer.

## 2026-05-25 Desktop Extension Recovery UX

- The active UI has `Refresh extension`, `Setup extension once`, and `Connect extension` controls near the connection pill.
- `Setup extension once` invokes `EXTENSION_SETUP_ONCE`, copies `apps/extension` to the clipboard, and opens `chrome://extensions` in normal Chrome so the user can Load unpacked once.
- `Setup extension once` is best-effort for Chrome navigation: Electron launches Chrome with `--new-window chrome://extensions`, then surfaces fallback instructions because `chrome://` pages may still open as blank/new tab depending on Chrome state.
- `Connect extension` invokes `EXTENSION_CONNECT_INSTALLED`, opens normal Chrome to `chrome-extension://akbkdpfnbkafgnfanoddlkdlgdlkacdk/wake.html`, and marks the extension state as `loaded` until the authenticated WebSocket handshake completes.
- `Refresh extension` is diagnostic only. It reports whether Electron currently has an authenticated extension WebSocket and does not probe Chrome debugging endpoints.
- The active UI also exposes setup fallbacks: `Copy extension path`, `Copy chrome://extensions`, and `Open extension folder`.
- After install, Electron can request the extension to open `chrome://extensions` from extension context via WebSocket control message `OPEN_EXTENSIONS_PAGE`.
- `apps/extension/manifest.json` contains a stable `key` so the unpacked extension ID is fixed as `akbkdpfnbkafgnfanoddlkdlgdlkacdk`.
- `apps/extension/wake.html` and `apps/extension/wake.js` wake the MV3 service worker without timers or Chrome debugging flags.
- The normal flow does not use `--load-extension`, `--disable-extensions-except`, `--user-data-dir`, remote debugging flags, or a managed Chrome profile.
- Chrome is launched by absolute executable path only. The desktop app checks standard Windows install locations and environment-derived locations, and no longer falls back to spawning bare `chrome.exe`.
- Status messages are now made visible by the renderer whenever `setStatus()` is called.
- The active BrowserWindow explicitly uses `sandbox: false` because `apps/desktop/preload.js` requires `../../packages/protocol`; `contextIsolation` remains enabled and renderer Node integration remains disabled.
