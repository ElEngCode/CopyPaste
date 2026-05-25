const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "renderer", "state.js"), "utf8"), context);

const stateApi = context.window.NextStepState;
const appState = { debates: [], active_debate_id: null };
const debate = stateApi.createDebate("Planning Tool", "raw project idea", "ship a planner");

assert.equal(debate.title, "Planning Tool");
assert.equal(debate.raw_idea, "raw project idea");
assert.equal(debate.goal, "ship a planner");
assert.equal(debate.status, "draft");
assert.equal(debate.protocol, "ai_project_builder");
assert.equal(debate.current_stage_id, "gpt_clarifier");
assert.equal(debate.human_gated, true);
assert.equal(debate.auto_loop, false);
assert.equal(debate.target_rounds, 4);
assert.equal(debate.active_round_index, 0);
assert.equal(debate.participants.length, 2);
assert.equal(debate.participants[0].id, "planner");
assert.equal(debate.participants[1].provider, "claude");
assert.equal(Array.isArray(debate.rounds), true);
assert.equal(debate.rounds.length, 0);
assert.equal(Array.isArray(debate.final_megaprompts), true);
assert.equal(debate.final_megaprompts.length, 0);

appState.debates.push(debate);
stateApi.selectDebate(appState, debate.id);
assert.equal(appState.active_debate_id, debate.id);
assert.equal(stateApi.getActiveDebate(appState).id, debate.id);

const round = stateApi.addDebateRound(appState, debate.id, {
  type: "research",
  participant_id: "planner",
  prompt: "research prompt"
});
assert.equal(round.round_number, 1);
assert.equal(round.stage_id, "gpt_clarifier");
assert.equal(round.provider, "chatgpt");
assert.equal(round.role, "clarifier");
assert.equal(round.prompt_sent, "research prompt");
assert.equal(round.response, "");
assert.equal(round.parse_ok, false);
assert.equal(stateApi.getActiveDebate(appState).active_round_index, 0);

const updated = stateApi.updateDebateRound(appState, debate.id, round.id, {
  response: "answer",
  parse_ok: true,
  parsed: { ok: true }
});
assert.equal(updated.response, "answer");
assert.equal(updated.parse_ok, true);

const log = stateApi.addDebateLog(appState, debate.id, "info", "saved");
assert.equal(log.level, "info");
assert.equal(stateApi.getActiveDebate(appState).logs.length, 1);
