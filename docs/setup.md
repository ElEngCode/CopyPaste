# Setup

## Install Dependencies

From the repository root:

```powershell
npm.cmd install
```

PowerShell may block `npm.ps1`; use `npm.cmd` when that happens.

## Start Desktop Controller

```powershell
npm.cmd run desktop
```

The Electron main process starts the local WebSocket server on `ws://localhost:8080`.

## Load Chrome Extension

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Select "Load unpacked".
4. Choose `F:\Projects\CopyPaste\apps\extension`.
5. Open ChatGPT and Claude in the same Chrome window.

## Verify Local Setup

Run:

```powershell
npm.cmd run verify
```

Expected result:

- Extension syntax checks pass.
- Extension tests pass.
- Desktop tests pass.

## Common Issues

- If the desktop UI says the extension is disconnected, reload the unpacked extension and confirm the Electron app is running.
- If PowerShell blocks npm, run `npm.cmd`.
- If provider automation fails, check whether ChatGPT or Claude changed their input, send-button, or response DOM.

