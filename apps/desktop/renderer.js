const projectBuilderProtocol = typeof window !== "undefined" && window.copypasteProtocol
  ? window.copypasteProtocol
  : globalThis.NextStepAiProjectBuilderProtocol;
const desktopApi = typeof window !== "undefined" ? window.copypasteDesktop : null;

if (!projectBuilderProtocol) {
  throw new Error("AI Project Builder protocol API is unavailable.");
}

const TRIGGER_WORKFLOW_CHANNEL = "TRIGGER_AI_WORKFLOW";
const RESPONSE_CHANNEL = "AI_RESPONSE_RECEIVED";
const STATUS_CHANNEL = "WORKFLOW_STATUS";
const VAULT_STATE_CHANNEL = "VAULT_STATE_UPDATED";
const VAULT_GET_STATE_CHANNEL = "VAULT_GET_STATE";
const VAULT_GENERATE_PACK_CHANNEL = "VAULT_GENERATE_PACK";
const VAULT_COPY_CHUNK_CHANNEL = "VAULT_COPY_CHUNK";
const VAULT_COPY_LAUNCHER_CHANNEL = "VAULT_COPY_LAUNCHER";
const VAULT_MARK_CHUNK_CHANNEL = "VAULT_MARK_CHUNK";
const VAULT_OPEN_FOLDER_CHANNEL = "VAULT_OPEN_FOLDER";
const VAULT_DELETE_PACK_CHANNEL = "VAULT_DELETE_PACK";

const elements = {
  chatgptPrefix: null,
  claudePrefix: null,
  currentText: null,
  wordCount: null,
  projectSelect: null,
  projectName: null,
  projectPath: null,
  packTitle: null,
  chunkStrategy: null,
  chunkCount: null,
  gitRemote: null,
  defaultBranch: null,
  branchPrefix: null,
  gitMode: null,
  branchName: null,
  commitMessage: null,
  triggerButton: null,
  saveButton: null,
  generatePackButton: null,
  refreshVaultButton: null,
  openLatestPackButton: null,
  status: null,
  connectionPill: null,
  connectionText: null,
  readinessText: null,
  statusDetail: null,
  nextTarget: null,
  currentStage: null,
  currentProvider: null,
  nextProvider: null,
  responseView: null,
  roundHistory: null,
  packList: null
};

let latestVaultState = {
  projects: [],
  promptPacks: []
};
let latestWorkflowStatus = {
  message: "Waiting for Chrome extension WebSocket connection...",
  tone: "neutral",
  nextTarget: "ChatGPT"
};
let activeDebate = null;

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message, tone) {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone || "neutral";
}

function normalizeNextTarget(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "claude") {
    return "Claude";
  }

  return "ChatGPT";
}

function providerLabel(provider) {
  return String(provider || "").toLowerCase() === "claude" ? "Claude" : "ChatGPT";
}

function getActionableSteps() {
  return projectBuilderProtocol.listWorkflowSteps().filter((step) => step.actor === "ai");
}

function getStepById(stageId) {
  return projectBuilderProtocol.listWorkflowSteps().find((step) => step.id === stageId) || getActionableSteps()[0];
}

function getNextActionStep(stageId) {
  const steps = getActionableSteps();
  const index = steps.findIndex((step) => step.id === stageId);
  if (index < 0) return steps[0] || null;
  return steps[index + 1] || null;
}

function createRootDebateState(rawIdea) {
  return projectBuilderProtocol.createProjectBuilderDebate({
    title: "AI Project Builder Debate",
    raw_idea: String(rawIdea || "").trim()
  });
}

function getDebateStageView(debate) {
  const safeDebate = debate || createRootDebateState("");
  const currentStep = getStepById(safeDebate.current_stage_id);
  const nextStep = getNextActionStep(safeDebate.current_stage_id);
  const rounds = Array.isArray(safeDebate.rounds) ? safeDebate.rounds : [];

  return {
    currentStage: currentStep ? currentStep.label : "Complete",
    currentProvider: currentStep ? providerLabel(currentStep.provider) : "None",
    currentProviderId: currentStep ? currentStep.provider : "",
    nextProvider: nextStep ? providerLabel(nextStep.provider) : "Complete",
    nextProviderId: nextStep ? nextStep.provider : "",
    roundCount: rounds.length,
    rounds: rounds.map((round) => ({
      number: round.round_number,
      stage: round.stage_label || getStepById(round.stage_id)?.label || round.stage_id,
      provider: providerLabel(round.provider),
      status: round.status || "received",
      response: round.response_received || round.response || ""
    }))
  };
}

