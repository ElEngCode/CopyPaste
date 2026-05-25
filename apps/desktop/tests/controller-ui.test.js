const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
globalThis.NextStepAiProjectBuilderProtocol = require("../../../packages/protocol");
const {
  getWorkflowStatusView,
  getProviderDisplayList,
  getNewProjectDraft,
  createRootDebateState,
  createStageWorkflowPayload,
  applyDebateResponse,
  getDebateStageView,
  renderProjectPlanHtml,
  getRoundPreview
} = require("../renderer");

assert.deepEqual(getWorkflowStatusView({
  message: "Extension connected. Ready for next AI step.",
  tone: "success",
  nextTarget: "ChatGPT"
}), {
  connected: true,
  connectionText: "Connected",
  readinessText: "Ready",
  detailText: "Next send is gated for ChatGPT",
  nextTarget: "ChatGPT"
});

assert.deepEqual(getWorkflowStatusView({
  message: "Extension disconnected. Waiting for reconnect...",
  tone: "error"
}), {
  connected: false,
  connectionText: "Waiting for extension",
  readinessText: "Waiting",
  detailText: "Open or reload the extension, then send manually",
  nextTarget: "ChatGPT"
});

assert.deepEqual(getProviderDisplayList().map((provider) => ({
  id: provider.id,
  label: provider.label,
  disabled: provider.disabled,
  badge: provider.badge
})), [
  { id: "chatgpt", label: "ChatGPT", disabled: false, badge: "Active" },
  { id: "claude", label: "Claude", disabled: false, badge: "Active" },
  { id: "gemini", label: "Gemini", disabled: true, badge: "Future" },
  { id: "grok", label: "Grok", disabled: true, badge: "Future" }
]);

assert.deepEqual(getNewProjectDraft(), {
  projectName: "",
  projectPath: "",
  packTitle: "",
  branchName: "",
  commitMessage: ""
});

const debate = createRootDebateState("Build a desktop planner");
assert.equal(debate.current_stage_id, "gpt_clarifier");
assert.equal(debate.rounds.length, 0);

const firstView = getDebateStageView(debate);
assert.equal(firstView.currentStage, "GPT Clarifier");
assert.equal(firstView.currentProvider, "ChatGPT");
assert.equal(firstView.nextProvider, "ChatGPT");
assert.equal(firstView.rounds.length, 0);

const firstPayload = createStageWorkflowPayload(debate);
assert.equal(firstPayload.targetProvider, "chatgpt");
assert.equal(firstPayload.currentStageId, "gpt_clarifier");
assert.equal(firstPayload.chatgptPrefix, "");
assert.equal(firstPayload.claudePrefix, "");
assert.match(firstPayload.text, /Stage: GPT Clarifier/);
assert.match(firstPayload.text, /Build a desktop planner/);

const afterResponse = applyDebateResponse(debate, "Clarified project brief");
assert.equal(afterResponse.savedRound.stage_id, "gpt_clarifier");
assert.equal(afterResponse.savedRound.provider, "chatgpt");
assert.equal(afterResponse.savedRound.response_received, "Clarified project brief");
assert.equal(afterResponse.debate.current_stage_id, "gpt_planner");
assert.equal(afterResponse.stageView.currentStage, "GPT Planner");
assert.equal(afterResponse.stageView.currentProvider, "ChatGPT");
assert.equal(afterResponse.stageView.nextProvider, "Claude");
assert.equal(afterResponse.stageView.rounds.length, 1);

const secondPayload = createStageWorkflowPayload(afterResponse.debate);
assert.equal(secondPayload.targetProvider, "chatgpt");
assert.equal(secondPayload.currentStageId, "gpt_planner");
assert.match(secondPayload.text, /Stage: GPT Planner/);
assert.match(secondPayload.text, /Clarified project brief/);

