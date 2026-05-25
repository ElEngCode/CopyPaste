(function () {
  const {
    createProject,
    createTask,
    selectProject,
    selectTask,
    selectDebate,
    moveTaskToStatus,
    addTaskLog,
    addDebateLog,
    getActiveTask,
    getActiveDebate,
    updateTask,
    addDebateRound,
    updateDebateRound,
    createTaskFromFlaw,
    finalizePlan,
    createDebate
  } = window.NextStepState;
  const { renderApp } = window.NextStepRender;
  const { generateMegaPrompt, generateCodexPrompt } = window.NextStepPrompts;
  const {
    generateResearchPrompt,
    generateInitialPlanPrompt,
    generateCriticPrompt,
    generateImprovePrompt,
    generateConsensusPrompt,
    generateFinalMegaPrompts
  } = window.NextStepDebatePrompts;
  const { parsePlanningResponse } = window.NextStepParser;

  let appState = null;
  let saving = false;
  let pendingSave = false;

  function nowIso() { return new Date().toISOString(); }
  function touchState() { appState.updated_at = nowIso(); }

  function bumpMetric(name, amount = 1) {
    if (!appState.metrics) appState.metrics = {};
    appState.metrics[name] = Number(appState.metrics[name] || 0) + amount;
  }

  function updateAverageResponseMs(nextMs) {
    const total = Number(appState.metrics.ai_runs_success || 0);
    const currentAvg = Number(appState.metrics.average_response_ms || 0);
    if (total <= 0) {
      appState.metrics.average_response_ms = Math.max(0, Math.round(nextMs));
      return;
    }
    appState.metrics.average_response_ms = Math.round(((currentAvg * (total - 1)) + nextMs) / total);
  }

  async function persistState() {
    if (saving) { pendingSave = true; return; }
    saving = true;
    try { appState = await window.nextstepStorage.saveState(appState); }
    finally {
      saving = false;
      if (pendingSave) {
        pendingSave = false;
        await persistState();
      }
    }
  }

  async function mutateAndRender(mutator) {
    mutator();
    touchState();
    renderApp(document.getElementById("app"), appState);
    await persistState();
  }

  function getLatestParsedRound(task) {
    return [...(task.ai_rounds || [])].reverse().find((r) => r.parse_ok && r.parsed && r.parsed.plan) || null;
  }

  function getLatestRound(task) {
    return Array.isArray(task.ai_rounds) && task.ai_rounds.length ? task.ai_rounds[task.ai_rounds.length - 1] : null;
  }

  function getDebateById(debateId) {
    return (appState.debates || []).find((debate) => debate.id === debateId) || null;
  }

  function getActiveDebateRound(debate) {
    if (!debate || !Array.isArray(debate.rounds) || !debate.rounds.length) return null;
    return debate.rounds[Number(debate.active_round_index || 0)] || debate.rounds[debate.rounds.length - 1];
  }

  function getLatestDebateRoundByType(debate, type) {
    if (!debate || !Array.isArray(debate.rounds)) return null;
    return [...debate.rounds].reverse().find((round) => round.type === type && round.response) || null;
  }

  function getLatestDebateResponse(debate, types) {
    if (!debate || !Array.isArray(debate.rounds)) return "";
    const allowed = new Set(types);
    const round = [...debate.rounds].reverse().find((item) => allowed.has(item.type) && item.response);
    return round ? round.response : "";
  }

  function upsertDebatePrompt(debate, type, participantId, prompt) {
    const latest = Array.isArray(debate.rounds) && debate.rounds.length ? debate.rounds[debate.rounds.length - 1] : null;
    const patch = {
      type,
      participant_id: participantId,
      prompt,
      response: latest && !latest.response ? latest.response : "",
      parsed: null,
      parse_ok: false,
      parse_error: null
    };

    if (latest && !latest.response && latest.type === type) {
      return updateDebateRound(appState, debate.id, latest.id, patch);
    }
    return addDebateRound(appState, debate.id, patch);
  }

  function generateDebatePrompt(debate, type) {
    if (type === "research") return { prompt: generateResearchPrompt(debate), participantId: "planner" };
    if (type === "plan") {
      const researchText = debate.research_summary || getLatestDebateResponse(debate, ["research"]);
      return { prompt: generateInitialPlanPrompt(debate, researchText), participantId: "planner" };
    }
    if (type === "critique") {
      const previousPlan = getLatestDebateResponse(debate, ["improve", "plan"]);
      return { prompt: generateCriticPrompt(debate, previousPlan, debate.rounds || []), participantId: "critic" };
    }
    if (type === "improve") {
      const currentPlan = getLatestDebateResponse(debate, ["improve", "plan"]);
      const critique = getLatestDebateResponse(debate, ["critique"]);
      return { prompt: generateImprovePrompt(debate, currentPlan, critique, debate.rounds || []), participantId: "planner" };
    }
    return { prompt: generateConsensusPrompt(debate), participantId: "planner" };
  }

  function requiredArray(value) {
    return Array.isArray(value);
  }

  function validateConsensus(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Consensus must be a JSON object." };
    const stringKeys = ["project_name", "goal", "final_recommendation"];
    for (const key of stringKeys) {
      if (typeof value[key] !== "string") return { ok: false, error: `Consensus field ${key} must be a string.` };
    }
    const arrayKeys = ["target_users", "core_features", "architecture", "data_model", "implementation_stages", "risks", "open_questions"];
    for (const key of arrayKeys) {
      if (!requiredArray(value[key])) return { ok: false, error: `Consensus field ${key} must be an array.` };
    }
    for (const [index, stage] of value.implementation_stages.entries()) {
      if (!stage || typeof stage !== "object" || Array.isArray(stage)) return { ok: false, error: `Stage ${index + 1} must be an object.` };
      for (const key of ["title", "goal"]) {
        if (typeof stage[key] !== "string") return { ok: false, error: `Stage ${index + 1} ${key} must be a string.` };
      }
      for (const key of ["scope", "out_of_scope", "acceptance_criteria", "tests"]) {
        if (!Array.isArray(stage[key])) return { ok: false, error: `Stage ${index + 1} ${key} must be an array.` };
      }
    }
    return { ok: true };
  }

  function parseConsensusText(text) {
    try {
      const parsed = JSON.parse(String(text || "").trim());
      const validation = validateConsensus(parsed);
      if (!validation.ok) return validation;
      return { ok: true, data: parsed };
    } catch (error) {
      return { ok: false, error: error.message || "Consensus JSON parse failed." };
    }
  }

  function buildProjectPack(debate) {
    return {
      exported_at: nowIso(),
      debate_id: debate.id,
      project_name: debate.consensus?.project_name || debate.title,
      status: debate.status,
      consensus: debate.consensus,
      stages: debate.final_megaprompts || []
    };
  }

  function convertFlaws(task, parsedData, roundId) {
    if (!Array.isArray(parsedData?.flaws)) return;
    if (!Array.isArray(task.processed_flaws)) task.processed_flaws = [];

    for (const flaw of parsedData.flaws) {
      const stableId = flaw.id || `flaw_${roundId}_${flaw.category}_${flaw.title}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (task.processed_flaws.some((f) => f.id === stableId)) continue;
      task.processed_flaws.push({
        id: stableId,
        source_round_id: roundId,
        title: flaw.title || "",
        category: flaw.category || "",
        verdict: flaw.verdict || "",
        why_it_matters: flaw.why_it_matters || "",
        recommended_action: flaw.recommended_action || "",
        user_decision: null,
        user_note: "",
        created_task_id: null
      });
    }
  }

  function parseRawIntoTask(task, rawText) {
    const result = parsePlanningResponse(rawText);
    const roundId = `round_${Date.now()}`;
    if (result.ok) {
      task.ai_rounds.push({ id: roundId, created_at: nowIso(), raw_response: rawText, parsed: result.data, parse_ok: true, parse_error: null, decisions: result.data.plan.decisions || [] });
      task.active_round = task.ai_rounds.length;
      convertFlaws(task, result.data, roundId);
      addTaskLog(appState, task.id, "info", "JSON parsed");
    } else {
      task.ai_rounds.push({ id: roundId, created_at: nowIso(), raw_response: rawText, parsed: null, parse_ok: false, parse_error: result.error });
      task.active_round = task.ai_rounds.length;
      bumpMetric("parse_failures", 1);
      addTaskLog(appState, task.id, "warning", "parse failed");
    }
    addTaskLog(appState, task.id, "info", "raw response saved");
  }

  function parseManualResponseIntoTask(task, rawText) {
    const result = parsePlanningResponse(rawText);
    const ts = Date.now();
    const roundId = `round_${ts}`;
    const round = {
      id: roundId,
      round_number: (task.ai_rounds?.length || 0) + 1,
      provider: "manual",
      raw_response: rawText,
      parsed: result.ok ? result.data : null,
      parse_ok: Boolean(result.ok),
      parse_error: result.ok ? null : result.error,
      created_at: nowIso()
    };

    if (!Array.isArray(task.ai_rounds)) task.ai_rounds = [];
    task.ai_rounds.push(round);
    task.active_round = task.ai_rounds.length;

    if (result.ok) {
      convertFlaws(task, result.data, roundId);
      task.ai_worker_status = "finished";
      task.ai_worker_error = null;
      addTaskLog(appState, task.id, "info", "Manual response parsed");
    } else {
      task.ai_worker_status = "failed";
      task.ai_worker_error = result.error || "Manual response parse failed.";
      bumpMetric("parse_failures", 1);
      addTaskLog(appState, task.id, "error", "Manual response parse failed");
    }
  }

  function regenerateCodexPrompt(task) {
    const latest = getLatestParsedRound(task);
    if (!latest) return;
    const steps = latest.parsed.plan.implementation_steps || [];
    const idx = Number(task.selected_codex_step_index || 0);
    if (!steps[idx]) return;
    task.final_codex_prompt = generateCodexPrompt(task, idx, appState);
  }

  function updateClarificationFromForm(task, formData) {
    task.user_inputs.goal = String(formData.get("goal") || "").trim();
    task.user_inputs.input_output = String(formData.get("input_output") || "").trim();
    task.user_inputs.out_of_scope = String(formData.get("out_of_scope") || "").trim();
    task.user_inputs.toggles.new_ui = formData.get("toggle_new_ui") === "on";
    task.user_inputs.toggles.database = formData.get("toggle_database") === "on";
    task.user_inputs.toggles.security = formData.get("toggle_security") === "on";
    task.user_inputs.toggles.monolith_risk = formData.get("toggle_monolith_risk") === "on";
    task.user_inputs.toggles.overengineering_risk = formData.get("toggle_overengineering_risk") === "on";
    task.user_inputs.toggles.tests = formData.get("toggle_tests") === "on";
  }

  async function runAiForTask(taskId) {
    const task = getActiveTask(appState);
    if (!task || task.id !== taskId) return;
    const prompt = generateMegaPrompt(task, appState);

    await mutateAndRender(() => {
      updateTask(appState, task.id, {
        current_prompt: prompt,
        ai_worker_status: "opening",
        ai_worker_error: null,
        ai_worker_started_at: nowIso(),
        ai_worker_timeout_at: null
      });
      bumpMetric("ai_runs_total", 1);
      addTaskLog(appState, task.id, "info", "prompt generated");
      addTaskLog(appState, task.id, "info", "AI run started");
    });

    try {
      await window.nextstepAI.startAnalysis({ taskId: task.id, prompt, settings: appState.settings || {} });
    } catch (error) {
      await mutateAndRender(() => {
        updateTask(appState, task.id, { ai_worker_status: "failed", ai_worker_error: error.message || "AI run failed." });
      });
    }
  }

  function applyFlawDecision(task, flawId, decision) {
    const flaw = (task.processed_flaws || []).find((f) => f.id === flawId);
    if (!flaw) return;
    if (decision === "ignore" && flaw.verdict === "blocker" && !window.confirm("This flaw is blocker. Confirm ignore?")) return;
    flaw.user_decision = decision;
    if ((decision === "later" || decision === "subtask") && !flaw.created_task_id) {
      const child = createTaskFromFlaw(appState, task, flaw, decision);
      addTaskLog(appState, task.id, "info", `Created child task ${child.id} from flaw`);
    }
  }

  function markCurrentStepDone(task) {
    const latest = getLatestParsedRound(task);
    if (!latest) return { ok: false, error: "No parsed plan found." };
    const steps = latest.parsed.plan.implementation_steps || [];
    const current = Number(task.selected_codex_step_index || 0);
    if (!steps[current]) return { ok: false, error: "Selected step is invalid." };

    if (!Array.isArray(task.completed_steps_indexes)) task.completed_steps_indexes = [];
    if (!task.completed_steps_indexes.includes(current)) task.completed_steps_indexes.push(current);

    const next = steps.findIndex((_s, idx) => !task.completed_steps_indexes.includes(idx));
    if (next >= 0) {
      task.selected_codex_step_index = next;
      task.final_codex_prompt = generateCodexPrompt(task, next, appState);
    } else {
      task.status = "done";
      task.final_codex_prompt = null;
      addTaskLog(appState, task.id, "info", "Task completed");
    }
    return { ok: true };
  }

  function handleClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "run-ai") { void runAiForTask(actionEl.dataset.taskId); return; }

    if (action === "select-debate") { void mutateAndRender(() => selectDebate(appState, actionEl.dataset.debateId)); return; }

    if (action === "select-debate-round") {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate) return;
      void mutateAndRender(() => {
        const index = (debate.rounds || []).findIndex((round) => round.id === actionEl.dataset.roundId);
        if (index >= 0) debate.active_round_index = index;
      });
      return;
    }

    if (["generate-research-prompt", "generate-initial-plan-prompt", "generate-critic-prompt", "generate-improve-prompt", "generate-consensus-prompt"].includes(action)) {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate) return;
      const typeByAction = {
        "generate-research-prompt": "research",
        "generate-initial-plan-prompt": "plan",
        "generate-critic-prompt": "critique",
        "generate-improve-prompt": "improve",
        "generate-consensus-prompt": "consensus"
      };
      void mutateAndRender(() => {
        const type = typeByAction[action];
        const generated = generateDebatePrompt(debate, type);
        upsertDebatePrompt(debate, type, generated.participantId, generated.prompt);
        debate.status = type === "consensus" ? "consensus" : "draft";
        addDebateLog(appState, debate.id, "info", `${type} prompt generated`);
      });
      return;
    }

    if (action === "copy-debate-prompt") {
      const debate = getDebateById(actionEl.dataset.debateId);
      const round = getActiveDebateRound(debate);
      if (!debate || !round?.prompt) return;
      void (async () => {
        await window.nextstepClipboard.copyText(round.prompt);
        await mutateAndRender(() => addDebateLog(appState, debate.id, "info", "Current prompt copied"));
      })();
      return;
    }

    if (action === "paste-debate-response") {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate) return;
      void (async () => {
        const text = await window.nextstepClipboard.readText();
        await mutateAndRender(() => {
          const round = getActiveDebateRound(debate) || addDebateRound(appState, debate.id, { type: "plan", participant_id: "planner" });
          updateDebateRound(appState, debate.id, round.id, { response: String(text || ""), parse_ok: false, parse_error: null, parsed: null });
          addDebateLog(appState, debate.id, "info", "Response pasted");
        });
      })();
      return;
    }

    if (action === "save-debate-response") {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate) return;
      const round = getActiveDebateRound(debate) || addDebateRound(appState, debate.id, { type: "plan", participant_id: "planner" });
      const editor = document.querySelector(`[data-role="debate-response-editor"][data-debate-id="${debate.id}"]`);
      const text = editor ? String(editor.value || "") : String(round.response || "");
      void mutateAndRender(() => {
        updateDebateRound(appState, debate.id, round.id, { response: text, parse_ok: false, parse_error: null, parsed: null });
        if (round.type === "research") debate.research_summary = text;
        addDebateLog(appState, debate.id, "info", "Response saved");
      });
      return;
    }

    if (action === "parse-consensus") {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate) return;
      const current = getActiveDebateRound(debate);
      const fallback = getLatestDebateRoundByType(debate, "consensus");
      const round = current?.type === "consensus" ? current : fallback;
      if (!round) return;
      const editor = document.querySelector(`[data-role="debate-response-editor"][data-debate-id="${debate.id}"]`);
      const text = current?.id === round.id && editor ? String(editor.value || "") : String(round.response || "");
      void mutateAndRender(() => {
        const result = parseConsensusText(text);
        if (result.ok) {
          debate.consensus = result.data;
          debate.status = "ready_for_codex";
          updateDebateRound(appState, debate.id, round.id, { response: text, parsed: result.data, parse_ok: true, parse_error: null });
          addDebateLog(appState, debate.id, "info", "Consensus parsed");
        } else {
          updateDebateRound(appState, debate.id, round.id, { response: text, parsed: null, parse_ok: false, parse_error: result.error });
          addDebateLog(appState, debate.id, "error", result.error);
        }
      });
      return;
    }

    if (action === "generate-final-megaprompts") {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate || !debate.consensus) return;
      void mutateAndRender(() => {
        debate.final_megaprompts = generateFinalMegaPrompts(debate);
        addDebateLog(appState, debate.id, "info", "Final MegaPrompts generated");
      });
      return;
    }

    if (action === "copy-final-megaprompt") {
      const debate = getDebateById(actionEl.dataset.debateId);
      const item = debate?.final_megaprompts?.find((prompt) => Number(prompt.stage_index) === Number(actionEl.dataset.stageIndex));
      if (!debate || !item) return;
      void (async () => {
        await window.nextstepClipboard.copyText(item.prompt || "");
        await mutateAndRender(() => addDebateLog(appState, debate.id, "info", `MegaPrompt copied: ${item.title}`));
      })();
      return;
    }

    if (action === "mark-stage-done") {
      const debate = getDebateById(actionEl.dataset.debateId);
      const item = debate?.final_megaprompts?.find((prompt) => Number(prompt.stage_index) === Number(actionEl.dataset.stageIndex));
      if (!debate || !item) return;
      void mutateAndRender(() => {
        item.done = Boolean(actionEl.checked);
        item.completed_at = item.done ? nowIso() : null;
        if (debate.final_megaprompts.length && debate.final_megaprompts.every((prompt) => prompt.done)) debate.status = "complete";
        else if (debate.consensus) debate.status = "ready_for_codex";
        debate.final_megaprompts = generateFinalMegaPrompts(debate);
        addDebateLog(appState, debate.id, "info", item.done ? `Stage done: ${item.title}` : `Stage reopened: ${item.title}`);
      });
      return;
    }

    if (action === "export-project-pack") {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate) return;
      void (async () => {
        await window.nextstepClipboard.copyText(JSON.stringify(buildProjectPack(debate), null, 2));
        await mutateAndRender(() => addDebateLog(appState, debate.id, "info", "Project pack JSON copied to clipboard"));
      })();
      return;
    }

    if (action === "run-current-round" || action === "retry-debate-round") {
      const debate = getDebateById(actionEl.dataset.debateId);
      const round = getActiveDebateRound(debate);
      if (!debate || !round?.prompt) return;
      const participant = (debate.participants || []).find((item) => item.id === round.participant_id);
      void (async () => {
        try {
          await mutateAndRender(() => addDebateLog(appState, debate.id, "info", `${action === "retry-debate-round" ? "Retry" : "Run"} requested for ${round.type}`));
          await window.nextstepDebateRunner.startRound({ debateId: debate.id, roundId: round.id, provider: participant?.provider || "manual", prompt: round.prompt, settings: appState.settings || {} });
        } catch (error) {
          await mutateAndRender(() => addDebateLog(appState, debate.id, "error", error.message || "Round run failed"));
        }
      })();
      return;
    }

    if (action === "cancel-debate-round") {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate) return;
      void (async () => {
        await window.nextstepDebateRunner.cancelRound();
        await mutateAndRender(() => addDebateLog(appState, debate.id, "warning", "Round cancelled"));
      })();
      return;
    }

    if (action === "mark-manual-complete") {
      const debate = getDebateById(actionEl.dataset.debateId);
      if (!debate) return;
      void mutateAndRender(() => {
        const round = getActiveDebateRound(debate);
        if (round) updateDebateRound(appState, debate.id, round.id, { response: round.response || "", parse_error: null });
        addDebateLog(appState, debate.id, "info", "Round marked manual complete");
      });
      return;
    }

    if (action === "paste-manual-response") {
      const task = getActiveTask(appState);
      if (!task) return;
      void (async () => {
        const text = await window.nextstepClipboard.readText();
        await mutateAndRender(() => {
          task.manual_response_draft = String(text || "");
          if (appState.settings?.local_metrics_enabled) bumpMetric("manual_fallback_count", 1);
          addTaskLog(appState, task.id, "info", "Manual response pasted");
        });
      })();
      return;
    }

    if (action === "parse-manual-response") {
      const task = getActiveTask(appState);
      if (!task) return;
      const editor = document.querySelector(`[data-role="manual-response-editor"][data-task-id="${task.id}"]`);
      const text = editor ? String(editor.value || "") : String(task.manual_response_draft || "");
      void mutateAndRender(() => {
        task.manual_response_draft = text;
        parseManualResponseIntoTask(task, text);
      });
      return;
    }

    if (action === "cancel-run") {
      void (async () => {
        await window.nextstepAI.cancelAnalysis();
        const task = getActiveTask(appState);
        if (!task) return;
        await mutateAndRender(() => {
          updateTask(appState, task.id, { ai_worker_status: "cancelled", ai_worker_error: "Run cancelled by user." });
          addTaskLog(appState, task.id, "warning", "AI run cancelled");
        });
      })();
      return;
    }

    if (action === "retry-ai") {
      const task = getActiveTask(appState);
      if (task) void runAiForTask(task.id);
      return;
    }

    if (action === "retry-extraction") {
      const task = getActiveTask(appState);
      if (!task) return;
      void (async () => {
        try {
          await window.nextstepAI.retryExtraction({ taskId: task.id });
          await mutateAndRender(() => addTaskLog(appState, task.id, "info", "Retry extraction requested."));
        } catch (error) {
          await mutateAndRender(() => addTaskLog(appState, task.id, "error", error.message || "Retry extraction failed."));
        }
      })();
      return;
    }

    if (action === "export-state") {
      void (async () => {
        const result = await window.nextstepStorage.exportWithDialog();
        if (!result?.ok) return;
        const task = getActiveTask(appState);
        if (task) await mutateAndRender(() => addTaskLog(appState, task.id, "info", `State exported to ${result.filePath}`));
      })();
      return;
    }

    if (action === "import-state") {
      void (async () => {
        try {
          const result = await window.nextstepStorage.importWithDialog();
          if (!result?.ok || !result.state) return;
          appState = result.state;
          renderApp(document.getElementById("app"), appState);
          await persistState();
        } catch (error) {
          const task = getActiveTask(appState);
          if (task) {
            await mutateAndRender(() => addTaskLog(appState, task.id, "error", error.message || "Import failed"));
          }
        }
      })();
      return;
    }

    if (action === "open-chatgpt") {
      void (async () => {
        try {
          const result = await window.nextstepBrowser.openChatGPT();
          await mutateAndRender(() => { appState.settings.selectors_status_message = `Opened ChatGPT in ${result.browserName}.`; });
        } catch (error) {
          await mutateAndRender(() => { appState.settings.selectors_status_message = `Failed to open ChatGPT: ${error.message}`; });
        }
      })();
      return;
    }

    if (action === "selectors-save") {
      void (async () => {
        try {
          const parsed = JSON.parse(appState.settings.selectors_editor_json || "{}");
          await window.nextstepSelectors.save(parsed);
          await mutateAndRender(() => { appState.settings.selectors_status_message = "Selectors saved."; });
        } catch (error) {
          await mutateAndRender(() => { appState.settings.selectors_status_message = `Selectors save failed: ${error.message}`; });
        }
      })();
      return;
    }

    if (action === "selectors-reset") {
      void (async () => {
        const defaults = await window.nextstepSelectors.resetDefaults();
        await mutateAndRender(() => {
          appState.settings.selectors_editor_json = JSON.stringify(defaults, null, 2);
          appState.settings.selectors_status_message = "Selectors reset to defaults.";
        });
      })();
      return;
    }

    if (action === "select-task") { void mutateAndRender(() => selectTask(appState, actionEl.dataset.taskId)); return; }

    if (action === "generate-mega-prompt") {
      const task = getActiveTask(appState);
      if (!task || task.id !== actionEl.dataset.taskId) return;
      void mutateAndRender(() => {
        updateTask(appState, task.id, { current_prompt: generateMegaPrompt(task, appState) });
        addTaskLog(appState, task.id, "info", "Prompt generated.");
      });
      return;
    }

    if (action === "copy-prompt") {
      const task = getActiveTask(appState);
      if (!task || !task.current_prompt) return;
      void (async () => {
        await window.nextstepClipboard.copyText(task.current_prompt);
        await mutateAndRender(() => addTaskLog(appState, task.id, "info", "Prompt copied to clipboard."));
      })();
      return;
    }

    if (action === "generate-codex-prompt") {
      const task = getActiveTask(appState);
      if (!task || task.status !== "ready_for_codex") return;
      void mutateAndRender(() => { regenerateCodexPrompt(task); addTaskLog(appState, task.id, "info", "Codex prompt generated."); });
      return;
    }

    if (action === "copy-codex-prompt") {
      const task = getActiveTask(appState);
      if (!task || !task.final_codex_prompt) return;
      void (async () => {
        await window.nextstepClipboard.copyText(task.final_codex_prompt);
        await mutateAndRender(() => addTaskLog(appState, task.id, "info", "Codex prompt copied."));
      })();
      return;
    }

    if (action === "mark-step-done") {
      const task = getActiveTask(appState);
      if (!task || task.status !== "ready_for_codex") return;
      void mutateAndRender(() => {
        const result = markCurrentStepDone(task);
        if (!result.ok) addTaskLog(appState, task.id, "error", result.error);
        else addTaskLog(appState, task.id, "info", "Step marked done.");
      });
      return;
    }

    if (action === "copy-raw") {
      const task = getActiveTask(appState);
      const latest = task ? getLatestRound(task) : null;
      if (!task || !latest) return;
      void (async () => {
        await window.nextstepClipboard.copyText(String(latest.raw_response || ""));
        await mutateAndRender(() => addTaskLog(appState, task.id, "info", "Raw response copied."));
      })();
      return;
    }

    if (action === "paste-response") {
      const task = getActiveTask(appState);
      if (!task) return;
      void (async () => {
        const text = await window.nextstepClipboard.readText();
        await mutateAndRender(() => {
          const latest = getLatestRound(task);
          if (latest) {
            latest.raw_response = String(text || "");
            latest.parse_ok = false;
            latest.parse_error = "Edited raw response. Retry parse.";
            latest.parsed = null;
          } else {
            task.ai_rounds.push({ id: `round_${Date.now()}`, created_at: nowIso(), raw_response: String(text || ""), parsed: null, parse_ok: false, parse_error: "Pasted response. Retry parse." });
            task.active_round = task.ai_rounds.length;
          }
          bumpMetric("manual_fallback_count", 1);
          addTaskLog(appState, task.id, "info", "Raw response pasted from clipboard.");
        });
      })();
      return;
    }

    if (action === "retry-parse") {
      const task = getActiveTask(appState);
      if (!task) return;
      const editor = document.querySelector(`[data-role="raw-editor"][data-task-id="${task.id}"]`);
      const edited = editor ? editor.value : (getLatestRound(task)?.raw_response || "");
      void mutateAndRender(() => parseRawIntoTask(task, String(edited || "")));
      return;
    }

    if (action === "flaw-decision") {
      const task = getActiveTask(appState);
      if (!task || task.id !== actionEl.dataset.taskId) return;
      void mutateAndRender(() => {
        applyFlawDecision(task, actionEl.dataset.flawId, actionEl.dataset.decision);
        addTaskLog(appState, task.id, "info", `Flaw decision set: ${actionEl.dataset.decision}`);
      });
      return;
    }

    if (action === "finalize-plan") {
      const task = getActiveTask(appState);
      if (!task) return;
      void mutateAndRender(() => {
        const result = finalizePlan(appState, task.id);
        if (result.ok) {
          regenerateCodexPrompt(task);
          addTaskLog(appState, task.id, "info", "Plan finalized");
        } else {
          updateTask(appState, task.id, { ai_worker_error: result.error });
          addTaskLog(appState, task.id, "error", result.error);
        }
      });
    }
  }

  function handleChange(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    if (actionEl.dataset.action === "select-project") {
      void mutateAndRender(() => selectProject(appState, event.target.value || null));
      return;
    }

    if (actionEl.dataset.action === "set-task-status") {
      void mutateAndRender(() => moveTaskToStatus(appState, actionEl.dataset.taskId, event.target.value));
      return;
    }

    if (actionEl.dataset.action === "select-codex-step") {
      const task = getActiveTask(appState);
      if (!task || task.id !== actionEl.dataset.taskId) return;
      void mutateAndRender(() => { task.selected_codex_step_index = Number(event.target.value || 0); regenerateCodexPrompt(task); });
      return;
    }

    if (actionEl.dataset.action === "flaw-note") {
      const task = getActiveTask(appState);
      if (!task) return;
      const flaw = (task.processed_flaws || []).find((f) => f.id === actionEl.dataset.flawId);
      if (!flaw) return;
      void mutateAndRender(() => { flaw.user_note = String(event.target.value || ""); });
      return;
    }

    if (actionEl.dataset.action === "selectors-editor") {
      void mutateAndRender(() => { appState.settings.selectors_editor_json = String(event.target.value || "{}"); });
      return;
    }

    if (actionEl.dataset.action.startsWith("settings-")) {
      void mutateAndRender(() => {
        if (actionEl.dataset.action === "settings-provider") appState.settings.default_provider = event.target.value;
        if (actionEl.dataset.action === "settings-ai-timeout") appState.settings.max_ai_run_minutes = Number(event.target.value || 3);
        if (actionEl.dataset.action === "settings-login-timeout") appState.settings.login_timeout_minutes = Number(event.target.value || 2);
        if (actionEl.dataset.action === "settings-keep-open") appState.settings.keep_browser_open_after_run = Boolean(event.target.checked);
        if (actionEl.dataset.action === "settings-save-screens") appState.settings.save_failure_screenshots = Boolean(event.target.checked);
        if (actionEl.dataset.action === "settings-local-metrics") appState.settings.local_metrics_enabled = Boolean(event.target.checked);
        if (actionEl.dataset.action === "settings-browser-pref") appState.settings.browser_channel_preference = event.target.value;
      });
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const formData = new FormData(form);

    if (form.dataset.form === "create-project") {
      const name = String(formData.get("project_name") || "").trim();
      const description = String(formData.get("project_description") || "").trim();
      if (!name) return;
      void mutateAndRender(() => {
        const project = createProject(name, description);
        appState.projects.push(project);
        appState.active_project_id = project.id;
        appState.active_task_id = null;
      });
      return;
    }

    if (form.dataset.form === "create-task") {
      if (!appState.active_project_id) return;
      const title = String(formData.get("task_title") || "").trim();
      const rawIdea = String(formData.get("task_raw_idea") || "").trim();
      if (!title) return;
      void mutateAndRender(() => {
        const task = createTask(appState.active_project_id, title, rawIdea);
        appState.tasks.push(task);
        appState.active_task_id = task.id;
      });
      return;
    }

    if (form.dataset.form === "create-debate") {
      const title = String(formData.get("debate_title") || "").trim();
      const rawIdea = String(formData.get("debate_raw_idea") || "").trim();
      const goal = String(formData.get("debate_goal") || "").trim();
      const targetRounds = Number(formData.get("debate_target_rounds") || 4);
      if (!title) return;
      void mutateAndRender(() => {
        if (!Array.isArray(appState.debates)) appState.debates = [];
        const debate = createDebate(title, rawIdea, goal);
        debate.target_rounds = Number.isFinite(targetRounds) && targetRounds > 0 ? targetRounds : 4;
        appState.debates.push(debate);
        appState.active_debate_id = debate.id;
        addDebateLog(appState, debate.id, "info", "Debate created");
      });
      return;
    }

    if (form.dataset.form === "save-clarification") {
      const task = getActiveTask(appState);
      if (!task || task.id !== form.dataset.taskId) return;
      void mutateAndRender(() => {
        updateClarificationFromForm(task, formData);
        addTaskLog(appState, task.id, "info", "Clarification saved.");
      });
    }
  }

  function registerAiEvents() {
    window.nextstepAI.onStatusChanged((payload) => {
      const task = appState.tasks.find((item) => item.id === payload.taskId);
      if (!task) return;
      if (payload.status === "warning") {
        void mutateAndRender(() => addTaskLog(appState, task.id, "warning", payload.message || "Provider warning."));
        return;
      }
      void mutateAndRender(() => {
        updateTask(appState, task.id, { ai_worker_status: payload.status, ai_worker_error: null });
        if (payload.status === "waiting_login") bumpMetric("login_required_count", 1);
      });
    });

    window.nextstepAI.onAnalysisFinished((payload) => {
      const task = appState.tasks.find((item) => item.id === payload.taskId);
      if (!task) return;
      void mutateAndRender(() => {
        parseRawIntoTask(task, String(payload.rawResponse || ""));
        updateTask(appState, task.id, { ai_worker_status: "finished", ai_worker_error: null, ai_worker_timeout_at: null });
        bumpMetric("ai_runs_success", 1);
        const startedAt = task.ai_worker_started_at ? Date.parse(task.ai_worker_started_at) : Date.now();
        updateAverageResponseMs(Date.now() - startedAt);
      });
    });

    window.nextstepAI.onAnalysisFailed((payload) => {
      const task = appState.tasks.find((item) => item.id === payload.taskId);
      if (!task) return;
      void mutateAndRender(() => {
        const raw = payload.error || "AI run failed.";
        const isProtective = /(protective block|verify you are human|cloudflare|captcha|checking your browser)/i.test(raw);
        const msg = isProtective
          ? "Provider verification detected. Complete it manually in the opened browser, then retry. If it repeats, use Manual Response Test."
          : raw;
        updateTask(appState, task.id, { ai_worker_status: "failed", ai_worker_error: msg });
        addTaskLog(appState, task.id, "error", msg);
        bumpMetric("ai_runs_failed", 1);
        if (/timed out/i.test(msg)) bumpMetric("timeout_failures", 1);
      });
    });
  }

  function registerDebateRunnerEvents() {
    if (!window.nextstepDebateRunner) return;
    window.nextstepDebateRunner.onStatusChanged((payload) => {
      const debate = getDebateById(payload.debateId);
      if (!debate) return;
      void mutateAndRender(() => addDebateLog(appState, debate.id, payload.status === "warning" ? "warning" : "info", payload.message || `Round status: ${payload.status}`));
    });

    window.nextstepDebateRunner.onRoundFinished((payload) => {
      const debate = getDebateById(payload.debateId);
      if (!debate) return;
      void mutateAndRender(() => {
        updateDebateRound(appState, debate.id, payload.roundId, { response: String(payload.rawResponse || ""), parse_ok: false, parse_error: null, parsed: null });
        const round = (debate.rounds || []).find((item) => item.id === payload.roundId);
        if (round?.type === "research") debate.research_summary = String(payload.rawResponse || "");
        addDebateLog(appState, debate.id, "info", "Round response stored");
      });
    });

    window.nextstepDebateRunner.onRoundFailed((payload) => {
      const debate = getDebateById(payload.debateId);
      if (!debate) return;
      void mutateAndRender(() => addDebateLog(appState, debate.id, "error", payload.error || "Round failed"));
    });
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const appRoot = document.getElementById("app");
    appState = await window.nextstepStorage.loadState();
    try {
      const selectors = await window.nextstepSelectors.load();
      appState.settings.selectors_editor_json = JSON.stringify(selectors, null, 2);
      appState.settings.selectors_status_message = "Selectors loaded.";
    } catch (error) {
      appState.settings.selectors_status_message = `Selectors load failed: ${error.message}`;
    }

    renderApp(appRoot, appState);
    registerAiEvents();
    registerDebateRunnerEvents();
    appRoot.addEventListener("click", handleClick);
    appRoot.addEventListener("change", handleChange);
    appRoot.addEventListener("submit", handleSubmit);
    await persistState();
  });
})();
