const assert = require("node:assert/strict");
const storage = require("../main/storage");

const migrated = storage.migrateState({
  schema_version: 1,
  projects: [],
  tasks: [],
  active_project_id: null,
  active_task_id: null,
  settings: {},
  metrics: {}
});

assert.deepEqual(migrated.debates, []);
assert.equal(migrated.active_debate_id, null);

const withBadDebates = storage.migrateState({
  schema_version: 1,
  projects: [],
  tasks: [],
  debates: [{ title: "Untyped", rounds: [{}], logs: [{}] }],
  active_debate_id: "missing",
  settings: {},
  metrics: {}
});

assert.equal(withBadDebates.debates.length, 1);
assert.ok(withBadDebates.debates[0].id);
assert.equal(withBadDebates.debates[0].participants.length, 2);
assert.equal(withBadDebates.debates[0].rounds[0].round_number, 1);
assert.equal(withBadDebates.active_debate_id, withBadDebates.debates[0].id);

const oldProjectBuilderDb = storage.migrateState({
  schema_version: 1,
  projects: [],
  tasks: [],
  debates: [{
    id: "debate_old",
    title: "Old Debate",
    raw_idea: "Legacy raw idea",
    rounds: [{
      type: "plan",
      participant_id: "planner",
      prompt: "Legacy prompt",
      response: "Legacy response"
    }]
  }],
  active_debate_id: "debate_old",
  settings: {},
  metrics: {}
});

const oldDebate = oldProjectBuilderDb.debates[0];
assert.equal(oldDebate.raw_idea, "Legacy raw idea");
assert.equal(oldDebate.current_stage_id, "gpt_planner");
assert.equal(oldDebate.human_gated, true);
assert.equal(oldDebate.rounds[0].prompt_sent, "Legacy prompt");
assert.equal(oldDebate.rounds[0].response_received, "Legacy response");
assert.equal(oldDebate.rounds[0].provider, "chatgpt");
assert.equal(oldDebate.rounds[0].role, "planner");
assert.equal(oldDebate.rounds[0].status, "received");
