(function () {
  const { KANBAN_STATUSES, getActiveProject, getActiveTask, getActiveDebate, hasUnresolvedBlockers } = window.NextStepState;
  const COLUMN_LABELS = { clarification: "Clarification", ai_loop: "AI Loop", ready_for_codex: "Ready for Codex", done: "Done" };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTs(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString();
  }

  function list(items) {
    return Array.isArray(items) && items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : '<p class="muted">-</p>';
  }

  function nextAction(task) {
    if (!task) return "Create task";
    if (task.status === "done") return "Done";
    if (task.status === "ready_for_codex") return "Mark step done";
    const latest = Array.isArray(task.ai_rounds) && task.ai_rounds.length ? task.ai_rounds[task.ai_rounds.length - 1] : null;
    if (!task.user_inputs?.goal) return "Complete clarification";
    if (!latest) return "Run AI";
    if (latest.parse_ok && hasUnresolvedBlockers(task)) return "Decide blockers";
    if (latest.parse_ok && task.status !== "ready_for_codex") return "Finalize plan";
    return "Run AI";
  }

  function renderProjects(state) {
    const options = state.projects
      .map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === state.active_project_id ? "selected" : ""}>${escapeHtml(project.name)}</option>`)
      .join("");

    return `<section class="panel"><h2>Projects</h2>
      <form data-form="create-project" class="stacked-form">
        <input name="project_name" placeholder="Project name" required />
        <input name="project_description" placeholder="Description (optional)" />
        <button type="submit">Create Project</button>
      </form>
      <label class="block-label">Select project</label>
      <select data-action="select-project"><option value="">No project selected</option>${options}</select>
      <div class="button-row">
        <button type="button" data-action="export-state">Export JSON</button>
        <button type="button" data-action="import-state">Import JSON</button>
      </div>
    </section>`;
  }

  function renderTaskBoard(state) {
    const byStatus = new Map(KANBAN_STATUSES.map((s) => [s, []]));
    state.tasks.filter((t) => t.project_id === state.active_project_id).forEach((t) => (byStatus.get(t.status) || byStatus.get("clarification")).push(t));

    return `<section class="panel"><h2>Tasks</h2>
      <form data-form="create-task" class="stacked-form">
        <input name="task_title" placeholder="Task title" required />
        <textarea name="task_raw_idea" placeholder="Raw idea"></textarea>
        <button type="submit">Create Task</button>
      </form>
      <div class="columns">${KANBAN_STATUSES.map((s) => `<div class="column"><h3>${COLUMN_LABELS[s]}</h3><div class="task-list">${(byStatus.get(s) || []).map((t) => `<button class="task-item ${t.id === state.active_task_id ? "active" : ""}" data-action="select-task" data-task-id="${escapeHtml(t.id)}">${escapeHtml(t.title)}</button>`).join("") || '<p class="muted">No tasks</p>'}</div></div>`).join("")}</div>
    </section>`;
  }

  function renderToggle(name, label, checked) {
    return `<label class="check-row"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} /><span>${label}</span></label>`;
  }

  function renderDebateLab(state) {
    const debates = Array.isArray(state.debates) ? state.debates : [];
    const active = getActiveDebate(state);
    const listHtml = debates.length
      ? debates.map((debate) => `<button type="button" class="task-item ${active && debate.id === active.id ? "active" : ""}" data-action="select-debate" data-debate-id="${escapeHtml(debate.id)}">${escapeHtml(debate.title || "Untitled debate")}</button>`).join("")
      : '<p class="muted">No debates yet.</p>';

    return `<section class="panel debate-lab"><h2>Debate Lab</h2>
      <div class="debate-grid">
        <div>
          <h3>Create Debate</h3>
          <form data-form="create-debate" class="stacked-form">
            <input name="debate_title" placeholder="Title" required />
            <textarea name="debate_raw_idea" placeholder="Raw idea"></textarea>
            <textarea name="debate_goal" placeholder="Goal"></textarea>
            <label class="block-label">Target rounds</label>
            <input type="number" min="1" max="12" name="debate_target_rounds" value="4" />
            <button type="submit">Create Debate</button>
          </form>
          <h3>Debates</h3>
          <div class="task-list">${listHtml}</div>
        </div>
        <div>${active ? renderActiveDebate(active) : '<p class="muted">Select or create a debate to start planning.</p>'}</div>
      </div>
    </section>`;
  }

  function renderActiveDebate(debate) {
    const current = Array.isArray(debate.rounds) && debate.rounds.length ? debate.rounds[Number(debate.active_round_index || 0)] || debate.rounds[debate.rounds.length - 1] : null;
    const participants = (debate.participants || []).map((p) => `<li>${escapeHtml(p.name)} <span class="muted">${escapeHtml(p.role)} / ${escapeHtml(p.provider)} / ${escapeHtml(p.mode)}</span></li>`).join("");
    const rounds = (debate.rounds || []).map((round, idx) => `<button type="button" class="round-row ${current && round.id === current.id ? "active" : ""}" data-action="select-debate-round" data-debate-id="${escapeHtml(debate.id)}" data-round-id="${escapeHtml(round.id)}">
        <span>Round ${Number(round.round_number || idx + 1)}: ${escapeHtml(round.type || "plan")}</span>
        <span class="${round.parse_ok ? "muted" : "error"}">${round.response ? round.parse_ok ? "parsed" : "saved" : "draft"}</span>
      </button>`).join("");
    const finalPrompts = Array.isArray(debate.final_megaprompts) ? debate.final_megaprompts : [];
    const logs = (debate.logs || []).slice().reverse().map((log) => `<li><strong>[${escapeHtml(log.level || "info")}]</strong> ${escapeHtml(log.message || "")} <span class="muted">${escapeHtml(formatTs(log.created_at))}</span></li>`).join("");

    return `<div class="debate-detail">
      <div class="meta-grid">
        <p><strong>Raw idea:</strong> ${escapeHtml(debate.raw_idea || "-")}</p>
        <p><strong>Goal:</strong> ${escapeHtml(debate.goal || "-")}</p>
        <p><strong>Status:</strong> ${escapeHtml(debate.status || "draft")}</p>
        <p><strong>Target rounds:</strong> ${Number(debate.target_rounds || 4)}</p>
      </div>
      <h3>Participants</h3>
      <ul class="logs compact">${participants || '<li class="muted">No participants.</li>'}</ul>
      <h3>Round Timeline</h3>
      <div class="round-list">${rounds || '<p class="muted">No rounds yet.</p>'}</div>
      <h3>Current Prompt</h3>
      <div class="button-row wide-buttons">
        <button type="button" data-action="generate-research-prompt" data-debate-id="${escapeHtml(debate.id)}">Generate Research Prompt</button>
        <button type="button" data-action="generate-initial-plan-prompt" data-debate-id="${escapeHtml(debate.id)}">Generate Initial Plan Prompt</button>
        <button type="button" data-action="generate-critic-prompt" data-debate-id="${escapeHtml(debate.id)}">Generate Critic Prompt</button>
        <button type="button" data-action="generate-improve-prompt" data-debate-id="${escapeHtml(debate.id)}">Generate Improve Prompt</button>
        <button type="button" data-action="generate-consensus-prompt" data-debate-id="${escapeHtml(debate.id)}">Generate Consensus Prompt</button>
        <button type="button" data-action="copy-debate-prompt" data-debate-id="${escapeHtml(debate.id)}">Copy Current Prompt</button>
      </div>
      <pre class="preview tall">${escapeHtml(current?.prompt || "")}</pre>
      <h3>Response</h3>
      <textarea data-role="debate-response-editor" data-debate-id="${escapeHtml(debate.id)}" data-round-id="${escapeHtml(current?.id || "")}">${escapeHtml(current?.response || "")}</textarea>
      <div class="button-row wide-buttons">
        <button type="button" data-action="paste-debate-response" data-debate-id="${escapeHtml(debate.id)}">Paste Response</button>
        <button type="button" data-action="save-debate-response" data-debate-id="${escapeHtml(debate.id)}">Save Response as Round</button>
        <button type="button" data-action="run-current-round" data-debate-id="${escapeHtml(debate.id)}">Run Current Round</button>
        <button type="button" data-action="cancel-debate-round" data-debate-id="${escapeHtml(debate.id)}">Cancel Round</button>
        <button type="button" data-action="retry-debate-round" data-debate-id="${escapeHtml(debate.id)}">Retry Round</button>
        <button type="button" data-action="mark-manual-complete" data-debate-id="${escapeHtml(debate.id)}">Mark Manual Complete</button>
      </div>
      <h3>Consensus Preview</h3>
      <div class="button-row wide-buttons">
        <button type="button" data-action="parse-consensus" data-debate-id="${escapeHtml(debate.id)}">Parse Consensus</button>
        <button type="button" data-action="generate-final-megaprompts" data-debate-id="${escapeHtml(debate.id)}">Generate Final MegaPrompts</button>
        <button type="button" data-action="export-project-pack" data-debate-id="${escapeHtml(debate.id)}">Export Project Pack JSON</button>
      </div>
      <pre class="preview tall">${escapeHtml(debate.consensus ? JSON.stringify(debate.consensus, null, 2) : "")}</pre>
      <h3>Final MegaPrompts</h3>
      <div class="final-prompts">${finalPrompts.length ? finalPrompts.map((item) => `<div class="stage-card">
        <label class="step-row"><input type="checkbox" ${item.done ? "checked" : ""} data-action="mark-stage-done" data-debate-id="${escapeHtml(debate.id)}" data-stage-index="${Number(item.stage_index || 0)}" /><span>${item.done ? "[x]" : "[ ]"} ${escapeHtml(item.title || "Stage")}</span></label>
        <div class="button-row"><button type="button" data-action="copy-final-megaprompt" data-debate-id="${escapeHtml(debate.id)}" data-stage-index="${Number(item.stage_index || 0)}">Copy MegaPrompt</button></div>
        <pre class="preview">${escapeHtml(item.prompt || "")}</pre>
      </div>`).join("") : '<p class="muted">No final megaprompts generated.</p>'}</div>
      <h3>Debate Logs</h3>
      <ul class="logs">${logs || '<li class="muted">No logs yet</li>'}</ul>
    </div>`;
  }

  function renderSettings(state) {
    const m = state.metrics || {};
    return `<details class="panel"><summary>Settings (Advanced)</summary>
      <p class="risk-notice">Browser Auto Mode controls a logged-in browser session. It may stop working if the provider changes its UI or blocks automation. Use at your own risk. No stealth or bypass is used.</p>
      <label class="block-label">Default provider</label>
      <select data-action="settings-provider"><option value="chatgpt" selected>ChatGPT</option></select>
      <label class="block-label">AI response timeout (minutes)</label>
      <input type="number" min="1" max="30" data-action="settings-ai-timeout" value="${Number(state.settings?.max_ai_run_minutes || 3)}" />
      <label class="block-label">Login timeout (minutes)</label>
      <input type="number" min="1" max="30" data-action="settings-login-timeout" value="${Number(state.settings?.login_timeout_minutes || 2)}" />
      ${renderToggle("x", "Keep browser open after run", Boolean(state.settings?.keep_browser_open_after_run)).replace('name="x"', 'data-action="settings-keep-open"')}
      ${renderToggle("y", "Save failure screenshots", Boolean(state.settings?.save_failure_screenshots)).replace('name="y"', 'data-action="settings-save-screens"')}
      ${renderToggle("z", "Local metrics enabled", Boolean(state.settings?.local_metrics_enabled)).replace('name="z"', 'data-action="settings-local-metrics"')}
      <label class="block-label">Browser channel preference</label>
      <select data-action="settings-browser-pref">
        <option value="chrome_first" ${(state.settings?.browser_channel_preference || "chrome_first") === "chrome_first" ? "selected" : ""}>Chrome first</option>
        <option value="edge_first" ${(state.settings?.browser_channel_preference || "chrome_first") === "edge_first" ? "selected" : ""}>Edge first</option>
      </select>
      <h3>Metrics</h3>
      <ul class="logs">
        <li>ai_runs_total: ${m.ai_runs_total || 0}</li>
        <li>ai_runs_success: ${m.ai_runs_success || 0}</li>
        <li>ai_runs_failed: ${m.ai_runs_failed || 0}</li>
        <li>parse_failures: ${m.parse_failures || 0}</li>
        <li>timeout_failures: ${m.timeout_failures || 0}</li>
        <li>login_required_count: ${m.login_required_count || 0}</li>
        <li>manual_fallback_count: ${m.manual_fallback_count || 0}</li>
        <li>average_response_ms: ${m.average_response_ms || 0}</li>
      </ul>
      <label class="block-label">Selectors JSON</label>
      <textarea data-action="selectors-editor" rows="8">${escapeHtml(state.settings?.selectors_editor_json || "{}")}</textarea>
      <div class="button-row"><button type="button" data-action="selectors-save">Save selectors</button><button type="button" data-action="selectors-reset">Reset selectors</button></div>
      <p class="muted">${escapeHtml(state.settings?.selectors_status_message || "")}</p>
    </details>`;
  }

  function renderManualResponsePanel(task) {
    return `<section class="panel"><h3>Manual Response Test</h3>
      <textarea data-role="manual-response-editor" data-task-id="${escapeHtml(task.id)}">${escapeHtml(task.manual_response_draft || "")}</textarea>
      <div class="button-row">
        <button type="button" data-action="paste-manual-response" data-task-id="${escapeHtml(task.id)}">Paste Manual Response</button>
        <button type="button" data-action="parse-manual-response" data-task-id="${escapeHtml(task.id)}">Parse Manual Response</button>
      </div>
    </section>`;
  }

  function renderCodexPanel(task) {
    if (task.status !== "ready_for_codex") return "";
    const latest = [...(task.ai_rounds || [])].reverse().find((r) => r.parse_ok && r.parsed && r.parsed.plan);
    const steps = latest?.parsed?.plan?.implementation_steps || [];
    const done = new Set(task.completed_steps_indexes || []);
    const selected = Number(task.selected_codex_step_index || 0);
    return `<section class="panel"><h3>Codex Steps</h3>
      <div class="steps-list">${steps.map((step, idx) => `<label class="step-row ${idx === selected ? "selected" : ""}"><input type="radio" name="codex-step" data-action="select-codex-step" data-task-id="${escapeHtml(task.id)}" value="${idx}" ${idx === selected ? "checked" : ""} /><span>${done.has(idx) ? "[x]" : "[ ]"} ${escapeHtml(step)}</span></label>`).join("")}</div>
      <div class="button-row"><button type="button" data-action="generate-codex-prompt">Generate Codex Prompt</button><button type="button" data-action="copy-codex-prompt">Copy Codex Prompt</button><button type="button" data-action="mark-step-done">Mark Step Done</button></div>
      <pre class="preview">${escapeHtml(task.final_codex_prompt || "")}</pre>
    </section>`;
  }

  function renderFlawsPanel(task) {
    const flaws = Array.isArray(task.processed_flaws) ? task.processed_flaws : [];
    return `<section class="panel"><h3>Flaws</h3>${flaws.length ? flaws.map((f) => `<div class="flaw-card"><p><strong>${escapeHtml(f.title || "(untitled)")}</strong></p><p>${escapeHtml(f.category)} / ${escapeHtml(f.verdict)}</p><p>${escapeHtml(f.why_it_matters || "")}</p><p>${escapeHtml(f.recommended_action || "")}</p><p><strong>Decision:</strong> ${escapeHtml(f.user_decision || "none")}</p><input data-action="flaw-note" data-flaw-id="${escapeHtml(f.id)}" value="${escapeHtml(f.user_note || "")}" placeholder="Optional note" /><div class="button-row"><button type="button" data-action="flaw-decision" data-task-id="${escapeHtml(task.id)}" data-flaw-id="${escapeHtml(f.id)}" data-decision="accept">Accept</button><button type="button" data-action="flaw-decision" data-task-id="${escapeHtml(task.id)}" data-flaw-id="${escapeHtml(f.id)}" data-decision="later">Later</button><button type="button" data-action="flaw-decision" data-task-id="${escapeHtml(task.id)}" data-flaw-id="${escapeHtml(f.id)}" data-decision="ignore">Ignore</button><button type="button" data-action="flaw-decision" data-task-id="${escapeHtml(task.id)}" data-flaw-id="${escapeHtml(f.id)}" data-decision="subtask">Subtask</button></div></div>`).join("") : '<p class="muted">No flaws.</p>'}</section>`;
  }

  function renderAiResult(task) {
    const latest = Array.isArray(task.ai_rounds) && task.ai_rounds.length ? task.ai_rounds[task.ai_rounds.length - 1] : null;
    if (!latest) return '<section class="panel"><h3>AI Result</h3><p class="muted">No AI result yet.</p></section>';
    if (!latest.parse_ok) {
      return `<section class="panel"><h3>AI Result</h3><p><strong>Parse:</strong> failed</p><p class="error">${escapeHtml(latest.parse_error || "Unable to parse")}</p><textarea data-role="raw-editor" data-task-id="${escapeHtml(task.id)}">${escapeHtml(latest.raw_response || "")}</textarea><div class="button-row"><button type="button" data-action="paste-response" data-task-id="${escapeHtml(task.id)}">Paste Response</button><button type="button" data-action="retry-parse" data-task-id="${escapeHtml(task.id)}">Retry Parse</button><button type="button" data-action="copy-raw" data-task-id="${escapeHtml(task.id)}">Copy Raw</button><button type="button" data-action="retry-ai" data-task-id="${escapeHtml(task.id)}">Run Again</button></div><div class="button-row"><button type="button" data-action="retry-extraction" data-task-id="${escapeHtml(task.id)}">Retry Extraction</button></div></section>`;
    }

    const parsed = latest.parsed;
    return `<section class="panel"><h3>AI Result</h3><p><strong>Parse:</strong> ok</p><p><strong>Goal:</strong> ${escapeHtml(parsed.plan.goal)}</p><p><strong>Context:</strong> ${escapeHtml(parsed.plan.context)}</p><h4>Decisions</h4>${list(parsed.plan.decisions)}<h4>Architecture</h4>${list(parsed.plan.architecture)}<h4>Implementation Steps</h4>${list(parsed.plan.implementation_steps)}<h4>Acceptance Criteria</h4>${list(parsed.plan.acceptance_criteria)}<h4>Test Plan</h4>${list(parsed.plan.test_plan)}<h4>Summary</h4><p>${escapeHtml(parsed.summary.reason || "")}</p><div class="button-row"><button type="button" data-action="finalize-plan" data-task-id="${escapeHtml(task.id)}">Finalize Plan</button></div></section>`;
  }

  function renderTaskDetail(state) {
    const activeProject = getActiveProject(state);
    const task = getActiveTask(state);
    if (!task) return `<section class="panel"><h2>Task Detail</h2><p class="muted">Select/create a task.</p></section>${renderSettings(state)}`;

    const options = KANBAN_STATUSES.map((s) => `<option value="${s}" ${s === task.status ? "selected" : ""}>${COLUMN_LABELS[s]}</option>`).join("");
    const logs = (task.logs || []).slice().reverse().map((log) => `<li><strong>[${escapeHtml(log.level || "info")}]</strong> ${escapeHtml(log.message || "")} <span class="muted">${escapeHtml(formatTs(log.created_at))}</span></li>`).join("");

    return `<section class="panel"><h2>Task Detail</h2>
      <p><strong>Project:</strong> ${escapeHtml(activeProject ? activeProject.name : "Unknown")}</p>
      <p><strong>Title:</strong> ${escapeHtml(task.title)}</p>
      <p><strong>Raw idea:</strong> ${escapeHtml(task.raw_idea || "-")}</p>
      <p><strong>Next Step:</strong> ${escapeHtml(nextAction(task))}</p>
      <label class="block-label">Status</label>
      <select data-action="set-task-status" data-task-id="${escapeHtml(task.id)}">${options}</select>
    </section>
    <section class="panel"><h3>Clarification</h3>
      <form data-form="save-clarification" data-task-id="${escapeHtml(task.id)}" class="stacked-form">
        <input name="goal" placeholder="Goal" value="${escapeHtml(task.user_inputs?.goal || "")}" />
        <textarea name="input_output" placeholder="Input / Output">${escapeHtml(task.user_inputs?.input_output || "")}</textarea>
        <textarea name="out_of_scope" placeholder="Out of scope">${escapeHtml(task.user_inputs?.out_of_scope || "")}</textarea>
        <div class="toggle-grid">${renderToggle("toggle_new_ui", "new UI", Boolean(task.user_inputs?.toggles?.new_ui))}${renderToggle("toggle_database", "database", Boolean(task.user_inputs?.toggles?.database))}${renderToggle("toggle_security", "security / user data", Boolean(task.user_inputs?.toggles?.security))}${renderToggle("toggle_monolith_risk", "monolith risk", Boolean(task.user_inputs?.toggles?.monolith_risk))}${renderToggle("toggle_overengineering_risk", "overengineering risk", Boolean(task.user_inputs?.toggles?.overengineering_risk))}${renderToggle("toggle_tests", "tests required", Boolean(task.user_inputs?.toggles?.tests))}</div>
        <div class="button-row"><button type="submit">Save Clarification</button><button type="button" data-action="generate-mega-prompt" data-task-id="${escapeHtml(task.id)}">Generate Mega-Prompt</button><button type="button" data-action="copy-prompt" data-task-id="${escapeHtml(task.id)}">Copy Prompt</button><button type="button" data-action="run-ai" data-task-id="${escapeHtml(task.id)}">Run AI</button></div>
        <div class="button-row"><button type="button" data-action="cancel-run">Cancel Run</button><button type="button" data-action="open-chatgpt">Open ChatGPT</button></div>
      </form>
      <pre class="preview">${escapeHtml(task.current_prompt || "")}</pre>
      <p><strong>AI worker status:</strong> ${escapeHtml(task.ai_worker_status || "idle")}</p>
      ${task.ai_worker_error ? `<p class="error">${escapeHtml(task.ai_worker_error)}</p>` : ""}
    </section>
    ${renderManualResponsePanel(task)}${renderAiResult(task)}${renderFlawsPanel(task)}${renderCodexPanel(task)}
    <section class="panel"><h3>Logs</h3><ul class="logs">${logs || '<li class="muted">No logs yet</li>'}</ul></section>
    ${renderSettings(state)}`;
  }

  function renderApp(rootEl, state) {
    rootEl.innerHTML = `<div class="app-shell"><header class="top-bar"><h1>NextStep</h1><p>Browser Auto Planning MVP</p></header><div class="layout-left">${renderProjects(state)}</div><div class="layout-main">${renderDebateLab(state)}${renderTaskBoard(state)}</div><div class="layout-right">${renderTaskDetail(state)}</div></div>`;
  }

  window.NextStepRender = { renderApp };
})();
