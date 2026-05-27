(function () {
  const ALLOWED_CATEGORIES = new Set([
    "bugs",
    "security",
    "monolith",
    "overengineering",
    "unclear_requirements",
    "missing_tests",
    "data_loss",
    "performance"
  ]);

  const ALLOWED_VERDICTS = new Set(["blocker", "important", "later", "noise"]);

  function extractJSONCandidates(rawText) {
    const text = String(rawText || "");
    const candidates = [];

    const blockRegex = /```json\s*([\s\S]*?)```/gi;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(text)) !== null) {
      const candidate = blockMatch[1].trim();
      if (candidate) candidates.push(candidate);
    }

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }

      if (char === "}") {
        if (depth > 0) {
          depth -= 1;
          if (depth === 0 && start >= 0) {
            candidates.push(text.slice(start, i + 1));
            start = -1;
          }
        }
      }
    }

    const unique = [];
    const seen = new Set();
    for (const c of candidates) {
      const v = c.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      unique.push(v);
    }

    return unique;
  }

  function validatePlanningShape(data) {
    if (!data || typeof data !== "object") return false;
    if (!data.plan || typeof data.plan !== "object" || Array.isArray(data.plan)) return false;
    if (typeof data.plan.goal !== "string") return false;
    if (typeof data.plan.context !== "string") return false;
    if (!Array.isArray(data.plan.decisions)) return false;
    if (!Array.isArray(data.plan.architecture)) return false;
    if (!Array.isArray(data.plan.implementation_steps) || data.plan.implementation_steps.length === 0) return false;
    if (!Array.isArray(data.plan.out_of_scope)) return false;
    if (!Array.isArray(data.plan.acceptance_criteria)) return false;
    if (!Array.isArray(data.plan.test_plan)) return false;
    if (!Array.isArray(data.flaws)) return false;
    if (!data.summary || typeof data.summary !== "object" || Array.isArray(data.summary)) return false;
    return true;
  }

  function normalizeCategory(value) {
    const v = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    return ALLOWED_CATEGORIES.has(v) ? v : "unclear_requirements";
  }

  function normalizeVerdict(value) {
    const v = String(value || "").trim().toLowerCase();
    return ALLOWED_VERDICTS.has(v) ? v : "important";
  }

  function toStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  function normalizePlanningResponse(data) {
    const normalized = {
      plan: {
        goal: String(data.plan.goal || "").trim(),
        context: String(data.plan.context || "").trim(),
        decisions: toStringArray(data.plan.decisions),
        architecture: toStringArray(data.plan.architecture),
        implementation_steps: toStringArray(data.plan.implementation_steps),
        out_of_scope: toStringArray(data.plan.out_of_scope),
        acceptance_criteria: toStringArray(data.plan.acceptance_criteria),
        test_plan: toStringArray(data.plan.test_plan)
      },
      flaws: [],
      summary: {
        is_ready_for_codex: Boolean(data.summary.is_ready_for_codex),
        reason: String(data.summary.reason || "").trim(),
        recommended_next_step: String(data.summary.recommended_next_step || "").trim()
      }
    };

    const sourceFlaws = Array.isArray(data.flaws) ? data.flaws : [];
    normalized.flaws = sourceFlaws
      .slice(0, 5)
      .map((flaw, index) => ({
        id: flaw && flaw.id ? String(flaw.id) : `flaw_${Date.now()}_${index}`,
        title: String(flaw?.title || "").trim(),
        category: normalizeCategory(flaw?.category),
        verdict: normalizeVerdict(flaw?.verdict),
        why_it_matters: String(flaw?.why_it_matters || "").trim(),
        recommended_action: String(flaw?.recommended_action || "").trim()
      }));

    return normalized;
  }

  function parsePlanningResponse(rawText) {
    const candidates = extractJSONCandidates(rawText);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (!validatePlanningShape(parsed)) {
          continue;
        }
        return { ok: true, data: normalizePlanningResponse(parsed) };
      } catch (_error) {
        // Try next candidate.
      }
    }

    return { ok: false, error: "No valid planning JSON found." };
  }

  window.NextStepParser = {
    extractJSONCandidates,
    parsePlanningResponse,
    validatePlanningShape,
    normalizeCategory,
    normalizeVerdict,
    normalizePlanningResponse
  };
})();

