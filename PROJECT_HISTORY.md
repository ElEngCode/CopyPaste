# CopyPaste Project History

## Purpose

CopyPaste started as a practical bridge between local project planning and web AI tools. The original goal was not to build another generic note app. It was meant to control a repeatable workflow where ChatGPT and Claude could be used in a human-gated loop, then turn the resulting plan into concrete Codex work.

The project has since evolved into a local AI Project Builder: an Electron desktop controller, a Chrome extension, and a local persistence layer that together manage project ideas, master plans, task roadmaps, Codex-ready tasks, and handoff prompts.

## How It Started

The earliest working direction was a manual ChatGPT and Claude workflow:

- A Chrome extension could write text into ChatGPT or Claude pages.
- The user stayed in control and triggered each step manually.
- The extension could read the final AI response back from the page.
- Electron acted as a small local controller for the workflow.
- The first useful output was plain AI text that could be saved or copied.

At this stage, CopyPaste was mostly a controlled copy/paste automation system. The important idea was human-gated AI execution: the app helps move text between local state and web AI tools, but it does not run an uncontrolled autonomous loop.

## What It Was Supposed To Do

The intended workflow was:

1. Capture a raw project idea.
2. Send the idea through ChatGPT and Claude for clarification, planning, critique, and revision.
3. Produce a better implementation plan than a single AI response would normally create.
4. Split that plan into smaller tasks.
5. Prepare Codex prompts that can be executed one task at a time.
6. Keep enough project state locally so the user can stop, inspect, resume, and correct the workflow.

The core product expectation was always ergonomic control, not just automation. The user should understand what step they are on, what gets saved, what comes next, and what will be handed to Codex.

## How It Evolved

### 1. Manual Extension Workflow

The project began with a browser extension that could:

- receive a workflow payload from Electron,
- target ChatGPT or Claude,
- write and submit prompts,
- wait for the generated answer,
- return the text to Electron.

This created the first working local-to-web-AI bridge.

### 2. Electron Controller

The Electron app became the local control surface. It added:

- a visible desktop UI,
- local status and connection state,
- project text editing,
- save/copy actions,
- IPC between renderer and main process,
- a WebSocket bridge to the Chrome extension.

This turned CopyPaste from a browser helper into a local desktop workflow controller.

### 3. Monorepo Structure

The codebase moved into a monorepo:

- `apps/desktop` for the Electron controller,
- `apps/extension` for the Chrome extension,
- `packages/protocol` for shared workflow/protocol logic,
- `docs` for setup, release notes, architecture, and plans.

This made the desktop app, extension, and shared protocol easier to test together.

### 4. AI Project Builder Protocol

The project then moved beyond raw copy/paste and added a structured AI planning protocol:

- idea capture,
- clarification,
- planning,
- critique,
- rebuttal,
- revision,
- final synthesis,
- Codex prompt generation.

The protocol made the ChatGPT and Claude loop explicit instead of leaving it as informal prompt text.

### 5. Prompt Vault And Task Packs

Prompt Vault introduced persistent project/task state:

- project records,
- prompt packs,
- generated task chunks,
- task statuses,
- run history,
- versions,
- Codex handoff prompts.

Internally some legacy names remain, such as `promptPacks` and `chunks`, but the visible app language has moved toward projects, roadmaps, and tasks.

### 6. File-First Project Scaffolding

CopyPaste then started creating real project folders under:

```text
F:\Projects\CopyPaste\Projects
```

Each project folder gets:

- `codex.md`,
- `architecture.md`,
- `masterplan.md`,
- `plan-roadmap.md`,
- `tasks/`.

This changed the app from a DB-only planner into a file-first project workspace.

### 7. Extension Connection Hardening

The extension connection was hardened with:

- authenticated WebSocket session tokens,
- explicit connected/loaded/disconnected/error states,
- wake page support for the installed unpacked Chrome extension,
- tests for duplicate socket prevention and fresh token reads.

This repaired earlier false-ready states where the desktop UI could appear connected before the extension had actually completed the authenticated handshake.

### 8. Planning Workflow Repair

The most recent repair fixed a major logic fracture:

- master plans and roadmaps could exist in `prompt-vault-db.json`,
- but project files like `masterplan.md` and `plan-roadmap.md` could remain stale or scaffold-only,
- the UI exposed too many competing buttons,
- `Start Next Task` was unclear and did not explain what it would create.

The current workflow now mirrors applied planning state back to files and shows one stage-aware primary Plan action.

## What It Does Now

CopyPaste currently acts as a local AI Project Builder and Codex handoff system.

The active workflow is:

1. Create or select a project.
2. Write a project idea.
3. Use the primary Plan action to create a master plan.
4. Send the master plan through ChatGPT and Claude critique/revision.
5. Create a task roadmap from the final master plan.
6. Start the next eligible roadmap task.
7. Review, approve, and copy a Codex handoff prompt.
8. Mark tasks done with run notes.
9. Keep project files and local DB state synchronized.

The active runtime is:

- `apps/desktop/main.js`
- `apps/desktop/index.html`
- `apps/desktop/renderer.js`
- `apps/desktop/prompt-vault.js`
- `apps/extension/background.js`
- `apps/extension/wake.js`
- `packages/protocol/index.js`

## Current User-Facing Model

The current UI is organized around:

- Project Browser
- Workspace
- Inspector
- Plan
- Tasks
- AI versions
- Run notes
- Details

The Plan screen now has:

- `Save Draft`
- one primary action such as:
  - `Create Master Plan`
  - `Create Task Roadmap`
  - `Create Task 001: <title>`
  - disabled `No Roadmap Tasks Ready`

This is intended to remove the old button clutter and make the next step obvious.

## Current Data Model

Prompt Vault remains the canonical local state store:

```text
%APPDATA%\next-step\prompt-vault-db.json
```

Project files are now synchronized mirrors of applied planning state:

- applied master plan -> `masterplan.md`
- applied roadmap -> `plan-roadmap.md`
- started task -> `tasks/task-###-<slug>.md`

This means the UI, the DB, and the filesystem should no longer disagree about whether a project has a plan, roadmap, or task.

## Current Repository Links

Repository:

```text
https://github.com/ElEngCode/CopyPaste
```

Current working branch:

```text
codex/repair-planning-workflow
```

Draft pull request:

```text
https://github.com/ElEngCode/CopyPaste/pull/1
```

## Current State

CopyPaste is no longer just a copy/paste helper. It is a local planning and execution controller for AI-assisted development:

- Electron controls the workflow.
- Chrome extension executes web AI interactions.
- Prompt Vault stores the project model.
- Project files make the state inspectable on disk.
- Roadmaps become Codex-ready tasks.
- The user remains the approval gate between planning, handoff, and execution.

