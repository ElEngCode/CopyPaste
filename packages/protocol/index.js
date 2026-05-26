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
  const PLANNING_DEBATE_STAGE_IDS = Object.freeze([
    "gpt_clarifier",
    "gpt_planner",
    "claude_critic",
    "gpt_rebuttal",
    "gpt_revised_plan",
    "claude_final_review",
    "gpt_final_synthesis"
  ]);

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
    return PLANNING_DEBATE_STAGE_IDS
      .map((id) => getStep(id))
      .filter(Boolean);
  }

  function getStep(stageId) {
    return WORKFLOW_STEPS.find((step) => step.id === stageId) || null;
  }

  function listPlanningDebateStages() {
    return getActionableWorkflowSteps().map((step) => clone(step));
  }

  function getPlanningDebateStage(stageId) {
    const safeId = asText(stageId);
    if (!safeId) return null;
    const step = getActionableWorkflowSteps().find((item) => item.id === safeId);
    return step ? clone(step) : null;
  }

  function getNextPlanningDebateStage(stageId) {
    const safeId = asText(stageId);
    const steps = getActionableWorkflowSteps();
    const index = steps.findIndex((item) => item.id === safeId);
    if (index < 0) return steps[0] ? clone(steps[0]) : null;
    return steps[index + 1] ? clone(steps[index + 1]) : null;
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

  function buildStageExpectedOutput(step) {
    const outputs = {
      gpt_clarifier: "A clarified project brief with assumptions and open questions.",
      gpt_planner: "A staged implementation plan with acceptance criteria and verification commands.",
      claude_critic: "A critique focused on flaws, risks, weak assumptions, and missing tests.",
      gpt_rebuttal: "Decision responses for critique items: accept, reject, or needs_user_decision.",
      gpt_revised_plan: "A revised implementation plan that applies accepted critique decisions.",
      claude_final_review: "A final review of blockers, ambiguity, and verification gaps.",
      gpt_final_synthesis: "A final master plan draft ready to persist."
    };
    return outputs[step.id] || "A focused stage response.";
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

  function buildPlanningDebatePrompt(workflow = {}, project = {}, priorRounds = []) {
    const stageId = normalizeStageId(workflow.current_stage_id || workflow.currentStageId);
    const step = getStep(stageId);
    const rounds = Array.isArray(priorRounds) && priorRounds.length
      ? priorRounds
      : Array.isArray(workflow.rounds)
        ? workflow.rounds
        : [];
    const lastRound = rounds.length ? rounds[rounds.length - 1] : null;
    const priorContext = lastRound ? summarizeRoundForPrompt(lastRound) : "No prior AI rounds yet.";
    const projectIdea = asText(project.idea || workflow.raw_idea || workflow.idea || project.raw_idea) || "No raw project idea provided.";

    const promptLines = [
      `Stage: ${step.label} (${step.id})`,
      `Provider: ${step.provider || "manual"}`,
      `Role: ${step.role}`,
      "",
      `Project idea:\n${projectIdea}`,
      "",
      `Prior relevant response:\n${priorContext}`,
      "",
      `Stage objective:\n${buildStageInstructions(step)}`,
      "",
      `Expected output:\n${buildStageExpectedOutput(step)}`,
      ""
    ];

    if (step.id === "claude_critic") {
      promptLines.push("Critique requirements:");
      promptLines.push("- identify flaws");
      promptLines.push("- identify risks");
      promptLines.push("- identify missing tests");
      promptLines.push("- identify weak assumptions");
      promptLines.push("");
    }

    if (step.id === "gpt_rebuttal") {
      promptLines.push("For each critique item include:");
      promptLines.push("- decision: accept | reject | needs_user_decision");
      promptLines.push("- rationale: concise reason");
      promptLines.push("");
    }

    if (step.id === "gpt_final_synthesis") {
      promptLines.push("Return the final master plan in a form ready to save as project baseline.");
      promptLines.push("");
    }

    promptLines.push(buildCleanOutputInstructions());
    promptLines.push("");
    promptLines.push("Human gate: wait for user-triggered send before advancing.");

    return {
      stage_id: step.id,
      stage_label: step.label,
      provider: step.provider,
      role: step.role,
      status: "ready_to_send",
      prompt: promptLines.join("\n")
    };
  }

  function createNextDebatePrompt(debate = {}) {
    return buildPlanningDebatePrompt(debate, { idea: debate.raw_idea || debate.idea }, debate.rounds || []);
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

  function buildRoadmapPrompt(project = {}, activeMasterPlan = "") {
    const projectName = asText(project.name) || "Untitled Project";
    const projectPath = asText(project.path);
    const masterPlan = asText(activeMasterPlan);
    if (!masterPlan) {
      throw new Error("Active master plan is required.");
    }
    return [
      "Generate a project roadmap strictly from the applied master plan.",
      "",
      `Project name: ${projectName}`,
      projectPath ? `Project path: ${projectPath}` : "",
      "",
      "Applied master plan:",
      masterPlan,
      "",
      "Return JSON only with shape:",
      "{\"items\":[{\"id\":\"roadmap_1\",\"order\":1,\"title\":\"Task title\",\"goal\":\"Goal\",\"why\":\"Why this exists\",\"targetFiles\":[\"path\"],\"researchNeeded\":[],\"acceptanceCriteria\":[],\"verificationCommands\":[\"npm.cmd run verify\"],\"dependsOn\":[],\"parallelGroup\":\"\"}]}",
      "",
      "Rules:",
      "- no markdown fences",
      "- deterministic order",
      "- dependsOn must reference existing ids",
      "- verificationCommands must be an array of strings"
    ].filter(Boolean).join("\n");
  }

  function normalizeRoadmap(roadmap = {}) {
    const sourceItems = Array.isArray(roadmap.items) ? roadmap.items : [];
    return {
      items: sourceItems.map((item, index) => ({
        id: asText(item.id) || `roadmap_${index + 1}`,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
        title: asText(item.title),
        goal: asText(item.goal),
        why: asText(item.why || item.whyThisExists),
        targetFiles: Array.isArray(item.targetFiles) ? item.targetFiles.map((v) => asText(v)).filter(Boolean) : [],
        researchNeeded: Array.isArray(item.researchNeeded) ? item.researchNeeded.map((v) => asText(v)).filter(Boolean) : [],
        acceptanceCriteria: Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria.map((v) => asText(v)).filter(Boolean) : [],
        verificationCommands: Array.isArray(item.verificationCommands) ? item.verificationCommands.map((v) => asText(v)).filter(Boolean) : [],
        dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.map((v) => asText(v)).filter(Boolean) : [],
        parallelGroup: asText(item.parallelGroup)
      }))
    };
  }

  function validateRoadmap(roadmap = {}) {
    const normalized = normalizeRoadmap(roadmap);
    const ids = new Set(normalized.items.map((item) => item.id));
    for (const item of normalized.items) {
      if (!item.title) throw new Error(`Roadmap item ${item.id} must have a non-empty title.`);
      if (!Number.isFinite(Number(item.order))) throw new Error(`Roadmap item ${item.id} must have numeric order.`);
      if (!Array.isArray(item.verificationCommands)) throw new Error(`Roadmap item ${item.id} must define verificationCommands array.`);
      for (const dependencyId of item.dependsOn) {
        if (dependencyId === item.id) throw new Error(`Roadmap item ${item.id} cannot depend on itself.`);
        if (!ids.has(dependencyId)) throw new Error(`Roadmap item ${item.id} depends on missing id ${dependencyId}.`);
      }
    }
    const adjacency = new Map(normalized.items.map((item) => [item.id, item.dependsOn]));
    const visiting = new Set();
    const visited = new Set();
    function dfs(nodeId) {
      if (visiting.has(nodeId)) throw new Error(`Roadmap has circular dependency at ${nodeId}.`);
      if (visited.has(nodeId)) return;
      visiting.add(nodeId);
      for (const dep of adjacency.get(nodeId) || []) dfs(dep);
      visiting.delete(nodeId);
      visited.add(nodeId);
    }
    for (const item of normalized.items) dfs(item.id);
    return true;
  }

  function parseRoadmapResponse(text = "") {
    const raw = asText(text);
    if (!raw) throw new Error("Roadmap response is empty.");
    const candidates = [raw];
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) candidates.push(asText(fenced[1]));
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        const roadmap = parsed && Array.isArray(parsed.items) ? parsed : (parsed && parsed.roadmap && Array.isArray(parsed.roadmap.items) ? parsed.roadmap : null);
        if (!roadmap) continue;
        validateRoadmap(roadmap);
        return normalizeRoadmap(roadmap);
      } catch (_error) {
        // continue
      }
    }
    throw new Error("Invalid roadmap response. Expected JSON with an items array.");
  }

  return {
    PROVIDERS,
    WORKFLOW_STEPS,
    CRITIQUE_DECISION_STATUSES,
    listProviders,
    getProvider,
    isProviderRunnable,
    listWorkflowSteps,
    listPlanningDebateStages,
    getPlanningDebateStage,
    getNextPlanningDebateStage,
    createAiProjectBuilderWorkflow,
    createProjectBuilderDebate,
    buildPlanningDebatePrompt,
    buildRoadmapPrompt,
    parseRoadmapResponse,
    validateRoadmap,
    normalizeRoadmap,
    createNextDebatePrompt,
    saveDebateRound,
    advanceDebateStage,
    createCritiqueItem
  };
});