function isNoisyPreludeLine(line) {
  const normalized = String(line || "").trim().toLowerCase();
  return normalized === "thinking"
    || normalized === "thinking..."
    || /^thought for\b/.test(normalized);
}

function getCleanPlanLines(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length && isNoisyPreludeLine(lines[0])) {
    lines.shift();
    while (lines.length && !lines[0].trim()) {
      lines.shift();
    }
  }

  return lines;
}

function isSeparatorLine(line) {
  return /^[-*_]{3,}$/.test(String(line || "").trim());
}

function isBulletLine(line) {
  return /^\s*(?:[-*•]|[a-z]\))\s+/i.test(String(line || ""));
}

function stripBulletMarker(line) {
  return String(line || "").trim().replace(/^(?:[-*•]|[a-z]\))\s+/i, "");
}

function isNumberedHeadingLine(line) {
  const trimmed = String(line || "").trim();
  if (!/^\d+\.\s+\S/.test(trimmed)) return false;
  return trimmed.length <= 120;
}

function stripMarkdownEmphasis(line) {
  return String(line || "")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .trim();
}

function isPlainHeadingLine(line) {
  const trimmed = stripMarkdownEmphasis(line);
  if (!trimmed || isBulletLine(trimmed) || isNumberedHeadingLine(trimmed) || isSeparatorLine(trimmed)) {
    return false;
  }
  if (/[:.;,]$/.test(trimmed)) {
    return false;
  }
  if (trimmed.length > 88) {
    return false;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 9) {
    return false;
  }
  return /^[A-Z0-9"']/i.test(trimmed);
}

function isStrongSectionHeadingLine(line) {
  const trimmed = stripMarkdownEmphasis(line);
  return /^(what\b|critical\b|risks?\b|weaknesses\b|regressions\b|persistent\b|new\b|summary\b|net assessment\b|the one\b|identified\b|improvements?\b|gaps?\b|recommendations?\b|open questions?\b|next steps?\b|final\b|project plan\b|implementation\b|acceptance\b|tests?\b)/i.test(trimmed)
    && isPlainHeadingLine(trimmed);
}

function renderInlineMarkdown(value) {
  return escapeHtml(stripMarkdownEmphasis(value));
}

function isPreferredTitleLine(line) {
  const trimmed = stripMarkdownEmphasis(line);
  return /^(critique|review|plan|summary|final|project|implementation|codex|net assessment)\b/i.test(trimmed)
    || /^[^:]{1,64}:\s+\S/.test(trimmed);
}

function findTitleLineIndex(lines) {
  let fallbackIndex = -1;
  let checkedLines = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || isSeparatorLine(trimmed) || isNoisyPreludeLine(trimmed)) {
      continue;
    }

    if (fallbackIndex < 0) {
      fallbackIndex = index;
    }

    if (isPreferredTitleLine(trimmed)) {
      return index;
    }

    checkedLines += 1;
    if (checkedLines >= 4) {
      break;
    }
  }

  return fallbackIndex;
}

