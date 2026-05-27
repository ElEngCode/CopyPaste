# Monorepo Electron + Extension Design

## Goal

Unify the current Chrome extension in `F:\Projects\CopyPaste` and the Electron controller in `F:\Projects\Next Step` into one professional repository rooted at `F:\Projects\CopyPaste`.

## Decision

Keep the existing runtime model:

- Electron remains the desktop controller and owns the user-facing app.
- The Chrome extension remains a separate Manifest V3 extension artifact.
- Electron starts the local WebSocket server on `ws://localhost:8080`.
- The extension connects to that server, controls ChatGPT/Claude browser tabs, and returns captured text.

The unification is repository-level, not a single binary runtime.

## Target Structure

```text
F:\Projects\CopyPaste\
  apps\
    desktop\
    extension\
  packages\
    protocol\
  docs\
    setup.md
    release.md
    superpowers\
      specs\
      plans\
  architecture.md
  codex.md
  package.json
```

## Boundaries

- `apps/desktop`: Electron app copied from `F:\Projects\Next Step`, excluding `.git` and `node_modules`.
- `apps/extension`: Manifest V3 extension files moved from the current repo root.
- `packages/protocol`: shared AI Project Builder workflow/protocol module extracted from the desktop app.
- root `package.json`: npm workspaces and verification commands.
- root `architecture.md` and `codex.md`: monorepo-level architecture and progress.

## Non-Goals For First Migration

- Do not remove the Chrome extension runtime.
- Do not replace the WebSocket bridge.
- Do not refactor `content.js` beyond path movement.
- Do not delete `F:\Projects\Next Step`.
- Do not redesign the Electron UI.
- Do not implement WebSocket authentication in this migration.

## Verification

Minimum checks after migration:

- Extension syntax checks pass.
- Extension tests pass.
- Desktop tests pass from the new workspace location.
- Root `npm run verify` runs those checks.

