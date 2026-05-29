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

`Project Idea -> Master Plan Draft -> Task Roadmap Draft -> Task Prompts -> Approved Codex Handoff`

Operational flow:
1. Create/select project.
2. Write the project idea, then click **Generate Master Plan**.
3. Optionally click **Improve with Claude** and **Revise with GPT** as manual master-plan rounds.
4. Click **Save Master Plan & Create Task Roadmap**.
5. Review the roadmap draft. Optionally click **Improve Roadmap with Claude** or **Revise Roadmap with GPT** before saving.
6. Click **Save Roadmap** to write `plan-roadmap.md`.
7. Use **Create Next Task** for dependency-gated task creation or **Create All Tasks** for local idempotent bulk task files.
8. Open each task in Project Browser, edit or improve it with Claude/GPT, apply the preferred proposed version, then approve it.
9. **Copy to Codex** is gated by approved task status. Add run notes and use **Improve Again from Run Notes** when execution fails or needs a tighter prompt.

The main workflow does not expose internal **Apply Master Plan** or **Apply Roadmap** controls. Those happen internally when the user clicks the corresponding Save action.

If an AI response is stale, missing a request id, cancelled, or delayed, the session recovers locally: busy state is cleared, Cancel hides, the error remains visible, and retry buttons stay enabled when prerequisites are present.

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

