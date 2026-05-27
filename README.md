# CopyPaste

CopyPaste is a monorepo for an Electron desktop controller and a Chrome Manifest V3 extension that work together to run a human-gated ChatGPT/Claude workflow.

## Structure

```text
apps/desktop      Electron AI Project Builder controller
apps/extension    Chrome extension automation puppet
packages/protocol Shared AI Project Builder provider/stage protocol
docs              Setup, release, specs, and plans
```

## Requirements

- Node.js 24 or compatible modern Node runtime
- npm
- Chrome or Chromium

## Install

```powershell
npm.cmd install
```

Use `npm.cmd` in PowerShell if `npm.ps1` is blocked by local execution policy.

## Run

Start the desktop app:

```powershell
npm.cmd run desktop
```

Load the unpacked Chrome extension from:

```text
<repo>/apps/extension
```

Open ChatGPT and Claude tabs in the same Chrome window, then use the Electron app to send the next workflow step.

## Planning Workflow

Current workflow order:

1. Create project
2. Save idea
3. Run staged AI debate
4. Create master plan draft version
5. Apply master plan
6. Generate roadmap draft version
7. Apply roadmap
8. Create one task prompt from eligible roadmap item
9. Improve task prompt (proposed version)
10. Approve task prompt
11. Copy Codex handoff
12. Mark task done (unblocks dependencies)

## Verify

```powershell
npm.cmd run verify
```

This runs extension syntax/tests and desktop tests.

## Local Data Paths

- Desktop DB: `%APPDATA%/next-step/prompt-vault-db.json` (Electron userData)
- Generated project files: `<repo>/Projects/...` (or custom `Default projects folder` from settings)
- Applied master plan file: `<project>/masterplan.md`
- Applied roadmap file: `<project>/plan-roadmap.md`
- Task prompt files: `<project>/tasks/task-###-slug.md`

## Notes

- The Chrome extension is still installed separately even though the code lives in this monorepo.
- The local WebSocket bridge defaults to `ws://localhost:8080`.
- Desktop runtime env overrides:
  - `COPYPASTE_WS_PORT` to change the desktop WebSocket server port.
  - `COPYPASTE_EXTENSION_ID` to override the wake URL extension id (must be a 32-char Chrome id).
- The original `F:\Projects\Next Step` folder was not deleted during migration.