function renderProjectPlanHtml(text) {
  const lines = getCleanPlanLines(text);

  if (!lines.some((line) => line.trim())) {
    return '<article class="plan-document plan-document-empty">No plan yet.</article>';
  }

  const html = ['<article class="plan-document">'];
  const titleLineIndex = findTitleLineIndex(lines);
  let listOpen = false;
  let titleRendered = false;
  let implicitListContext = false;
  let lastWasBlank = false;

  function closeList() {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  }

  function openList() {
    if (listOpen) return;
    html.push('<ul class="plan-list">');
    listOpen = true;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      closeList();
      implicitListContext = false;
      lastWasBlank = true;
      continue;
    }

    if (isNoisyPreludeLine(trimmed)) {
      continue;
    }

    if (isSeparatorLine(trimmed)) {
      closeList();
      html.push('<hr class="plan-separator">');
      implicitListContext = false;
      lastWasBlank = true;
      continue;
    }

    if (!titleRendered) {
      closeList();
      if (lineIndex < titleLineIndex) {
        html.push(`<div class="plan-eyebrow">${renderInlineMarkdown(trimmed)}</div>`);
        implicitListContext = false;
        lastWasBlank = false;
        continue;
      }
      html.push(`<h3 class="plan-title">${renderInlineMarkdown(trimmed)}</h3>`);
      titleRendered = true;
      implicitListContext = false;
      lastWasBlank = false;
      continue;
    }

    if (isBulletLine(trimmed)) {
      openList();
      html.push(`<li>${renderInlineMarkdown(stripBulletMarker(trimmed))}</li>`);
      implicitListContext = true;
      lastWasBlank = false;
      continue;
    }

    if (isNumberedHeadingLine(trimmed)) {
      closeList();
      html.push(`<h4 class="plan-numbered-heading">${renderInlineMarkdown(trimmed)}</h4>`);
      implicitListContext = true;
      lastWasBlank = false;
      continue;
    }

    if (implicitListContext && !lastWasBlank && !isStrongSectionHeadingLine(trimmed)) {
      openList();
      html.push(`<li>${renderInlineMarkdown(trimmed)}</li>`);
      lastWasBlank = false;
      continue;
    }

    if (isPlainHeadingLine(trimmed)) {
      closeList();
      html.push(`<h4 class="plan-heading">${renderInlineMarkdown(trimmed)}</h4>`);
      implicitListContext = true;
      lastWasBlank = false;
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    implicitListContext = false;
    lastWasBlank = false;
  }

  closeList();
  html.push("</article>");
  return html.join("");
}

function getRoundPreview(text) {
  return getCleanPlanLines(text)
    .map((line) => line.trim())
    .filter((line) => line && !isSeparatorLine(line))
    .slice(0, 3)
    .map((line) => stripBulletMarker(stripMarkdownEmphasis(line)))
    .join(" - ")
    .slice(0, 180);
}

function createStageWorkflowPayload(debate, prefixes = {}) {
  const prompt = projectBuilderProtocol.createNextDebatePrompt(debate);
  debate.pending_stage_prompt = prompt;
  debate.status = "waiting_response";
  return {
    chatgptPrefix: String(prefixes.chatgptPrefix || ""),
    claudePrefix: String(prefixes.claudePrefix || ""),
    text: prompt.prompt,
    targetProvider: prompt.provider,
    currentStageId: prompt.stage_id,
    currentStageLabel: prompt.stage_label,
    currentRole: prompt.role
  };
}

function applyDebateResponse(debate, responseText) {
  const safeDebate = debate || createRootDebateState("");
  const pendingPrompt = safeDebate.pending_stage_prompt || projectBuilderProtocol.createNextDebatePrompt(safeDebate);
  const savedRound = projectBuilderProtocol.saveDebateRound(safeDebate, {
    stage_id: pendingPrompt.stage_id,
    provider: pendingPrompt.provider,
    role: pendingPrompt.role,
    prompt_sent: pendingPrompt.prompt,
    response_received: String(responseText || ""),
    status: "received"
  });
  delete safeDebate.pending_stage_prompt;
  projectBuilderProtocol.advanceDebateStage(safeDebate);
  return {
    debate: safeDebate,
    savedRound,
    stageView: getDebateStageView(safeDebate)
  };
}

