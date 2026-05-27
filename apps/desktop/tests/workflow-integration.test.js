const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const protocol = require("../../../packages/protocol");
globalThis.NextStepAiProjectBuilderProtocol = protocol;
const { buildProjectBrowserTree, buildProjectWorkflowView, getPlanPrimaryAction } = require("../renderer");
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
  const stateAfterRoadmap = store.getState();
  const initialPrimaryAction = getPlanPrimaryAction({
    project: stateAfterRoadmap.projects.find((project) => project.id === projectId),
    pack: stateAfterRoadmap.promptPacks.find((pack) => pack.id === activePackId),
    taskPrompts: stateAfterRoadmap.taskPrompts.filter((prompt) => prompt.projectId === projectId)
  });
  assert.equal(initialPrimaryAction.handler, "startNextTask");
  assert.equal(initialPrimaryAction.roadmapItemId, "roadmap_1");

  const createdTask = store.getOrCreateTaskPromptFromRoadmapItem(projectId, "roadmap_1");
  assert.equal(createdTask.created, true);
  assert.doesNotThrow(
    () => store.getOrCreateTaskPromptFromRoadmapItem(projectId, "roadmap_1"),
    "Opening the first task again should not throw a duplicate roadmap task error"
  );
  const reopenedTask = store.getOrCreateTaskPromptFromRoadmapItem(projectId, "roadmap_1");
  assert.equal(reopenedTask.created, false);
  assert.equal(reopenedTask.taskPrompt.id, createdTask.taskPrompt.id);
  assert.equal(reopenedTask.chunk.id, createdTask.chunk.id);
  assert.equal(reopenedTask.taskPrompt.roadmapItemId, "roadmap_1");
  const stateAfterTaskOneCreate = store.getState();
  const actionAfterTaskOneCreate = getPlanPrimaryAction({
    project: stateAfterTaskOneCreate.projects.find((project) => project.id === projectId),
    pack: stateAfterTaskOneCreate.promptPacks.find((pack) => pack.id === activePackId),
    taskPrompts: stateAfterTaskOneCreate.taskPrompts.filter((prompt) => prompt.projectId === projectId)
  });
  assert.ok(actionAfterTaskOneCreate.handler === "openTaskFromPrimary" || actionAfterTaskOneCreate.handler === "startNextTask");
  if (actionAfterTaskOneCreate.handler === "openTaskFromPrimary") {
    assert.equal(actionAfterTaskOneCreate.roadmapItemId, "roadmap_1");
    assert.equal(actionAfterTaskOneCreate.taskPromptId, createdTask.taskPrompt.id);
  } else {
    assert.equal(actionAfterTaskOneCreate.roadmapItemId, "roadmap_2");
  }
  const taskPrompt = createdTask.taskPrompt;
  const stateAfterReopen = store.getState();
  const roadmapOnePrompts = stateAfterReopen.taskPrompts.filter((prompt) =>
    prompt.projectId === projectId && prompt.roadmapItemId === "roadmap_1"
  );
  assert.equal(roadmapOnePrompts.length, 1);
  const treeAfterReopen = buildProjectBrowserTree(stateAfterReopen);
  const projectNode = treeAfterReopen.find((node) => node.id === projectId);
  assert.ok(projectNode);
  assert.ok(projectNode.tasks.some((task) => task.taskPromptId === taskPrompt.id));
  assert.ok(projectNode.tasks.some((task) => /Task 1/.test(task.title)));
  assert.ok(projectNode.tasks.some((task) => task.status === "draft" || task.status === "ready"));
  const workflowAfterReopen = buildProjectWorkflowView(stateAfterReopen, {
    selectedProjectId: projectId,
    selectedTaskPromptId: taskPrompt.id
  });
  const workflowProject = workflowAfterReopen.projects.find((project) => project.id === projectId);
  assert.ok(workflowProject);
  assert.equal(workflowProject.tasks.some((task) => task.selected), true);
  const selectedTaskNode = workflowProject.tasks.find((task) => task.taskPromptId === taskPrompt.id);
  assert.ok(selectedTaskNode);
  assert.equal(selectedTaskNode.selected, true);
  const stateTaskPrompt = stateAfterReopen.taskPrompts.find((prompt) => prompt.id === taskPrompt.id);
  assert.ok(stateTaskPrompt);
  assert.match(stateTaskPrompt.content, /Project name:/);
  assert.ok(fs.existsSync(stateTaskPrompt.taskFilePath));
  assert.match(fs.readFileSync(stateTaskPrompt.taskFilePath, "utf8"), /Project name:/);
  const actionAfterReopen = getPlanPrimaryAction({
    project: stateAfterReopen.projects.find((project) => project.id === projectId),
    pack: stateAfterReopen.promptPacks.find((pack) => pack.id === activePackId),
    taskPrompts: stateAfterReopen.taskPrompts.filter((prompt) => prompt.projectId === projectId)
  });
  assert.ok(actionAfterReopen.handler === "openTaskFromPrimary" || actionAfterReopen.handler === "startNextTask");
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
  const stateAfterDone = store.getState();
  const packAfterDone = stateAfterDone.promptPacks.find((pack) => pack.id === activePackId);
  const doneChunk = packAfterDone.chunks.find((chunk) => chunk.id === taskPrompt.sourceChunkId);
  assert.equal(doneChunk.status, "done");
  const nextEligible = store.getNextEligibleRoadmapItem(projectId);
  assert.equal(nextEligible.nextItem.id, "roadmap_2");

  assert.ok(fs.existsSync(path.join(projectPath, "masterplan.md")));
  assert.ok(fs.existsSync(path.join(projectPath, "plan-roadmap.md")));
  const tasksDirFiles = fs.readdirSync(path.join(projectPath, "tasks")).filter((name) => /^task-001-.*\.md$/i.test(name));
  assert.ok(tasksDirFiles.length >= 1);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