const readablePlanHtml = renderProjectPlanHtml(`Thinking
Assembled structured critique identifying practical risks systematically
Critique: Premium Ping Pong Ball Project Plan

What the Plan Does Well
Correctly reframes "perfect" as measurable
Includes a staged approach

---

Critical Risks and Weaknesses

1. No Competitive Differentiation Analysis
The plan says "analyze existing premium balls" but never defines the gap.
Risk: The product may already be solved.

<script>alert("x")</script>`);

assert.doesNotMatch(readablePlanHtml, /Thinking/);
assert.match(readablePlanHtml, /<article class="plan-document">/);
assert.match(readablePlanHtml, /<div class="plan-eyebrow">Assembled structured critique identifying practical risks systematically<\/div>/);
assert.match(readablePlanHtml, /<h3 class="plan-title">Critique: Premium Ping Pong Ball Project Plan<\/h3>/);
assert.match(readablePlanHtml, /<h4 class="plan-heading">What the Plan Does Well<\/h4>/);
assert.match(readablePlanHtml, /<li>Correctly reframes &quot;perfect&quot; as measurable<\/li>/);
assert.match(readablePlanHtml, /<h4 class="plan-heading">Critical Risks and Weaknesses<\/h4>/);
assert.match(readablePlanHtml, /<h4 class="plan-numbered-heading">1\. No Competitive Differentiation Analysis<\/h4>/);
assert.match(readablePlanHtml, /<li>The plan says &quot;analyze existing premium balls&quot; but never defines the gap\.<\/li>/);
assert.match(readablePlanHtml, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
assert.doesNotMatch(readablePlanHtml, /<script>/);

const compactClaudeHtml = renderProjectPlanHtml(`Critique: Project
What the Plan Does Well
Includes a staged approach
Critical Risks and Weaknesses
1. Missing validation
Risk: Tests are vague`);
assert.match(compactClaudeHtml, /<h4 class="plan-heading">Critical Risks and Weaknesses<\/h4>/);
assert.doesNotMatch(compactClaudeHtml, /<li>Critical Risks and Weaknesses<\/li>/);

assert.equal(getRoundPreview("Thinking\n\n- First useful point\n- Second useful point"), "First useful point - Second useful point");

const rootHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(rootHtml, /AI Project Builder/);
assert.match(rootHtml, /Project idea \/ Working plan/);
assert.match(rootHtml, /AI Debate/);
assert.match(rootHtml, /Project Plan/);
assert.match(rootHtml, /Codex Prompts/);
assert.match(rootHtml, /Current stage/);
assert.match(rootHtml, /Current provider/);
assert.match(rootHtml, /Round history/);
assert.match(rootHtml, /Generate Codex Prompts/);
assert.match(rootHtml, /Advanced settings/);
assert.match(rootHtml, /Defaults work for most projects/);
assert.match(rootHtml, /Return plain text only/);
assert.match(rootHtml, /Do not use artifacts, widgets, cards, tables, diagrams, interactive views, visualizations, HTML, CSS, or custom UI formatting/);
assert.match(rootHtml, /height: clamp\(420px, calc\(100vh - 210px\), 760px\)/);
assert.match(rootHtml, /overflow-wrap: anywhere/);
assert.match(rootHtml, /scrollbar-gutter: stable/);
assert.match(rootHtml, /\.plan-document/);
assert.match(rootHtml, /\.plan-eyebrow/);
assert.match(rootHtml, /\.plan-numbered-heading/);
assert.match(rootHtml, /\.plan-list/);
assert.match(rootHtml, /Gemini <span class="provider-badge">Future/);
assert.match(rootHtml, /Grok <span class="provider-badge">Future/);
assert.doesNotMatch(rootHtml, /Next Step Controller/);
assert.doesNotMatch(rootHtml, /Generate Codex Pack/);
assert.doesNotMatch(rootHtml, /Copy Launcher/);
assert.doesNotMatch(rootHtml, />[^<]*chunks?[^<]*</i);
assert.doesNotMatch(rootHtml, /Prompt pack title/);
assert.doesNotMatch(rootHtml, /editor-toolbar/);
assert.doesNotMatch(rootHtml, /title="Help"/);
assert.doesNotMatch(rootHtml, /title="Settings"/);