function getWorkflowStatusView(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const message = String(source.message || "");
  const tone = String(source.tone || "neutral");
  const nextTarget = normalizeNextTarget(source.nextTarget);
  const connected = tone === "success" || /connected/i.test(message);
  const busy = tone === "busy" || /sending|dispatching/i.test(message);
  const disconnected = tone === "error" || /disconnected|not connected|waiting/i.test(message);

  if (busy) {
    return {
      connected: true,
      connectionText: "Connected",
      readinessText: "Sending",
      detailText: message,
      nextTarget
    };
  }

  if (connected && !disconnected) {
    return {
      connected: true,
      connectionText: "Connected",
      readinessText: "Ready",
      detailText: `Next send is gated for ${nextTarget}`,
      nextTarget
    };
  }

  if (disconnected) {
    return {
      connected: false,
      connectionText: "Waiting for extension",
      readinessText: "Waiting",
      detailText: "Open or reload the extension, then send manually",
      nextTarget
    };
  }

  return {
    connected: false,
    connectionText: "Waiting for extension",
    readinessText: "Ready",
    detailText: message || `Next send is gated for ${nextTarget}`,
    nextTarget
  };
}

function getProviderDisplayList() {
  return [
    { id: "chatgpt", label: "ChatGPT", disabled: false, badge: "Active" },
    { id: "claude", label: "Claude", disabled: false, badge: "Active" },
    { id: "gemini", label: "Gemini", disabled: true, badge: "Future" },
    { id: "grok", label: "Grok", disabled: true, badge: "Future" }
  ];
}

function getNewProjectDraft(defaultPath) {
  return {
    projectName: "",
    projectPath: String(defaultPath || ""),
    packTitle: "",
    branchName: "",
    commitMessage: ""
  };
}

function renderWorkflowStatus() {
  const view = getWorkflowStatusView(latestWorkflowStatus);

  if (elements.connectionPill) {
    elements.connectionPill.dataset.connected = view.connected ? "true" : "false";
  }

  if (elements.connectionText) {
    elements.connectionText.textContent = view.connectionText;
  }

  if (elements.readinessText) {
    elements.readinessText.textContent = view.readinessText;
  }

  if (elements.statusDetail) {
    elements.statusDetail.textContent = view.detailText;
  }

  if (elements.nextTarget) {
    elements.nextTarget.textContent = view.nextTarget;
  }
}

function renderDebateState() {
  const debate = activeDebate || createRootDebateState(elements.currentText ? elements.currentText.value : "");
  const view = getDebateStageView(debate);

  if (elements.currentStage) elements.currentStage.textContent = view.currentStage;
  if (elements.currentProvider) elements.currentProvider.textContent = view.currentProvider;
  if (elements.nextProvider) elements.nextProvider.textContent = view.nextProvider;

  if (elements.roundHistory) {
    if (!view.rounds.length) {
      elements.roundHistory.innerHTML = '<div class="history-empty">No rounds saved yet.</div>';
    } else {
      elements.roundHistory.innerHTML = view.rounds.map((round) => `
          <div class="round-item">
          <div class="round-title">Round ${escapeHtml(round.number)} - ${escapeHtml(round.stage)} - ${escapeHtml(round.provider)}</div>
          <div class="round-subtitle">${escapeHtml(getRoundPreview(round.response)) || "Response saved."}</div>
        </div>
      `).join("");
    }
  }

  latestWorkflowStatus = {
    ...latestWorkflowStatus,
    nextTarget: view.currentProvider
  };
  renderWorkflowStatus();
}

function setBusy(isBusy) {
  elements.triggerButton.disabled = isBusy;
  elements.saveButton.disabled = isBusy;
}

function setVaultBusy(isBusy) {
  elements.generatePackButton.disabled = isBusy;
  elements.refreshVaultButton.disabled = isBusy;
  elements.openLatestPackButton.disabled = isBusy;
}

function resetActionButtons() {
  setBusy(false);
  setVaultBusy(false);
}

function getWorkflowPayload() {
  if (!activeDebate) {
    activeDebate = createRootDebateState(elements.currentText.value);
  }
  return createStageWorkflowPayload(activeDebate, {
    chatgptPrefix: elements.chatgptPrefix.value,
    claudePrefix: elements.claudePrefix.value
  });
}

function getVaultPayload() {
  return {
    projectId: elements.projectSelect.value,
    projectName: elements.projectName.value,
    projectPath: elements.projectPath.value,
    title: elements.packTitle.value,
    sourceText: elements.currentText.value,
    chunkStrategy: elements.chunkStrategy.value,
    chunkCount: elements.chunkCount.value,
    gitMode: elements.gitMode.value,
    branchName: elements.branchName.value,
    commitMessage: elements.commitMessage.value,
    git: {
      remote: elements.gitRemote.value,
      defaultBranch: elements.defaultBranch.value,
      branchPrefix: elements.branchPrefix.value
    }
  };
}

