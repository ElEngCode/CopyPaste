const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const protocol = require("../../../packages/protocol");
const { createVaultStore } = require("../prompt-vault");
const {
  rememberPendingWorkflowRequest,
  backfillWorkflowResponseMetadata,
  clearPendingWorkflowRequest
} = require("../main/workflow-request-correlation");

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
  assert.equal(nextEligible.nextItem.id, "roadmap_2");

  assert.ok(fs.existsSync(path.join(projectPath, "masterplan.md")));
  assert.ok(fs.existsSync(path.join(projectPath, "plan-roadmap.md")));
  const tasksDirFiles = fs.readdirSync(path.join(projectPath, "tasks")).filter((name) => /^task-001-.*\.md$/i.test(name));
  assert.ok(tasksDirFiles.length >= 1);

  const oldExtensionProjectPath = path.join(tmpRoot, "OldExtension");
  fs.mkdirSync(oldExtensionProjectPath, { recursive: true });
  const oldExtensionProject = store.saveProjectBrief({
    projectName: "Old Extension",
    projectPath: oldExtensionProjectPath,
    idea: "Generate a master plan from an old extension response.",
    masterPlan: ""
  }).project;
  const requestId = "req_old_extension";
  store.writePlanningSession(oldExtensionProject.id, {
    phase: "idea",
    activeContext: "master_generate",
    activeRequestId: requestId,
    busyState: true,
    lastProvider: "ChatGPT",
    lastError: ""
  });
  const socket = {};
  const registry = new WeakMap();
  rememberPendingWorkflowRequest(registry, socket, {
    requestId,
    projectId: oldExtensionProject.id,
    activeContext: "master_generate",
    targetProvider: "chatgpt"
  });
  const correlated = backfillWorkflowResponseMetadata(registry, socket, {
    ok: true,
    target: "chatgpt",
    text: "Old extension master plan response"
  });
  assert.equal(correlated.response.requestId, requestId);
  const draft = store.addMasterPlanVersion(correlated.response.projectId, {
    source: correlated.response.activeContext,
    promptSnapshot: "Generate Master Plan",
    responseText: correlated.response.text
  }).version;
  store.writePlanningSession(oldExtensionProject.id, {
    phase: "master_draft",
    masterPlanDraftVersionId: draft.id,
    activeRequestId: "",
    activeContext: "",
    busyState: false
  });
  clearPendingWorkflowRequest(registry, socket, requestId);
  const recoveredSession = store.getOrInitPlanningSession(oldExtensionProject.id).session;
  assert.equal(recoveredSession.busyState, false);
  assert.equal(recoveredSession.phase, "master_draft");
  assert.equal(recoveredSession.masterPlanDraftVersionId, draft.id);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
