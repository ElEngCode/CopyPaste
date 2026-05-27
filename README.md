# CopyPaste

CopyPaste is a monorepo with:
- an Electron desktop controller (`apps/desktop`)
- a Chrome MV3 extension (`apps/extension`)
- a shared protocol package (`packages/protocol`)

## Run the app

```powershell
npm.cmd install
npm.cmd run desktop
```

If PowerShell blocks `npm.ps1`, use `npm.cmd` as shown above.

## Load the extension (manual, once per profile)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `apps/extension`.
5. In desktop app, click **Connect** (or **Setup** first, on a fresh profile).

## Verify

```powershell
npm.cmd run desktop:test
npm.cmd run extension:verify
npm.cmd run verify
```

`verify` runs extension checks/tests and desktop tests.

## Workflow

`New Project -> Master Plan -> Roadmap -> Task -> Codex`

Operational flow:
1. Create/select project.
2. Save project idea and build/apply master plan.
3. Build/apply roadmap.
4. Start one eligible task.
5. Improve/approve/copy Codex handoff.
6. Mark task done to unblock dependencies.

## Where project files are saved

- Desktop DB: Electron `userData` file `prompt-vault-db.json`
- Project output root by default: `Projects/`
- Per project scaffold/files:
  - `architecture.md`
  - `codex.md`
  - `masterplan.md`
  - `plan-roadmap.md`
  - `tasks/*.md`

The base project folder can be changed in desktop settings (`Default projects folder`).

## Planning file meanings

- `masterplan.md`: applied master plan for the project.
- `plan-roadmap.md`: applied roadmap derived from the master plan.
- `tasks/*.md`: task-level execution prompts and notes.

