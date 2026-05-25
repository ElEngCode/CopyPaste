const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "renderer", "debate-prompts.js"), "utf8"), context);

const prompts = context.window.NextStepDebatePrompts;
const debate = {
  title: "Offline CRM",
  raw_idea: "A local-first CRM for freelancers",
  goal: "Plan a reliable desktop CRM",
  participants: [],
  rounds: [
    { round_number: 1, type: "research", response: "Research: local-first apps use sync queues." },
    { round_number: 2, type: "plan", response: "Plan: Electron, SQLite, tests." },
    { round_number: 3, type: "critique", response: "Critique: define backup and conflict risks." }
  ],
  consensus: {
    project_name: "Offline CRM",
    goal: "Plan a reliable desktop CRM",
    target_users: ["freelancers"],
    core_features: ["contacts"],
    architecture: ["Electron renderer", "local storage"],
    data_model: ["Contact"],
    implementation_stages: [
      {
        title: "Stage 1",
        goal: "Create shell",
        scope: ["navigation"],
        out_of_scope: ["sync"],
        acceptance_criteria: ["opens"],
        tests: ["npm test"]
      },
      {
        title: "Stage 2",
        goal: "Add contacts",
        scope: ["CRUD"],
        out_of_scope: ["billing"],
        acceptance_criteria: ["saves contacts"],
        tests: ["CRUD tests"]
      }
    ],
    risks: ["data loss"],
    open_questions: ["sync provider"],
    final_recommendation: "Build in stages."
  }
};

const research = prompts.generateResearchPrompt(debate);
assert.match(research, /successful similar products/i);
assert.match(research, /UX patterns/i);
assert.match(research, /implementation stages/i);

const critic = prompts.generateCriticPrompt(debate, "current plan", debate.rounds);
assert.match(critic, /security\/data risks/i);
assert.match(critic, /overengineering/i);
assert.match(critic, /better alternatives/i);

const consensus = prompts.generateConsensusPrompt(debate);
assert.match(consensus, /"implementation_stages"/);
assert.match(consensus, /final JSON plan/i);

const finalPrompts = prompts.generateFinalMegaPrompts(debate);
assert.equal(finalPrompts.length, 2);
assert.match(finalPrompts[0].prompt, /implement only current stage/i);
assert.match(finalPrompts[0].prompt, /DO NOT IMPLEMENT/i);
assert.match(finalPrompts[0].prompt, /commit locally/i);
assert.equal(finalPrompts[0].done, false);
