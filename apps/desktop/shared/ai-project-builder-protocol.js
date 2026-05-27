(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NextStepAiProjectBuilderProtocol = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PROVIDERS = Object.freeze([
    Object.freeze({
      id: "chatgpt",
      label: "ChatGPT",
      vendor: "OpenAI",
      status: "active",
      enabled: true,
      validated: true,
      roles: Object.freeze(["clarifier", "planner", "rebuttal", "synthesis", "prompt_forge", "prompt_polish"])
    }),
    Object.freeze({
      id: "claude",
      label: "Claude",
      vendor: "Anthropic",
      status: "active",
      enabled: true,
      validated: true,
      roles: Object.freeze(["critic", "final_review", "prompt_qa"])
    }),
    Object.freeze({
      id: "gemini",
      label: "Gemini",
      vendor: "Google",
      status: "coming_later",
      enabled: false,
      validated: false,
      roles: Object.freeze([])
    }),
    Object.freeze({
      id: "grok",
      label: "Grok",
      vendor: "xAI",
      status: "coming_later",
      enabled: false,
      validated: false,
      roles: Object.freeze([])
    })
  ]);

  const PROVIDER_BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));
  const CRITIQUE_DECISION_STATUSES = Object.freeze(["accept", "reject", "needs_user_decision"]);

  const WORKFLOW_STEPS = Object.freeze([
    Object.freeze({
      id: "idea",
      label: "Idea",
      actor: "user",
      provider: null,
      role: "source",
      input_kind: "idea",
      output_kind: "idea"
    }),
    Object.freeze({
      id: "gpt_clarifier",
      label: "GPT Clarifier",
      actor: "ai",
      provider: "chatgpt",
      role: "clarifier",
      input_kind: "idea",
      output_kind: "clarified_brief"
    }),
    Object.freeze({
      id: "gpt_planner",
      label: "GPT Planner",
      actor: "ai",
      provider: "chatgpt",
      role: "planner",
      input_kind: "clarified_brief",
      output_kind: "initial_plan"
    }),
    Object.freeze({
      id: "claude_critic",
      label: "Claude Critic",
      actor: "ai",
      provider: "claude",
      role: "critic",
      input_kind: "initial_plan",
      output_kind: "critique_items"
    }),
    Object.freeze({
      id: "gpt_rebuttal",
      label: "GPT Rebuttal",
      actor: "ai",
      provider: "chatgpt",
      role: "rebuttal",
      input_kind: "critique_items",
      output_kind: "critique_decisions"
    }),
    Object.freeze({
      id: "gpt_revised_plan",
      label: "GPT Revised Plan",
      actor: "ai",
      provider: "chatgpt",
      role: "planner",
      input_kind: "critique_decisions",
      output_kind: "revised_plan"
    }),
    Object.freeze({
      id: "claude_final_review",
      label: "Claude Final Review",
      actor: "ai",
      provider: "claude",
      role: "final_review",
      input_kind: "revised_plan",
      output_kind: "final_review"
    }),
    Object.freeze({
      id: "gpt_final_synthesis",
      label: "GPT Final Synthesis",
      actor: "ai",
      provider: "chatgpt",
      role: "synthesis",
      input_kind: "final_review",
      output_kind: "final_plan"
    }),
    Object.freeze({
      id: "codex_prompt_forge",
      label: "Codex Prompt Forge",
      actor: "ai",
      provider: "chatgpt",
      role: "prompt_forge",
      input_kind: "final_plan",
      output_kind: "codex_prompt"
    }),
    Object.freeze({
      id: "claude_prompt_qa",
      label: "Claude Prompt QA",
      actor: "ai",
      provider: "claude",
      role: "prompt_qa",
      input_kind: "codex_prompt",
      output_kind: "prompt_qa"
    }),
    Object.freeze({
      id: "gpt_prompt_polish",
      label: "GPT Prompt Polish",
      actor: "ai",
      provider: "chatgpt",
      role: "prompt_polish",
      input_kind: "prompt_qa",
      output_kind: "final_codex_prompt"
    })
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function asText(value) {
    return String(value || "").trim();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function listProviders() {
    return clone(PROVIDERS);
  }

  function getProvider(providerId) {
    const provider = PROVIDER_BY_ID.get(String(providerId || "").toLowerCase());
    return provider ? clone(provider) : null;
  }

  function isProviderRunnable(providerId) {
    const provider = PROVIDER_BY_ID.get(String(providerId || "").toLowerCase());
    return Boolean(provider && provider.enabled && provider.validated && provider.status === "active");
  }

  function listWorkflowSteps() {
    return clone(WORKFLOW_STEPS);
  }

  function createWorkflowStepRun(step, index) {
    return {
      id: step.id,
      run_id: createId("apb_step"),
      order: index + 1,
      label: step.label,
      actor: step.actor,
      provider: step.provider,
      provider_status: step.provider ? getProvider(step.provider)?.status || "unknown" : null,
      role: step.role,
      input_kind: step.input_kind,
      output_kind: step.output_kind,
      status: "pending",
      prompt: "",
      response: "",
      parsed: null,
      errors: [],
      created_at: null,
      updated_at: null
    };
  }

  function createAiProjectBuilderWorkflow(input = {}) {
    const ts = nowIso();
    return {
      id: input.id || createId("apb_workflow"),
      protocol: "ai_project_builder",
      protocol_version: 1,
      title: asText(input.title) || "Untitled AI Project",
      idea: asText(input.idea),
      status: "draft",
      providers: listProviders(),
      critique_decision_statuses: [...CRITIQUE_DECISION_STATUSES],
      steps: WORKFLOW_STEPS.map((step, index) => createWorkflowStepRun(step, index)),
      critique_items: [],
      created_at: ts,
      updated_at: ts
    };
  }

  function getActionableWorkflowSteps() {
    return WORKFLOW_STEPS.filter((step) => step.actor === "ai");
  }

  function getStep(stageId) {
    return WORKFLOW_STEPS.find((step) => step.id === stageId) || null;
  }

  function getNextStageId(stageId) {
    const steps = getActionableWorkflowSteps();
    const index = steps.findIndex((step) => step.id === stageId);
    if (index < 0) return steps[0]?.id || null;
    return steps[index + 1]?.id || null;
  }

  function normalizeStageId(stageId) {
    const requested = asText(stageId);
    if (requested && getStep(requested)?.actor === "ai") return requested;
    return getActionableWorkflowSteps()[0]?.id || "gpt_clarifier";
  }

  function createProjectBuilderDebate(input = {}) {
    const ts = nowIso();
    const firstStageId = normalizeStageId(input.current_stage_id);
    return {
      id: input.id || createId("debate"),
      protocol: "ai_project_builder",
      protocol_version: 1,
      title: asText(input.title) || "Untitled AI Project",
      raw_idea: asText(input.raw_idea || input.idea),
      current_stage_id: firstStageId,
      current_stage_index: getActionableWorkflowSteps().findIndex((step) => step.id === firstStageId),
      status: input.status || "ready_for_user",
      human_gated: true,
      auto_loop: false,
      providers: listProviders(),
      participants: [
        { id: "gpt", name: "GPT", provider: "chatgpt", roles: ["clarifier", "planner", "rebuttal", "synthesis", "prompt_forge", "prompt_polish"], mode: "manual" },
        { id: "claude", name: "Claude", provider: "claude", roles: ["critic", "final_review", "prompt_qa"], mode: "manual" }
      ],
      steps: listWorkflowSteps(),
      rounds: [],
      critique_items: [],
      research_summary: null,
      consensus: null,
      final_megaprompts: [],
      logs: [],
      created_at: input.created_at || ts,
      updated_at: input.updated_at || ts
    };
  }

  function summarizeRoundForPrompt(round) {
    const label = round?.stage_label || round?.type || round?.stage_id || "Round";
    const response = asText(round?.response_received || round?.response);
    if (!response) return "";
    return `${label}:\n${response}`;
  }

  function buildStageInstructions(step) {
    const instructions = {
      gpt_clarifier: "Clarify the raw idea into a precise project brief. Ask only essential unresolved questions and infer practical defaults where reasonable.",
      gpt_planner: "Create a compact implementation plan with scope, stages, risks, tests, and acceptance criteria.",
      claude_critic: "Critique the plan. Return concrete critique items that can later be accepted, rejected, or marked as needing a user decision.",
      gpt_rebuttal: "Respond to each Claude critique item. Mark each as accept, reject, or needs_user_decision, and include a short reason.",
      gpt_revised_plan: "Revise the plan using accepted critique items and user-decision constraints. Keep rejected items out unless the reason no longer applies.",
      claude_final_review: "Review the revised plan for remaining blockers, ambiguity, missing tests, and prompt-readiness.",
      gpt_final_synthesis: "Synthesize the final implementation plan from the revised plan and final review.",
      codex_prompt_forge: "Forge the final plan into task-scoped Codex execution prompts using UI-facing task/prompt language.",
      claude_prompt_qa: "QA the Codex prompts for ambiguity, unsafe scope, missing context, and ordering problems.",
      gpt_prompt_polish: "Polish the Codex prompts into final copy-ready form without adding new scope."
    };
    return instructions[step.id] || "Continue the AI Project Builder workflow.";
  }

  function buildCleanOutputInstructions() {
    return [
      "Output format rules:",
      "- Return plain text only.",
      "- Use simple Markdown headings and bullet lists only.",
      "- Do not use artifacts, widgets, cards, tables, diagrams, interactive views, visualizations, HTML, CSS, or custom UI formatting.",
      "- Do not include hidden reasoning, CSS, JavaScript, or UI component markup."
    ].join("\n");
  }

  function createNextDebatePrompt(debate = {}) {
    const stageId = normalizeStageId(debate.current_stage_id);
    const step = getStep(stageId);
    const priorRounds = Array.isArray(debate.rounds) ? debate.rounds : [];
    const priorContext = priorRounds.map(summarizeRoundForPrompt).filter(Boolean).join("\n\n") || "No prior AI rounds yet.";

    return {
      stage_id: step.id,
      stage_label: step.label,
      provider: step.provider,
      role: step.role,
      status: "ready_to_send",
      prompt: [
        `Stage: ${step.label}`,
        `Provider: ${step.provider || "manual"}`,
        `Role: ${step.role}`,
        "",
        `Raw project idea:\n${asText(debate.raw_idea || debate.idea) || "No raw project idea provided."}`,
        "",
        `Previous round context:\n${priorContext}`,
        "",
        buildStageInstructions(step),
        "",
        buildCleanOutputInstructions(),
        "",
        "Human gate: wait for the user to send this prompt and paste or capture the response before advancing."
      ].join("\n")
    };
  }

  function saveDebateRound(debate, input = {}) {
    if (!debate || typeof debate !== "object") throw new Error("Missing debate.");
    if (!Array.isArray(debate.rounds)) debate.rounds = [];
    const stageId = normalizeStageId(input.stage_id || debate.current_stage_id);
    const step = getStep(stageId);
    const ts = nowIso();
    const promptSent = asText(input.prompt_sent || input.prompt);
    const responseReceived = asText(input.response_received || input.response);
    const status = input.status || (responseReceived ? "received" : "sent");
    const round = {
      id: input.id || createId("debate_round"),
      round_number: Number(input.round_number || debate.rounds.length + 1),
      stage_id: step.id,
      stage_label: step.label,
      type: input.type || step.role,
      participant_id: input.participant_id || step.provider || "",
      provider: input.provider || step.provider || "",
      role: input.role || step.role,
      status,
      prompt_sent: promptSent,
      response_received: responseReceived,
      prompt: promptSent,
      response: responseReceived,
      parsed: input.parsed || null,
      parse_ok: Boolean(input.parse_ok),
      parse_error: input.parse_error || null,
      sent_at: input.sent_at || ts,
      received_at: input.received_at || (responseReceived ? ts : null),
      created_at: input.created_at || ts,
      updated_at: input.updated_at || ts
    };
    debate.rounds.push(round);
    debate.status = status === "received" ? "awaiting_advance" : "waiting_response";
    debate.updated_at = ts;
    return round;
  }

  function advanceDebateStage(debate) {
    if (!debate || typeof debate !== "object") return { ok: false, error: "Missing debate." };
    const nextStageId = getNextStageId(normalizeStageId(debate.current_stage_id));
    const ts = nowIso();
    if (!nextStageId) {
      debate.status = "complete";
      debate.updated_at = ts;
      return { ok: true, complete: true, current_stage_id: debate.current_stage_id };
    }
    debate.current_stage_id = nextStageId;
    debate.current_stage_index = getActionableWorkflowSteps().findIndex((step) => step.id === nextStageId);
    debate.status = "ready_for_user";
    debate.updated_at = ts;
    return { ok: true, complete: false, current_stage_id: nextStageId };
  }

  function createCritiqueItem(input = {}) {
    const status = asText(input.status) || "needs_user_decision";
    if (!CRITIQUE_DECISION_STATUSES.includes(status)) {
      throw new Error(`Invalid critique status: ${status}`);
    }

    const ts = nowIso();
    return {
      id: input.id || createId("critique_item"),
      source_step_id: asText(input.source_step_id) || "claude_critic",
      source_provider: asText(input.source_provider) || "claude",
      decision_owner: asText(input.decision_owner) || (status === "needs_user_decision" ? "user" : "gpt"),
      title: asText(input.title) || "Untitled critique item",
      detail: asText(input.detail),
      status,
      gpt_response: asText(input.gpt_response),
      user_decision: asText(input.user_decision),
      created_at: input.created_at || ts,
      updated_at: input.updated_at || ts
    };
  }

  return {
    PROVIDERS,
    WORKFLOW_STEPS,
    CRITIQUE_DECISION_STATUSES,
    listProviders,
    getProvider,
    isProviderRunnable,
    listWorkflowSteps,
    createAiProjectBuilderWorkflow,
    createProjectBuilderDebate,
    createNextDebatePrompt,
    saveDebateRound,
    advanceDebateStage,
    createCritiqueItem
  };
});
