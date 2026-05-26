const assert = require("node:assert/strict");

const protocol = require("../../../packages/protocol");

const providers = protocol.listProviders();
assert.equal(providers.length, 4);
assert.deepEqual(
  providers.map((provider) => provider.id),
  ["chatgpt", "claude", "gemini", "grok"]
);

assert.equal(protocol.getProvider("chatgpt").status, "active");
assert.equal(protocol.getProvider("chatgpt").validated, true);
assert.equal(protocol.getProvider("claude").status, "active");
assert.equal(protocol.getProvider("claude").validated, true);
assert.equal(protocol.getProvider("gemini").status, "coming_later");
assert.equal(protocol.getProvider("gemini").enabled, false);
assert.equal(protocol.getProvider("grok").status, "coming_later");
assert.equal(protocol.getProvider("grok").enabled, false);
assert.equal(protocol.isProviderRunnable("chatgpt"), true);
assert.equal(protocol.isProviderRunnable("claude"), true);
assert.equal(protocol.isProviderRunnable("gemini"), false);
assert.equal(protocol.isProviderRunnable("grok"), false);

const planningStages = protocol.listPlanningDebateStages();
assert.deepEqual(planningStages.map((stage) => stage.id), [
  "gpt_clarifier",
  "gpt_planner",
  "claude_critic",
  "gpt_rebuttal",
  "gpt_revised_plan",
  "claude_final_review",
  "gpt_final_synthesis"
]);
assert.equal(protocol.getPlanningDebateStage("claude_critic").provider, "claude");
assert.equal(protocol.getNextPlanningDebateStage("claude_critic").id, "gpt_rebuttal");

const workflow = protocol.createAiProjectBuilderWorkflow({
  idea: "Build a local project planner",
  title: "Planner"
});

assert.deepEqual(
  workflow.steps.map((step) => step.id),
  [
    "idea",
    "gpt_clarifier",
    "gpt_planner",
    "claude_critic",
    "gpt_rebuttal",
    "gpt_revised_plan",
    "claude_final_review",
    "gpt_final_synthesis",
    "codex_prompt_forge",
    "claude_prompt_qa",
    "gpt_prompt_polish"
  ]
);

assert.equal(workflow.steps[1].provider, "chatgpt");
assert.equal(workflow.steps[3].provider, "claude");
assert.equal(workflow.steps[8].output_kind, "codex_prompt");
assert.equal(workflow.steps[9].input_kind, "codex_prompt");

const critiqueItem = protocol.createCritiqueItem({
  source_step_id: "claude_critic",
  title: "Add backup criteria",
  status: "reject",
  gpt_response: "Out of scope for the first implementation slice."
});

assert.equal(critiqueItem.status, "reject");
assert.equal(critiqueItem.decision_owner, "gpt");
assert.equal(critiqueItem.source_provider, "claude");
assert.equal(protocol.CRITIQUE_DECISION_STATUSES.includes("accept"), true);
assert.equal(protocol.CRITIQUE_DECISION_STATUSES.includes("reject"), true);
assert.equal(protocol.CRITIQUE_DECISION_STATUSES.includes("needs_user_decision"), true);

assert.throws(
  () => protocol.createCritiqueItem({ title: "Invalid", status: "maybe" }),
  /Invalid critique status/
);

const debate = protocol.createProjectBuilderDebate({
  title: "Planner",
  raw_idea: "Build a local project planner"
});
assert.equal(debate.raw_idea, "Build a local project planner");
assert.equal(debate.current_stage_id, "gpt_clarifier");
assert.equal(debate.status, "ready_for_user");
assert.equal(debate.human_gated, true);
assert.deepEqual(debate.rounds, []);

const nextPrompt = protocol.createNextDebatePrompt(debate);
assert.equal(nextPrompt.stage_id, "gpt_clarifier");
assert.equal(nextPrompt.provider, "chatgpt");
assert.equal(nextPrompt.role, "clarifier");
assert.match(nextPrompt.prompt, /Build a local project planner/);
assert.match(nextPrompt.prompt, /GPT Clarifier/);
assert.match(nextPrompt.prompt, /Return plain text only/);
assert.match(nextPrompt.prompt, /simple Markdown headings and bullet lists only/);
assert.equal(debate.rounds.length, 0);

