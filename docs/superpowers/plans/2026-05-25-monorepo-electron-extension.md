# Monorepo Electron Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Chrome extension and Electron controller into one npm-workspace monorepo rooted at `F:\Projects\CopyPaste`.

**Architecture:** Keep Electron and the Chrome extension as separate runtime artifacts under `apps/`. Extract the AI Project Builder protocol into `packages/protocol` and wire desktop imports to that shared package. Use root scripts for repeatable verification.

**Tech Stack:** JavaScript, Chrome Extension Manifest V3, Electron, Node.js, npm workspaces, Node `node:test`.

---

### Task 1: Create Workspace Shape

**Files:**
- Create: `apps/`
- Create: `apps/desktop/`
- Create: `apps/extension/`
- Create: `packages/protocol/`

- [x] Create the target directories.
- [x] Keep the repository root as the monorepo root.
- [x] Keep `F:\Projects\Next Step` untouched as a source backup.

### Task 2: Move Extension

**Files:**
- Move: `manifest.json` -> `apps/extension/manifest.json`
- Move: `background.js` -> `apps/extension/background.js`
- Move: `content.js` -> `apps/extension/content.js`
- Move: `popup.html` -> `apps/extension/popup.html`
- Move: `popup.js` -> `apps/extension/popup.js`
- Move: `background.test.js` -> `apps/extension/background.test.js`
- Move: `content.test.js` -> `apps/extension/content.test.js`
- Copy: `architecture.md` -> `apps/extension/architecture.md`
- Copy: `codex.md` -> `apps/extension/codex.md`

- [x] Move extension runtime and test files.
- [x] Preserve extension-specific docs inside `apps/extension`.
- [x] Do not change extension behavior during the move.

### Task 3: Copy Desktop App

**Files:**
- Copy source: `F:\Projects\Next Step\*`
- Copy target: `apps/desktop\*`

- [x] Copy Electron app files into `apps/desktop`.
- [x] Exclude `.git` and `node_modules`.
- [x] Preserve app-local tests, docs, package files, and source files.

### Task 4: Extract Shared Protocol

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/index.js`
- Modify: `apps/desktop/renderer.js`
- Modify: `apps/desktop/main/storage.js`
- Modify: `apps/desktop/tests/ai-project-builder-protocol.test.js`
- Modify: `apps/desktop/renderer/index.html`

- [x] Copy `apps/desktop/shared/ai-project-builder-protocol.js` into `packages/protocol/index.js`.
- [x] Update Node imports to require the shared package by relative path.
- [x] Update browser script path in nested renderer HTML.
- [x] Leave the desktop-local shared file as historical compatibility copy; active imports use `packages/protocol`.

### Task 5: Add Workspace Scripts

**Files:**
- Create: `package.json`
- Create: `apps/extension/package.json`

- [x] Add root npm workspaces for `apps/desktop`, `apps/extension`, and `packages/protocol`.
- [x] Add extension scripts: `check`, `test`, `verify`.
- [x] Add root scripts: `desktop`, `desktop:dev`, `extension:verify`, `desktop:test`, `test`, `verify`.

### Task 6: Update Docs

**Files:**
- Modify: `architecture.md`
- Modify: `codex.md`
- Create: `README.md`
- Create: `docs/setup.md`
- Create: `docs/release.md`

- [x] Convert root architecture to a monorepo x-ray.
- [x] Record migration progress in root `codex.md`.
- [x] Add setup and release documentation for the combined repo.

### Task 7: Verify

**Commands:**

```powershell
npm --workspace @copypaste/extension run verify
npm --workspace next-step test
npm run verify
git status --short --branch
```

- [x] Extension syntax and tests pass.
- [x] Desktop tests pass from `apps/desktop`.
- [x] Root verification command passes.
- [x] Git status shows expected moves/additions only; pre-existing untracked root artifacts remain unstaged.
