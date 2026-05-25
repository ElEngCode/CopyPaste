# Release Checklist

## Pre-Release Verification

Run from the repository root:

```powershell
npm.cmd run verify
```

Do not prepare a release if this command fails.

## CI Verification

GitHub Actions runs `.github/workflows/verify.yml` on every push and pull request. The workflow uses `windows-latest`, installs dependencies with:

```powershell
npm.cmd ci
```

and verifies with:

```powershell
npm.cmd run verify
```

The CI workflow is verification-only; it does not publish or create releases.

## Manual Browser Check

1. Start Electron with `npm.cmd run desktop`.
2. Load `apps/extension` as an unpacked Chrome extension.
3. Open ChatGPT and Claude tabs in the same Chrome window.
4. Confirm the Electron UI reports the extension as connected.
5. Send one ChatGPT-targeted workflow step.
6. Confirm the captured response appears in the Electron UI.
7. Send one Claude-targeted workflow step.
8. Confirm the captured response appears in the Electron UI.

## Extension Artifact

The extension source lives in:

```text
apps/extension
```

For manual distribution, zip the contents of `apps/extension` after verification. Do not include generated dependency folders.

## Desktop Artifact

The desktop app lives in:

```text
apps/desktop
```

There is no packaged installer workflow yet. Add one before a public release.

## Known Release Blockers

- There is no automated browser e2e test against real ChatGPT/Claude pages; provider login and verification stay manual.
- Chrome Web Store packaging/signing is not configured.
- Electron installer packaging is not configured.