const savedRound = protocol.saveDebateRound(debate, {
  prompt_sent: nextPrompt.prompt,
  response_received: "Clarified brief",
  status: "received"
});
assert.equal(savedRound.stage_id, "gpt_clarifier");
assert.equal(savedRound.provider, "chatgpt");
assert.equal(savedRound.role, "clarifier");
assert.equal(savedRound.prompt_sent, nextPrompt.prompt);
assert.equal(savedRound.response_received, "Clarified brief");
assert.equal(savedRound.prompt, nextPrompt.prompt);
assert.equal(savedRound.response, "Clarified brief");
assert.ok(savedRound.sent_at);
assert.ok(savedRound.received_at);
assert.equal(debate.rounds.length, 1);
assert.equal(debate.current_stage_id, "gpt_clarifier");

const advanced = protocol.advanceDebateStage(debate);
assert.equal(advanced.ok, true);
assert.equal(advanced.current_stage_id, "gpt_planner");
assert.equal(debate.status, "ready_for_user");

const plannerPrompt = protocol.createNextDebatePrompt(debate);
assert.equal(plannerPrompt.stage_id, "gpt_planner");
assert.match(plannerPrompt.prompt, /Clarified brief/);
assert.equal(debate.rounds.length, 1);

const criticPrompt = protocol.buildPlanningDebatePrompt(
  { current_stage_id: "claude_critic", rounds: debate.rounds },
  { idea: "Build a local project planner" },
  debate.rounds
);
assert.equal(criticPrompt.provider, "claude");
assert.match(criticPrompt.prompt, /Critique requirements/);
assert.match(criticPrompt.prompt, /missing tests/);

const rebuttalPrompt = protocol.buildPlanningDebatePrompt(
  { current_stage_id: "gpt_rebuttal", rounds: debate.rounds },
  { idea: "Build a local project planner" },
  debate.rounds
);
assert.match(rebuttalPrompt.prompt, /decision: accept \| reject \| needs_user_decision/);

const synthesisPrompt = protocol.buildPlanningDebatePrompt(
  { current_stage_id: "gpt_final_synthesis", rounds: debate.rounds },
  { idea: "Build a local project planner" },
  debate.rounds
);
assert.match(synthesisPrompt.prompt, /final master plan/i);

const roadmapPrompt = protocol.buildRoadmapPrompt(
  { name: "Planner", path: "F:\\Projects\\Planner" },
  "# Master Plan\n\nUse staged delivery."
);
assert.match(roadmapPrompt, /Generate a project roadmap strictly from the applied master plan/);
assert.match(roadmapPrompt, /Return JSON only with shape/);
const improveTaskPrompt = protocol.buildTaskImprovePrompt(
  { name: "Planner", path: "F:\\Projects\\Planner" },
  { title: "Task 1", content: "Current prompt body" },
  "# Master Plan\n\nBody",
  [{ note: "Run #1 completed." }]
);
assert.match(improveTaskPrompt, /Return only improved prompt/);

const parsedDirectRoadmap = protocol.parseRoadmapResponse(JSON.stringify({
  items: [{
    id: "roadmap_1",
    order: 1,
    title: "Task 1",
    goal: "Goal",
    why: "Why",
    targetFiles: ["a.js"],
    researchNeeded: [],
    acceptanceCriteria: [],
    verificationCommands: ["npm.cmd run verify"],
    dependsOn: [],
    parallelGroup: ""
  }]
}));
assert.equal(parsedDirectRoadmap.items.length, 1);
assert.equal(parsedDirectRoadmap.items[0].id, "roadmap_1");

const parsedFencedRoadmap = protocol.parseRoadmapResponse("```json\n{\"items\":[{\"id\":\"roadmap_1\",\"order\":1,\"title\":\"Task 1\",\"goal\":\"Goal\",\"why\":\"Why\",\"targetFiles\":[],\"researchNeeded\":[],\"acceptanceCriteria\":[],\"verificationCommands\":[\"npm.cmd run verify\"],\"dependsOn\":[],\"parallelGroup\":\"\"}]}\n```");
assert.equal(parsedFencedRoadmap.items[0].title, "Task 1");

assert.throws(
  () => protocol.parseRoadmapResponse("{\"items\":[{\"id\":\"roadmap_1\",\"order\":1,\"title\":\"A\",\"goal\":\"G\",\"why\":\"W\",\"targetFiles\":[],\"researchNeeded\":[],\"acceptanceCriteria\":[],\"verificationCommands\":[\"npm.cmd run verify\"],\"dependsOn\":[\"roadmap_2\"],\"parallelGroup\":\"\"}]}"),
  /Invalid roadmap response/
);
