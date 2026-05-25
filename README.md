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
F:\Projects\CopyPaste\apps\extension
```

Open ChatGPT and Claude tabs in the same Chrome window, then use the Electron app to send the next workflow step.

## Verify

```powershell
npm.cmd run verify
```

This runs extension syntax/tests and desktop tests.

## Notes

- The Chrome extension is still installed separately even though the code lives in this monorepo.
- The local WebSocket bridge currently uses `ws://localhost:8080`.
- The original `F:\Projects\Next Step` folder was not deleted during migration.

