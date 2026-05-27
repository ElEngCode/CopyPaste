(function () {
  function safeArray(value) { return Array.isArray(value) ? value : []; }

  function generateMegaPrompt(task, state) {
    const project = (state.projects || []).find((item) => item.id === task.project_id) || null;
    const previousFlaws = safeArray(task.processed_flaws);
    const previousDecisions = safeArray(task.ai_rounds).flatMap((round) => safeArray(round.decisions || [])).filter(Boolean);

    const payload = {
      project_name: project ? project.name : "",
      task_title: task.title || "",
      raw_idea: task.raw_idea || "",
      goal: task.user_inputs?.goal || "",
      input_output: task.user_inputs?.input_output || "",
      out_of_scope: task.user_inputs?.out_of_scope || "",
      risk_flags: {
        new_ui: Boolean(task.user_inputs?.toggles?.new_ui),
        database: Boolean(task.user_inputs?.toggles?.database),
        security_user_data: Boolean(task.user_inputs?.toggles?.security),
        monolith_risk: Boolean(task.user_inputs?.toggles?.monolith_risk),
        overengineering_risk: Boolean(task.user_inputs?.toggles?.overengineering_risk),
        tests_required: Boolean(task.user_inputs?.toggles?.tests)
      },
      previous_decisions: previousDecisions,
      previous_flaws_and_user_decisions: previousFlaws
    };

    return [
      "You are a planning analyst.",
      "Return ONLY valid JSON.",
      "No markdown.",
      "No code fences.",
      "No prose before or after JSON.",
      "Do not write implementation code.",
      "Maximum 5 flaws.",
      "If there are no flaws, return \"flaws\": [].",
      "Use only allowed flaw categories: bugs, security, monolith, overengineering, unclear_requirements, missing_tests, data_loss, performance.",
      "Use only allowed verdicts: blocker, important, later, noise.",
      "implementation_steps must be small and independently buildable.",
      "Avoid overengineering.",
      "Identify blockers honestly.",
      "Do not add trailing commas.",
      "",
      "Required JSON shape (exact keys):",
      "{",
      "  \"plan\": {",
      "    \"goal\": \"one sentence goal\",",
      "    \"context\": \"brief context about what this connects to\",",
      "    \"decisions\": [\"decision 1\", \"decision 2\"],",
      "    \"architecture\": [\"component 1\", \"component 2\"],",
      "    \"implementation_steps\": [",
      "      \"Step 1: short description\",",
      "      \"Step 2: short description\"",
      "    ],",
      "    \"out_of_scope\": [\"thing 1\", \"thing 2\"],",
      "    \"acceptance_criteria\": [\"criteria 1\", \"criteria 2\"],",
      "    \"test_plan\": [\"test 1\", \"test 2\"]",
      "  },",
      "  \"flaws\": [",
      "    {",
      "      \"title\": \"short flaw title\",",
      "      \"category\": \"bugs | security | monolith | overengineering | unclear_requirements | missing_tests | data_loss | performance\",",
      "      \"verdict\": \"blocker | important | later | noise\",",
      "      \"why_it_matters\": \"one sentence\",",
      "      \"recommended_action\": \"one sentence\"",
      "    }",
      "  ],",
      "  \"summary\": {",
      "    \"is_ready_for_codex\": false,",
      "    \"reason\": \"why ready or not ready\",",
      "    \"recommended_next_step\": \"what to do next\"",
      "  }",
      "}",
      "",
      "Input:",
      JSON.stringify(payload, null, 2)
    ].join("\n");
  }

  function generateCodexPrompt(task, stepIndex, state) {
    const project = (state.projects || []).find((item) => item.id === task.project_id) || null;
    const latestParsed = [...(task.ai_rounds || [])].reverse().find((round) => round.parse_ok && round.parsed && round.parsed.plan);
    const plan = latestParsed?.parsed?.plan || {};
    const steps = safeArray(plan.implementation_steps);
    const currentStep = steps[stepIndex] || "";
    const completed = safeArray(task.completed_steps_indexes)
      .map((idx) => (steps[idx] ? `- [x] Step ${idx + 1}: ${steps[idx]}` : null))
      .filter(Boolean);

    const future = steps
      .map((step, idx) => ({ step, idx }))
      .filter((item) => item.idx > stepIndex)
      .map((item) => `- Step ${item.idx + 1}: ${item.step} (DO NOT IMPLEMENT IN THIS RUN)`);

    const decisions = safeArray(plan.decisions).map((d) => `- ${d}`);
    const acceptedFlaws = safeArray(task.processed_flaws)
      .filter((flaw) => flaw.user_decision === "accept")
      .map((flaw) => `- ${flaw.title} (${flaw.category}/${flaw.verdict}): ${flaw.recommended_action}`);
    const outOfScope = safeArray(plan.out_of_scope).map((v) => `- ${v}`);
    const acceptance = safeArray(plan.acceptance_criteria).map((v) => `- ${v}`);
    const testPlan = safeArray(plan.test_plan).map((v) => `- ${v}`);

    return [
      `Project: ${project?.name || "Unknown Project"}`,
      `Task: ${task.title || "Untitled Task"}`,
      `Goal: ${plan.goal || task.user_inputs?.goal || ""}`,
      `Context: ${plan.context || ""}`,
      "",
      `Current Step (implement ONLY this step):`,
      `- Step ${stepIndex + 1}: ${currentStep}`,
      "",
      "Completed Steps:",
      completed.length ? completed.join("\n") : "- none",
      "",
      "Future Steps (DO NOT IMPLEMENT):",
      future.length ? future.join("\n") : "- none",
      "",
      "Plan Decisions:",
      decisions.length ? decisions.join("\n") : "- none",
      "",
      "Accepted Flaws as Constraints:",
      acceptedFlaws.length ? acceptedFlaws.join("\n") : "- none",
      "",
      "Out of Scope:",
      outOfScope.length ? outOfScope.join("\n") : "- none",
      "",
      "Acceptance Criteria:",
      acceptance.length ? acceptance.join("\n") : "- none",
      "",
      "Test Plan:",
      testPlan.length ? testPlan.join("\n") : "- none",
      "",
      "Rules:",
      "- Implement ONLY the current step.",
      "- Do not implement future steps.",
      "- Do not touch unrelated files.",
      "- Do not create monolithic files.",
      "- Do not overengineer.",
      "- Add/update tests where relevant.",
      "- Run relevant checks/build.",
      "- List changed files.",
      "- Commit locally after successful checks.",
      "- Push to remote if origin exists.",
      "- Stop after this step."
    ].join("\n");
  }

  window.NextStepPrompts = { generateMegaPrompt, generateCodexPrompt };
})();