function renderStatus(payload) {
  const message = payload && typeof payload === "object"
    ? String(payload.message || "")
    : String(payload || "");
  const tone = payload && typeof payload === "object"
    ? String(payload.tone || "neutral")
    : "neutral";
  const debateProvider = activeDebate ? getDebateStageView(activeDebate).currentProvider : "";
  const nextTarget = payload && typeof payload === "object"
    ? normalizeNextTarget(debateProvider || payload.nextTarget || latestWorkflowStatus.nextTarget)
    : latestWorkflowStatus.nextTarget;

  if (!message) {
    return;
  }

  latestWorkflowStatus = {
    message,
    tone,
    nextTarget
  };
  renderWorkflowStatus();
  setStatus(message, tone);

  if (tone === "error" || tone === "success") {
    setBusy(false);
    setVaultBusy(false);
  }
}

function triggerWorkflowStep() {
  if (!elements.currentText.value.trim() && (!activeDebate || !activeDebate.raw_idea)) {
    setStatus("Project idea / working plan is empty. Add text before sending.", "error");
    return;
  }

  if (!activeDebate) {
    activeDebate = createRootDebateState(elements.currentText.value);
  } else if (!activeDebate.rounds.length && elements.currentText.value.trim()) {
    activeDebate.raw_idea = elements.currentText.value.trim();
  }

  const payload = getWorkflowPayload();
  const view = getDebateStageView(activeDebate);
  setBusy(true);
  latestWorkflowStatus = {
    message: `Sending ${view.currentStage} to ${view.currentProvider}...`,
    tone: "busy",
    nextTarget: view.currentProvider
  };
  renderWorkflowStatus();
  renderDebateState();
  setStatus("Sending prompt to extension. Continue manually after the response returns.", "busy");
  desktopApi.sendWorkflow(payload);
}

function updateWordCount() {
  if (!elements.wordCount || !elements.currentText) {
    return;
  }

  const words = elements.currentText.value.trim().split(/\s+/).filter(Boolean).length;
  elements.wordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;
}

function saveFinalText() {
  const text = elements.currentText.value;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "ai_final_output.txt";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Final text saved from renderer.", "success");
}

