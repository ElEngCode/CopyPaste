const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const protocol = require("../../../packages/protocol");
const { createVaultStore } = require("../prompt-vault");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "next-step-workflow-integration-"));

try {
  const dbPath = path.join(tmpRoot, "prompt-vault-db.json");
  const projectPath = path.join(tmpRoot, "Planner");
  fs.mkdirSync(projectPath, { recursive: true });
  const store = createVaultStore({ dbPath });

  const saved = store.saveProjectBrief({
    projectName: "Planner",
    projectPath,
    idea: "Build a deterministic planning workflow.",
    masterPlan: ""
  });
  const projectId = saved.project.id;
  const workflow = store.createDebateWorkflow(projectId).workflow;
  const stages = protocol.listPlanningDebateStages();
  for (const stage of stages) {
    const built = protocol.buildPlanningDebatePrompt(workflow, saved.project, workflow.rounds || []);
    store.saveDebateRound(workflow.id, {
      stageId: stage.id,
      provider: stage.provider,
      role: stage.role,
      promptText: built.prompt,
      responseText: `${stage.id} response`
    });
    store.advanceDebateWorkflow(workflow.id);
  }
  const finalWorkflow = store.getDebateWorkflow(workflow.id).workflow;
  const finalRound = finalWorkflow.rounds.find((round) => round.stageId === "gpt_final_synthesis");
  const planVersion = store.createMasterPlanVersionFromDebate(workflow.id, finalRound.id).version;
  store.applyMasterPlanVersion(projectId, planVersion.id);

  const roadmap = {
    items: [
      {
        id: "roadmap_1",
        order: 1,
        title: "Task 1",
        goal: "Goal 1",
        why: "Why 1",
        targetFiles: ["apps/desktop/prompt-vault.js"],
        researchNeeded: [],
        acceptanceCriteria: ["AC1"],
        verificationCommands: ["npm.cmd run verify"],
        dependsOn: [],
        parallelGroup: ""
      },
      {
        id: "roadmap_2",
        order: 2,
        title: "Task 2",
        goal: "Goal 2",
        why: "Why 2",
        targetFiles: ["apps/desktop/renderer.js"],
        researchNeeded: [],
        acceptanceCriteria: ["AC2"],
        verificationCommands: ["npm.cmd run verify"],
        dependsOn: ["roadmap_1"],
        parallelGroup: ""
      }
    ]
  };
  const activePackId = store.getState().projects.find((project) => project.id === projectId).activePromptPackId;
  const roadmapVersion = store.addRoadmapVersion(activePackId, {
    source: "fixture_json",
    responseText: JSON.stringify(roadmap)
  }).version;
  store.applyRoadmapVersion(activePackId, roadmapVersion.id);
  const taskPrompt = store.createTaskPromptFromRoadmapItem(projectId, "roadmap_1").taskPrompt;
  const improved = store.saveTaskImproveResponse(taskPrompt.id, "Improved task prompt content.").version;
  store.applyTaskPromptVersion(taskPrompt.id, improved.id);
  store.approveTaskPrompt(taskPrompt.id);
  const handoff = store.copyCodexHandoff(taskPrompt.id);
  assert.match(handoff.handoffText, /Full task prompt/);
  const done = store.markTaskPromptDone(taskPrompt.id, {
    note: "Completed task 1",
    result: "ok",
    commitHash: "abc123",
    verificationSummary: "verify ok"
  });
  assert.equal(done.taskPrompt.status, "done");
  const nextEligible = store.getNextEligibleRoadmapItem(projectId);
  assert.ok(nextEligible.nextItem);

  assert.ok(fs.existsSync(path.join(projectPath, "masterplan.md")));
  assert.ok(fs.existsSync(path.join(projectPath, "plan-roadmap.md")));
  const tasksDirFiles = fs.readdirSync(path.join(projectPath, "tasks")).filter((name) => /^task-001-.*\.md$/i.test(name));
  assert.ok(tasksDirFiles.length >= 1);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
