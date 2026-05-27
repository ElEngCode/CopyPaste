# Prompt Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Electron Prompt Vault that stores project-specific Codex execution packs, exports chunked prompt files into each project, and supports copy-to-Codex workflows.

**Architecture:** The root Electron controller owns the vault database and filesystem writes in the main process. The renderer sends IPC requests for state, pack generation, copy, folder open, and chunk status updates. Generated packs are stored in the Electron userData database and exported to `<ProjectPath>\codex-plans\<pack-slug>`.

**Tech Stack:** Electron main/renderer IPC, Node `fs`/`path`, Electron `clipboard`/`shell`, JSON database, Markdown prompt files.

---

### Task 1: Prompt Vault Storage

**Files:**
- Create: `F:\Projects\Next Step\prompt-vault.js`
- Test: `F:\Projects\Next Step\tests\prompt-vault.test.js`

- [x] **Step 1: Create a pure Node storage module**

Implement a module that can read/write `prompt-vault-db.json`, sanitize projects and packs, generate slugs, and export Markdown files.

- [x] **Step 2: Generate project-specific pack folders**

Export `master-plan.md`, `final-text.md`, `metadata.json`, and numbered `codex-###-*.md` files under `<ProjectPath>\codex-plans\<pack-slug>`.

- [x] **Step 3: Encode git policy per chunk**

Support `none`, `final_only`, and `every_chunk`. Generated prompts include `Git action: none` or `Git action: commit_and_push`.

- [x] **Step 4: Verify storage behavior**

Run: `npm.cmd test`

Expected: `ok prompt-vault.test.js`.

### Task 2: Electron IPC

**Files:**
- Modify: `F:\Projects\Next Step\main.js`

- [x] **Step 1: Add vault IPC channels**

Add handlers for `VAULT_GET_STATE`, `VAULT_GENERATE_PACK`, `VAULT_COPY_CHUNK`, `VAULT_MARK_CHUNK`, and `VAULT_OPEN_FOLDER`.

- [x] **Step 2: Keep filesystem and clipboard work in main**

Use `clipboard.writeText()` for copy-to-Codex and `shell.openPath()` for opening the exported pack folder.

- [x] **Step 3: Verify syntax**

Run: `node --check main.js`

Expected: no output and exit code `0`.

### Task 3: Renderer UI

**Files:**
- Modify: `F:\Projects\Next Step\index.html`
- Modify: `F:\Projects\Next Step\renderer.js`

- [x] **Step 1: Add Prompt Vault controls**

Add project name, project path, pack title, chunk count, git mode, branch name, and commit message fields.

- [x] **Step 2: Render prompt packs and chunks**

Show exported folder, branch, git mode, chunk status, and per-chunk buttons for copy, in-progress, done, and open folder.

- [x] **Step 3: Wire IPC from renderer**

Use `ipcRenderer.invoke()` for vault operations and update UI state after every mutation.

- [x] **Step 4: Verify syntax**

Run: `node --check renderer.js`

Expected: no output and exit code `0`.

### Task 4: Documentation

**Files:**
- Modify: `F:\Projects\Next Step\architecture.md`
- Modify: `F:\Projects\Next Step\codex.md`

- [x] **Step 1: Update architecture x-ray**

Document the Prompt Vault database, export folder layout, IPC channels, and Codex execution chunk flow.

- [x] **Step 2: Update progress log**

Record completed implementation and verification commands.