function renderResponse(text) {
  const normalizedText = String(text || "");
  const result = applyDebateResponse(activeDebate || createRootDebateState(elements.currentText.value), normalizedText);
  activeDebate = result.debate;

  elements.currentText.value = normalizedText;
  elements.responseView.innerHTML = renderProjectPlanHtml(normalizedText);
  updateWordCount();
  setBusy(false);
  latestWorkflowStatus = {
    message: "AI response received. Ready for next step.",
    tone: "success",
    nextTarget: result.stageView.currentProvider
  };
  renderDebateState();
  renderWorkflowStatus();
  setStatus("AI response received. Review it, then send the next gated step or generate Codex prompts.", "success");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTaskStatusLabel(status) {
  const normalized = String(status || "ready");
  const labels = {
    copied: "Copied",
    launcher_copied: "Copied",
    in_progress: "In Progress",
    done: "Done",
    ready: "Ready",
    draft: "Draft"
  };

  return labels[normalized] || normalized;
}

function getGitModeLabel(gitMode) {
  const labels = {
    every_chunk: "Commit per task",
    final_only: "Commit on final task",
    none: "No Codex git action"
  };

  return labels[String(gitMode || "")] || "Commit per task";
}

function renderProjectSelect(projects) {
  const currentValue = elements.projectSelect.value;
  elements.projectSelect.innerHTML = '<option value="">New project / manual entry</option>' + projects.map((project) => (
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)} - ${escapeHtml(project.path)}</option>`
  )).join("");

  if (projects.some((project) => project.id === currentValue)) {
    elements.projectSelect.value = currentValue;
  }
}

function applyProject(projectId) {
  const project = (latestVaultState.projects || []).find((item) => item.id === projectId);

  if (!project) {
    return;
  }

  elements.projectName.value = project.name || "";
  elements.projectPath.value = project.path || "";
  elements.gitRemote.value = project.git && project.git.remote ? project.git.remote : "origin";
  elements.defaultBranch.value = project.git && project.git.defaultBranch ? project.git.defaultBranch : "main";
  elements.branchPrefix.value = project.git && project.git.branchPrefix ? project.git.branchPrefix : "codex/";
  elements.gitMode.value = project.defaults && project.defaults.gitMode ? project.defaults.gitMode : "every_chunk";
  elements.chunkStrategy.value = project.defaults && project.defaults.chunkStrategy ? project.defaults.chunkStrategy : "simple_3";
  elements.chunkCount.value = project.defaults && project.defaults.chunkCount ? String(project.defaults.chunkCount) : "3";
  elements.commitMessage.value = project.defaults && project.defaults.commitMessage ? project.defaults.commitMessage : "";
}

function renderVaultState(state) {
  latestVaultState = state || {
    projects: [],
    promptPacks: []
  };

  const packs = Array.isArray(latestVaultState.promptPacks) ? latestVaultState.promptPacks : [];
  const projects = Array.isArray(latestVaultState.projects) ? latestVaultState.projects : [];

  renderProjectSelect(projects);
  setVaultBusy(false);

  if (packs.length === 0) {
    elements.packList.innerHTML = "<div class=\"pack-card\">No Codex prompts generated yet.</div>";
    return;
  }

  const latestPack = packs[0];
  const olderPacks = packs.slice(1);
  const latestProject = projects.find((item) => item.id === latestPack.projectId);
  const latestTasks = Array.isArray(latestPack.chunks) ? latestPack.chunks : [];
  const taskHtml = latestTasks.map((task) => {
    const statusLabel = getTaskStatusLabel(task.status);
    const copiedClass = task.status === "launcher_copied" || task.status === "copied" ? " is-copied" : "";

    return `
      <div class="task-card${copiedClass}">
        <div>
          <div class="task-title">
            <span>[${String(task.order).padStart(3, "0")}] ${escapeHtml(task.title)}</span>
            <span class="status-pill">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="task-subtitle">
            ${escapeHtml(task.scope || (task.tasks || [])[0] || "Focused Codex handoff task.")}
          </div>
        </div>
        <div class="task-actions">
          <button class="copy-btn" type="button" data-action="copy-launcher" data-pack-id="${escapeHtml(latestPack.id)}" data-chunk-id="${escapeHtml(task.id)}">
            <span aria-hidden="true">[]</span>
            ${task.status === "launcher_copied" ? "Copy Again" : "Copy Codex Start"}
          </button>
          <button class="progress-btn" type="button" data-action="mark-progress" data-pack-id="${escapeHtml(latestPack.id)}" data-chunk-id="${escapeHtml(task.id)}">
            <span aria-hidden="true">o</span>
            In Progress
          </button>
          <button class="done-btn" type="button" data-action="mark-done" data-pack-id="${escapeHtml(latestPack.id)}" data-chunk-id="${escapeHtml(task.id)}">
            <span aria-hidden="true">ok</span>
            Done
          </button>
        </div>
      </div>
    `;
  }).join("");
  const historyHtml = olderPacks.length
    ? `
      <details class="history-section">
        <summary>Previous prompt sets (${olderPacks.length})</summary>
        <div class="history-list">
          ${olderPacks.map((pack) => {
            const project = projects.find((item) => item.id === pack.projectId);
            return `
              <div class="history-item">
                <div>
                  <strong>${escapeHtml(pack.title)}</strong>
                  <span>Project: ${escapeHtml(project ? project.name : "Unknown")} | Branch: ${escapeHtml(pack.branchName)} | Tasks: ${Array.isArray(pack.chunks) ? pack.chunks.length : 0}</span>
                </div>
                <button class="danger-btn compact-btn" type="button" data-action="delete-pack" data-pack-id="${escapeHtml(pack.id)}" data-pack-title="${escapeHtml(pack.title)}">Delete</button>
              </div>
            `;
          }).join("")}
        </div>
      </details>
    `
    : "";

  elements.packList.innerHTML = `
    <article class="pack-card latest-pack">
      <h3>Latest Codex Prompts</h3>
      <div class="pack-meta">
        <span class="pack-meta-item"><span aria-hidden="true">[ ]</span> Project: ${escapeHtml(latestProject ? latestProject.name : "Unknown")}</span>
        <span class="pack-meta-item"><span aria-hidden="true">/</span> Branch: ${escapeHtml(latestPack.branchName)}</span>
        <span class="pack-meta-item"><span aria-hidden="true">=</span> Git: ${escapeHtml(getGitModeLabel(latestPack.gitMode))}</span>
      </div>
      <div class="actions" style="margin: 0 0 10px;">
        <button class="secondary-btn" type="button" data-action="open-folder" data-folder-path="${escapeHtml(latestPack.exportPath)}">Open Prompt Folder</button>
        <button class="danger-btn" type="button" data-action="delete-pack" data-pack-id="${escapeHtml(latestPack.id)}" data-pack-title="${escapeHtml(latestPack.title)}">Delete Latest Prompts</button>
      </div>
      <div class="task-list">${taskHtml}</div>
    </article>
    ${historyHtml}
  `;
}

async function refreshVaultState() {
  setVaultBusy(true);

  try {
    const response = await desktopApi.getVaultState();

    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not load prompt vault state.");
    }

    renderVaultState(response.state);
  } finally {
    setVaultBusy(false);
  }
}

async function generatePromptPack() {
  const payload = getVaultPayload();

  if (!payload.sourceText.trim()) {
    setStatus("Project idea / working plan is empty. Generate or paste a plan before creating Codex prompts.", "error");
    return;
  }

  if (!payload.projectName.trim() || !payload.projectPath.trim()) {
    setStatus("Project name and project path are required.", "error");
    return;
  }

  setVaultBusy(true);
  setStatus("Generating Codex prompts...", "busy");

  try {
    const response = await desktopApi.generatePromptPack(payload);

    if (!response || response.ok === false) {
      throw new Error(response && response.error ? response.error : "Could not generate Codex prompts.");
    }

    renderVaultState(response.state);
    elements.projectSelect.value = response.project.id;
    setStatus(`Codex prompts generated: ${response.pack.exportPath}`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setVaultBusy(false);
  }
}

async function copyChunk(packId, chunkId) {
  const response = await desktopApi.copyChunk({
    packId,
    chunkId
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not copy prompt task.");
  }

  renderVaultState(response.state);
}

async function copyLauncher(packId, chunkId) {
  const response = await desktopApi.copyLauncher({
    packId,
    chunkId
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not copy Codex start.");
  }

  renderVaultState(response.state);
}

async function markChunk(packId, chunkId, status) {
  const response = await desktopApi.markChunk({
    packId,
    chunkId,
    status
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not update prompt task status.");
  }

  renderVaultState(response.state);
  setStatus(`Task marked ${getTaskStatusLabel(status)}.`, "success");
}

async function openFolder(folderPath) {
  const response = await desktopApi.openFolder({
    folderPath
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not open folder.");
  }
}

async function deletePack(packId, packTitle) {
  const title = packTitle || "these Codex prompts";
  const confirmed = window.confirm(`Delete "${title}" from Prompt Vault?\n\nExported files on disk will not be deleted.`);

  if (!confirmed) {
    return;
  }

  const response = await desktopApi.deletePack({
    packId
  });

  if (!response || response.ok === false) {
    throw new Error(response && response.error ? response.error : "Could not delete Codex prompts.");
  }

  renderVaultState(response.state);
  setStatus(`Deleted Codex prompts: ${title}.`, "success");
}

async function openLatestPackFolder() {
  const packs = Array.isArray(latestVaultState.promptPacks) ? latestVaultState.promptPacks : [];

  if (!packs[0] || !packs[0].exportPath) {
    setStatus("No Codex prompt folder exists yet.", "error");
    return;
  }

  try {
    await openFolder(packs[0].exportPath);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function handlePackListClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const action = button.dataset.action;

  try {
    if (action === "copy-launcher") {
      await copyLauncher(button.dataset.packId, button.dataset.chunkId);
      setStatus("Codex start copied to clipboard.", "success");
      return;
    }

    if (action === "copy-chunk") {
      await copyChunk(button.dataset.packId, button.dataset.chunkId);
      setStatus("Full Codex prompt copied to clipboard.", "success");
      return;
    }

    if (action === "mark-progress") {
      await markChunk(button.dataset.packId, button.dataset.chunkId, "in_progress");
      return;
    }

    if (action === "mark-done") {
      await markChunk(button.dataset.packId, button.dataset.chunkId, "done");
      return;
    }

    if (action === "open-folder") {
      await openFolder(button.dataset.folderPath);
      return;
    }

    if (action === "delete-pack") {
      await deletePack(button.dataset.packId, button.dataset.packTitle);
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function installDomReferences() {
  elements.chatgptPrefix = byId("chatgptPrefix");
  elements.claudePrefix = byId("claudePrefix");
  elements.currentText = byId("currentText");
  elements.wordCount = byId("wordCount");
  elements.projectSelect = byId("projectSelect");
  elements.projectName = byId("projectName");
  elements.projectPath = byId("projectPath");
  elements.packTitle = byId("packTitle");
  elements.chunkStrategy = byId("chunkStrategy");
  elements.chunkCount = byId("chunkCount");
  elements.gitRemote = byId("gitRemote");
  elements.defaultBranch = byId("defaultBranch");
  elements.branchPrefix = byId("branchPrefix");
  elements.gitMode = byId("gitMode");
  elements.branchName = byId("branchName");
  elements.commitMessage = byId("commitMessage");
  elements.triggerButton = byId("triggerWorkflowBtn");
  elements.saveButton = byId("saveFinalBtn");
  elements.generatePackButton = byId("generatePackBtn");
  elements.refreshVaultButton = byId("refreshVaultBtn");
  elements.openLatestPackButton = byId("openLatestPackBtn");
  elements.status = byId("status");
  elements.connectionPill = byId("connectionPill");
  elements.connectionText = byId("connectionText");
  elements.readinessText = byId("readinessText");
  elements.statusDetail = byId("statusDetail");
  elements.nextTarget = byId("nextTarget");
  elements.currentStage = byId("currentStage");
  elements.currentProvider = byId("currentProvider");
  elements.nextProvider = byId("nextProvider");
  elements.responseView = byId("responseView");
  elements.roundHistory = byId("roundHistory");
  elements.packList = byId("packList");
}

function installEventListeners() {
  elements.triggerButton.addEventListener("click", triggerWorkflowStep);
  elements.saveButton.addEventListener("click", saveFinalText);
  elements.currentText.addEventListener("input", updateWordCount);
  elements.generatePackButton.addEventListener("click", generatePromptPack);
  elements.refreshVaultButton.addEventListener("click", () => {
    refreshVaultState().catch((error) => setStatus(error.message, "error"));
  });
  elements.openLatestPackButton.addEventListener("click", openLatestPackFolder);
  elements.packList.addEventListener("click", handlePackListClick);
  elements.projectSelect.addEventListener("change", () => applyProject(elements.projectSelect.value));

  desktopApi.onResponse((text) => {
    renderResponse(text);
  });

  desktopApi.onStatus((payload) => {
    renderStatus(payload);
  });

  desktopApi.onVaultState((state) => {
    renderVaultState(state);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    installDomReferences();
    installEventListeners();
    resetActionButtons();
    setStatus("Waiting for Chrome extension WebSocket connection...", "neutral");
    activeDebate = createRootDebateState(elements.currentText.value);
    renderDebateState();
    renderWorkflowStatus();
    updateWordCount();
    refreshVaultState().catch((error) => setStatus(error.message, "error"));
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    getTaskStatusLabel,
    getWorkflowStatusView,
    getProviderDisplayList,
    getNewProjectDraft,
    createRootDebateState,
    createStageWorkflowPayload,
    applyDebateResponse,
    getDebateStageView,
    renderProjectPlanHtml,
    getRoundPreview
  };
}
