(function () {
  const KANBAN_STATUSES = ["clarification", "ai_loop", "ready_for_codex", "done"];

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createProject(name, description = "") {
    const ts = nowIso();
    return { id: createId("project"), name: name.trim(), description: description.trim(), created_at: ts, updated_at: ts };
  }

  function createTask(projectId, title, rawIdea = "") {
    const ts = nowIso();
    return {
      id: createId("task"),
      project_id: projectId,
      parent_task_id: null,
      source_flaw_id: null,
      title: title.trim(),
      status: "clarification",
      raw_idea: rawIdea.trim(),
      user_inputs: {
        goal: "",
        input_output: "",
        out_of_scope: "",
        toggles: { new_ui: false, database: false, security: false, monolith_risk: false, overengineering_risk: false, tests: false }
      },
      active_round: 0,
      current_prompt: null,
      ai_worker_status: "idle",
      ai_worker_error: null,
      ai_worker_started_at: null,
      ai_worker_timeout_at: null,
      ai_rounds: [],
      processed_flaws: [],
      selected_codex_step_index: 0,
      completed_steps_indexes: [],
      final_codex_prompt: null,
      kanban_position: 0,
      logs: [],
      created_at: ts,
      updated_at: ts
    };
  }

  function createDefaultParticipants() {
    return [
      {
        id: "planner",
        name: "Planner AI",
        role: "planner",
        provider: "chatgpt",
        mode: "manual"
      },
      {
        id: "critic",
        name: "Critic AI",
        role: "critic",
        provider: "claude",
        mode: "manual"
      }
    ];
  }

  function getProjectBuilderSteps() {
    if (window.NextStepAiProjectBuilderProtocol) {
      return window.NextStepAiProjectBuilderProtocol.listWorkflowSteps();
    }
    return [
      { id: "gpt_clarifier", label: "GPT Clarifier", actor: "ai", provider: "chatgpt", role: "clarifier" },
      { id: "gpt_planner", label: "GPT Planner", actor: "ai", provider: "chatgpt", role: "planner" },
      { id: "claude_critic", label: "Claude Critic", actor: "ai", provider: "claude", role: "critic" },
      { id: "gpt_rebuttal", label: "GPT Rebuttal", actor: "ai", provider: "chatgpt", role: "rebuttal" },
      { id: "gpt_revised_plan", label: "GPT Revised Plan", actor: "ai", provider: "chatgpt", role: "planner" },
      { id: "claude_final_review", label: "Claude Final Review", actor: "ai", provider: "claude", role: "final_review" },
      { id: "gpt_final_synthesis", label: "GPT Final Synthesis", actor: "ai", provider: "chatgpt", role: "synthesis" },
      { id: "codex_prompt_forge", label: "Codex Prompt Forge", actor: "ai", provider: "chatgpt", role: "prompt_forge" },
      { id: "claude_prompt_qa", label: "Claude Prompt QA", actor: "ai", provider: "claude", role: "prompt_qa" },
      { id: "gpt_prompt_polish", label: "GPT Prompt Polish", actor: "ai", provider: "chatgpt", role: "prompt_polish" }
    ];
  }

  function getProjectBuilderProviders() {
    if (window.NextStepAiProjectBuilderProtocol) {
      return window.NextStepAiProjectBuilderProtocol.listProviders();
    }
    return [
      { id: "chatgpt", label: "ChatGPT", status: "active", enabled: true, validated: true },
      { id: "claude", label: "Claude", status: "active", enabled: true, validated: true },
      { id: "gemini", label: "Gemini", status: "coming_later", enabled: false, validated: false },
      { id: "grok", label: "Grok", status: "coming_later", enabled: false, validated: false }
    ];
  }

  function getStage(stageId) {
    const steps = getProjectBuilderSteps();
    return steps.find((step) => step.id === stageId) || steps[0];
  }

  function createDebate(title, rawIdea, goal) {
    const ts = nowIso();
    return {
      id: createId("debate"),
      protocol: "ai_project_builder",
      protocol_version: 1,
      title: String(title || "").trim(),
      raw_idea: String(rawIdea || "").trim(),
      goal: String(goal || "").trim(),
      status: "draft",
      current_stage_id: "gpt_clarifier",
      current_stage_index: 0,
      human_gated: true,
      auto_loop: false,
      providers: getProjectBuilderProviders(),
      steps: getProjectBuilderSteps(),
      target_rounds: 4,
      active_round_index: 0,
      participants: createDefaultParticipants(),
      rounds: [],
      research_summary: null,
      consensus: null,
      final_megaprompts: [],
      logs: [],
      created_at: ts,
      updated_at: ts
    };
  }

  function selectProject(state, projectId) {
    state.active_project_id = projectId;
    const firstTask = state.tasks.find((task) => task.project_id === projectId) || null;
    state.active_task_id = firstTask ? firstTask.id : null;
  }

  function selectTask(state, taskId) { state.active_task_id = taskId; }

  function selectDebate(state, debateId) { state.active_debate_id = debateId; }

  function updateTask(state, taskId, patch) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return null;
    Object.assign(task, patch, { updated_at: nowIso() });
    return task;
  }

  function moveTaskToStatus(state, taskId, status) {
    if (!KANBAN_STATUSES.includes(status)) return null;
    return updateTask(state, taskId, { status });
  }

  function getActiveProject(state) { return state.projects.find((project) => project.id === state.active_project_id) || null; }
  function getActiveTask(state) { return state.tasks.find((task) => task.id === state.active_task_id) || null; }
  function getActiveDebate(state) { return (state.debates || []).find((debate) => debate.id === state.active_debate_id) || null; }

  function normalizeDebateRound(round, nextRoundNumber) {
    const ts = nowIso();
    const stageId = round?.stage_id || "gpt_clarifier";
    const stage = getStage(stageId);
    const promptSent = round?.prompt_sent || round?.prompt || "";
    const responseReceived = round?.response_received || round?.response || "";
    return {
      id: round?.id || createId("debate_round"),
      round_number: Number(round?.round_number || nextRoundNumber || 1),
      stage_id: stage.id,
      stage_label: round?.stage_label || stage.label || "",
      type: round?.type || "plan",
      participant_id: round?.participant_id || "",
      provider: round?.provider || stage.provider || "",
      role: round?.role || stage.role || "",
      status: round?.status || (responseReceived ? "received" : promptSent ? "sent" : "pending"),
      prompt_sent: promptSent,
      response_received: responseReceived,
      prompt: promptSent,
      response: responseReceived,
      parsed: round?.parsed || null,
      parse_ok: Boolean(round?.parse_ok),
      parse_error: round?.parse_error || null,
      sent_at: round?.sent_at || (promptSent ? ts : null),
      received_at: round?.received_at || (responseReceived ? ts : null),
      created_at: round?.created_at || ts,
      updated_at: round?.updated_at || ts
    };
  }

  function addDebateRound(state, debateId, round) {
    const debate = (state.debates || []).find((item) => item.id === debateId);
    if (!debate) return null;
    if (!Array.isArray(debate.rounds)) debate.rounds = [];
    const normalized = normalizeDebateRound(round, debate.rounds.length + 1);
    debate.rounds.push(normalized);
    debate.active_round_index = debate.rounds.length - 1;
    debate.updated_at = nowIso();
    return normalized;
  }

  function updateDebateRound(state, debateId, roundId, patch) {
    const debate = (state.debates || []).find((item) => item.id === debateId);
    if (!debate || !Array.isArray(debate.rounds)) return null;
    const round = debate.rounds.find((item) => item.id === roundId);
    if (!round) return null;
    Object.assign(round, patch, { updated_at: nowIso() });
    debate.active_round_index = Math.max(0, debate.rounds.findIndex((item) => item.id === roundId));
    debate.updated_at = nowIso();
    return round;
  }

  function addTaskLog(state, taskId, level, message) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return null;
    task.logs.push({ id: createId("log"), level, message, created_at: nowIso() });
    task.updated_at = nowIso();
    return task;
  }

  function addDebateLog(state, debateId, level, message) {
    const debate = (state.debates || []).find((item) => item.id === debateId);
    if (!debate) return null;
    if (!Array.isArray(debate.logs)) debate.logs = [];
    const log = { id: createId("debate_log"), level, message, created_at: nowIso() };
    debate.logs.push(log);
    debate.updated_at = nowIso();
    return log;
  }

  function getLatestParsedPlan(task) {
    if (!task || !Array.isArray(task.ai_rounds)) return null;
    for (let i = task.ai_rounds.length - 1; i >= 0; i -= 1) {
      const round = task.ai_rounds[i];
      if (round && round.parse_ok && round.parsed && round.parsed.plan) {
        return { round, plan: round.parsed.plan };
      }
    }
    return null;
  }

  function hasUnresolvedBlockers(task) {
    const flaws = Array.isArray(task?.processed_flaws) ? task.processed_flaws : [];
    return flaws.some((flaw) => flaw.verdict === "blocker" && !flaw.user_decision);
  }

  function createTaskFromFlaw(state, task, flaw, decision) {
    const child = createTask(task.project_id, `[${decision}] ${flaw.title || "Flaw follow-up"}`, flaw.recommended_action || "");
    child.parent_task_id = task.id;
    child.source_flaw_id = flaw.id;
    child.status = "clarification";
    state.tasks.push(child);
    flaw.created_task_id = child.id;
    return child;
  }

  function finalizePlan(state, taskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: "Task not found." };
    if (["opening", "finding_input", "sending_prompt", "waiting_response", "extracting_response"].includes(task.ai_worker_status)) {
      return { ok: false, error: "Cannot finalize while AI run is active." };
    }

    const latest = getLatestParsedPlan(task);
    if (!latest || !latest.plan) return { ok: false, error: "No parsed plan available." };
    const steps = Array.isArray(latest.plan.implementation_steps) ? latest.plan.implementation_steps : [];
    if (!steps.length) return { ok: false, error: "Implementation steps are required." };
    if (hasUnresolvedBlockers(task)) return { ok: false, error: "Blocker flaw requires a decision." };

    const isNewPlan = task._last_finalized_round_id !== latest.round.id;
    task.status = "ready_for_codex";
    task.selected_codex_step_index = 0;
    if (isNewPlan) {
      task.completed_steps_indexes = [];
      task._last_finalized_round_id = latest.round.id;
    }
    task.updated_at = nowIso();

    return { ok: true };
  }

  window.NextStepState = {
    KANBAN_STATUSES,
    createProject,
    createTask,
    createDebate,
    selectProject,
    selectTask,
    selectDebate,
    updateTask,
    moveTaskToStatus,
    getActiveProject,
    getActiveTask,
    getActiveDebate,
    addDebateRound,
    updateDebateRound,
    addTaskLog,
    addDebateLog,
    getLatestParsedPlan,
    hasUnresolvedBlockers,
    createTaskFromFlaw,
    finalizePlan
  };
})();
