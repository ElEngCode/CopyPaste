(function () {
  function asText(value, fallback = "") {
    return String(value || fallback || "").trim();
  }

  function list(items) {
    return Array.isArray(items) && items.length ? items.map((item) => `- ${asText(item)}`).join("\n") : "- None yet";
  }

  function summarizeRounds(rounds) {
    const safeRounds = Array.isArray(rounds) ? rounds : [];
    if (!safeRounds.length) return "No previous rounds.";
    return safeRounds.map((round) => [
      `Round ${round.round_number || "?"} (${round.type || "unknown"}, ${round.participant_id || "unknown"}):`,
      asText(round.response || round.prompt || "No content.")
    ].join("\n")).join("\n\n");
  }

  function debateHeader(debate) {
    return [
      `Project title: ${asText(debate?.title, "Untitled project")}`,
      `Raw idea: ${asText(debate?.raw_idea, "No raw idea provided.")}`,
      `Goal: ${asText(debate?.goal, "No goal provided.")}`
    ].join("\n");
  }

  function generateResearchPrompt(debate) {
    return `${debateHeader(debate)}

You are researching this software project before planning implementation.

Return a practical research brief for any software project, covering:
- Successful similar products or established patterns worth learning from.
- Common features users expect.
- UX patterns and workflow conventions.
- Architecture options and recommended architecture.
- Storage/data model choices.
- Security, privacy, data-loss, operational, and delivery risks.
- Implementation stages that reduce risk.

Keep the research concrete and useful for a planning debate.`;
  }

  function generateInitialPlanPrompt(debate, researchText) {
    return `${debateHeader(debate)}

Research summary:
${asText(researchText, "No research summary provided. Infer cautiously from the project idea.")}

You are the Planner AI. Produce an initial implementation plan for this software project.

Include target users, core workflows, architecture, data model, implementation stages, acceptance criteria, tests, risks, and open questions. Favor a small reliable first version over overengineering.`;
  }

  function generateCriticPrompt(debate, previousPlan, previousRounds) {
    return `${debateHeader(debate)}

Previous rounds:
${summarizeRounds(previousRounds)}

Current plan to critique:
${asText(previousPlan, "No plan provided. Critique the available debate context.")}

You are the Critic AI. Find the strongest practical objections:
- Flaws and missing requirements.
- Security/data risks and privacy issues.
- Overengineering or unnecessary complexity.
- Missing tests and weak acceptance criteria.
- Unclear parts, assumptions, and blocked decisions.
- Better alternatives with trade-offs.

Be specific. Separate blockers from improvements.`;
  }

  function generateImprovePrompt(debate, currentPlan, critique, previousRounds) {
    return `${debateHeader(debate)}

Previous rounds:
${summarizeRounds(previousRounds)}

Current plan:
${asText(currentPlan, "No current plan provided.")}

Critique to address:
${asText(critique, "No critique provided.")}

You are the Planner AI. Accept or reject each critique item with a short reason, then produce a stronger plan. Preserve good parts of the plan, reduce unnecessary scope, improve risks/tests, and clarify implementation stages.`;
  }

  function consensusShape() {
    return `{
  "project_name": "",
  "goal": "",
  "target_users": [],
  "core_features": [],
  "architecture": [],
  "data_model": [],
  "implementation_stages": [
    {
      "title": "",
      "goal": "",
      "scope": [],
      "out_of_scope": [],
      "acceptance_criteria": [],
      "tests": []
    }
  ],
  "risks": [],
  "open_questions": [],
  "final_recommendation": ""
}`;
  }

  function generateConsensusPrompt(debate) {
    return `${debateHeader(debate)}

All debate rounds:
${summarizeRounds(debate?.rounds)}

Combine the debate into one final JSON plan. Return only valid JSON with this exact shape:
${consensusShape()}

Rules:
- Use implementation_stages small enough for separate Codex sessions.
- Make scope and out_of_scope explicit for each stage.
- Include tests for each stage.
- Resolve disagreements where possible and keep true unknowns in open_questions.`;
  }

  function consensusSummary(consensus) {
    return [
      `Project: ${asText(consensus?.project_name, "Untitled project")}`,
      `Goal: ${asText(consensus?.goal)}`,
      "",
      "Target users:",
      list(consensus?.target_users),
      "",
      "Core features:",
      list(consensus?.core_features),
      "",
      "Architecture:",
      list(consensus?.architecture),
      "",
      "Data model:",
      list(consensus?.data_model),
      "",
      "Risks:",
      list(consensus?.risks),
      "",
      "Open questions:",
      list(consensus?.open_questions),
      "",
      `Final recommendation: ${asText(consensus?.final_recommendation)}`
    ].join("\n");
  }

  function generateStagePrompt(consensus, stage, stageIndex, stages, completedStages) {
    const futureStages = stages.filter((_item, index) => index > stageIndex);
    return `You are Codex working on ${asText(consensus.project_name, "this project")}.

Goal:
${asText(consensus.goal)}

Full consensus summary:
${consensusSummary(consensus)}

Completed stages:
${completedStages.length ? completedStages.map((item) => `- ${item.title}: ${item.goal}`).join("\n") : "- None"}

Current stage only:
Title: ${asText(stage.title)}
Goal: ${asText(stage.goal)}

Scope:
${list(stage.scope)}

Out of scope:
${list(stage.out_of_scope)}

Acceptance criteria:
${list(stage.acceptance_criteria)}

Tests:
${list(stage.tests)}

Future stages - DO NOT IMPLEMENT:
${futureStages.length ? futureStages.map((item) => `- ${item.title}: ${item.goal}`).join("\n") : "- None"}

Rules:
- Implement only current stage.
- Do not overengineer.
- Do not touch unrelated files.
- Run relevant checks.
- List changed files.
- Commit locally.
- Stop after this stage.`;
  }

  function generateFinalMegaPrompts(debate) {
    const consensus = debate?.consensus || {};
    const stages = Array.isArray(consensus.implementation_stages) ? consensus.implementation_stages : [];
    const existing = new Map((debate?.final_megaprompts || []).map((item) => [Number(item.stage_index), item]));
    return stages.map((stage, index) => {
      const priorCompleted = stages.filter((_item, stageIndex) => stageIndex < index && existing.get(stageIndex)?.done);
      const existingItem = existing.get(index) || {};
      return {
        id: existingItem.id || `megaprompt_${index + 1}`,
        stage_index: index,
        title: asText(stage.title, `Stage ${index + 1}`),
        done: Boolean(existingItem.done),
        completed_at: existingItem.completed_at || null,
        prompt: generateStagePrompt(consensus, stage, index, stages, priorCompleted)
      };
    });
  }

  window.NextStepDebatePrompts = {
    generateResearchPrompt,
    generateInitialPlanPrompt,
    generateCriticPrompt,
    generateImprovePrompt,
    generateConsensusPrompt,
    generateFinalMegaPrompts
  };
})();
