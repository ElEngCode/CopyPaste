const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

globalThis.NextStepAiProjectBuilderProtocol = require("../../../packages/protocol");
const {
  buildProjectWorkflowView,
  buildProjectBrowserTree,
  getPlanPrimaryAction,
  renderProjectPlanHtml
} = require("../renderer");
const { createVaultStore } = require("../prompt-vault");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "next-step-ui-workflow-regression-"));

try {
  const viewModelState = {
    projects: [{
      id: "project_vm_1",
      name: "View Model Project",
      path: "D:\\Work\\ViewModelProject",
      idea: "Test real workflow transitions.",
      masterPlan: "# Master Plan\n\nBuild a real workflow view model.",
      activeMasterPlanVersionId: "master_plan_vm_1",
      activePromptPackId: "pack_vm_1"
    }],
    promptPacks: [{
      id: "pack_vm_1",
      projectId: "project_vm_1",
      title: "Pack VM",
      roadmap: {
        items: [{ id: "roadmap_vm_1", order: 1, title: "Render workflow state", dependsOn: [] }]
      },
      chunks: [{
        id: "chunk_vm_1",
        order: 1,
        title: "Render workflow state",
        roadmapItemId: "roadmap_vm_1",
        status: "approved",
        prompt: "Use real workflow state."
      }]
    }],
    taskPrompts: [{
      id: "task_prompt_vm_1",
      projectId: "project_vm_1",
      roadmapItemId: "roadmap_vm_1",
      sourceChunkId: "chunk_vm_1",
      order: 1,
      title: "Render workflow state",
      status: "approved",
      content: "Task prompt body for workflow rendering."
    }]
  };

  const workflowModel = buildProjectWorkflowView(viewModelState, {
    selectedProjectId: "project_vm_1",
    selectedTaskPromptId: "task_prompt_vm_1"
  });
  assert.equal(workflowModel.projects.length, 1);
  assert.equal(workflowModel.projects[0].selected, true);
  assert.equal(workflowModel.projects[0].masterPlan.status, "Applied");
  assert.equal(workflowModel.projects[0].roadmap.status, "Applied");
  assert.equal(workflowModel.projects[0].tasks.length, 1);
  assert.equal(workflowModel.projects[0].tasks[0].status, "approved");
  assert.equal(workflowModel.projects[0].tasks[0].selected, true);
  assert.doesNotMatch(renderProjectPlanHtml(viewModelState.projects[0].masterPlan), /No plan yet/i);

  const dbPath = path.join(tmpRoot, "prompt-vault-db.json");
  const projectPath = path.join(tmpRoot, "FullFlowProject");
  fs.mkdirSync(projectPath, { recursive: true });
  const store = createVaultStore({ dbPath });

  const saved = store.saveProjectBrief({
    projectName: "Full Flow Project",
    projectPath,
    idea: "Exercise roadmap and task workflow end-to-end.",
    masterPlan: "# Master Plan\n\nInitial draft."
  });
  const projectId = saved.project.id;
  const masterVersion = store.addMasterPlanVersion(projectId, {
    source: "fixture",
    promptSnapshot: "fixture",
    responseText: "# Master Plan\n\nApplied workflow plan."
  }).version;
  store.applyMasterPlanVersion(projectId, masterVersion.id);

  const activePackId = store.getState().projects.find((project) => project.id === projectId).activePromptPackId;
  const roadmapVersion = store.addRoadmapVersion(activePackId, {
    source: "fixture_json",
    responseText: JSON.stringify({
      items: [
        {
          id: "roadmap_1",
          order: 1,
          title: "Task 001",
          goal: "Create the first task prompt",
          whyThisExists: "Start execution",
          targetFiles: ["apps/desktop/prompt-vault.js"],
          researchNeeded: [],
          acceptanceCriteria: ["Task prompt exists"],
          verificationCommands: ["npm.cmd run desktop:test"],
          dependsOn: [],
          parallelGroup: ""
        },
        {
          id: "roadmap_2",
          order: 2,
          title: "Task 002",
          goal: "Create the second task prompt",
          whyThisExists: "Continue execution",
          targetFiles: ["apps/desktop/renderer.js"],
          researchNeeded: [],
          acceptanceCriteria: ["Task prompt exists"],
          verificationCommands: ["npm.cmd run desktop:test"],
          dependsOn: ["roadmap_1"],
          parallelGroup: ""
        }
      ]
    })
  }).version;
  store.applyRoadmapVersion(activePackId, roadmapVersion.id);

  const createdTask = store.getOrCreateTaskPromptFromRoadmapItem(projectId, "roadmap_1");
  assert.equal(createdTask.created, true);
  assert.ok(createdTask.taskPrompt.content.length > 0);
  assert.match(createdTask.taskPrompt.content, /Task 001|Project name:/);

  assert.doesNotThrow(() => store.getOrCreateTaskPromptFromRoadmapItem(projectId, "roadmap_1"));
  const reopenedTask = store.getOrCreateTaskPromptFromRoadmapItem(projectId, "roadmap_1");
  assert.equal(reopenedTask.created, false);
  assert.equal(reopenedTask.taskPrompt.id, createdTask.taskPrompt.id);
  assert.equal(reopenedTask.taskPrompt.roadmapItemId, createdTask.taskPrompt.roadmapItemId);

  const stateAfterReopen = store.getState();
  const projectAfterReopen = stateAfterReopen.projects.find((project) => project.id === projectId);
  const packAfterReopen = stateAfterReopen.promptPacks.find((pack) => pack.id === projectAfterReopen.activePromptPackId);
  const taskPromptsAfterReopen = stateAfterReopen.taskPrompts.filter((task) => task.projectId === projectId);
  const primaryAction = getPlanPrimaryAction({
    project: projectAfterReopen,
    pack: packAfterReopen,
    taskPrompts: taskPromptsAfterReopen
  });
  assert.ok(primaryAction.handler === "openTaskFromPrimary" || primaryAction.handler === "startNextTask");

  const browserTree = buildProjectBrowserTree(stateAfterReopen);
  const browserProject = browserTree.find((node) => node.id === projectId);
  assert.ok(browserProject);
  assert.equal(browserProject.name, "Full Flow Project");
  assert.equal(browserProject.masterPlanState, "Applied");
  assert.equal(browserProject.roadmapState, "Applied");
  assert.ok(browserProject.tasks.length >= 1);
  assert.ok(browserProject.tasks.some((task) => task.title === "Task 001"));
  assert.ok(browserProject.tasks.some((task) => task.taskPromptId === createdTask.taskPrompt.id));

  const workflowAfterReopen = buildProjectWorkflowView(stateAfterReopen, {
    selectedProjectId: projectId,
    selectedTaskPromptId: createdTask.taskPrompt.id
  });
  const workflowProject = workflowAfterReopen.projects.find((project) => project.id === projectId);
  assert.ok(workflowProject);
  const selectedTask = workflowProject.tasks.find((task) => task.taskPromptId === createdTask.taskPrompt.id);
  assert.ok(selectedTask);
  assert.equal(selectedTask.selected, true);

  const rendererSource = fs.readFileSync(path.join(__dirname, "..", "renderer.js"), "utf8");
  const selectRoadmapBlockStart = rendererSource.indexOf('if (action === "select-roadmap-item") {');
  assert.ok(selectRoadmapBlockStart >= 0);
  const selectRoadmapBlock = rendererSource.slice(selectRoadmapBlockStart, rendererSource.indexOf('if (action === "open-roadmap-item-task") {'));
  assert.match(selectRoadmapBlock, /selectTreeNode\(/);
  assert.match(selectRoadmapBlock, /"task"/);
  assert.match(selectRoadmapBlock, /"roadmap_item"/);

  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.doesNotMatch(indexSource, />\s*Stage:\s*/);
  assert.doesNotMatch(indexSource, />\s*Next:\s*/);

  const sourceFiles = [
    path.join(__dirname, "..", "renderer.js"),
    path.join(__dirname, "..", "index.html"),
    path.join(__dirname, "..", "main.js"),
    path.join(__dirname, "..", "prompt-vault.js")
  ];
  for (const filePath of sourceFiles) {
    const text = fs.readFileSync(filePath, "utf8");
    assert.equal(
      text.includes("F:\\Projects\\CopyPaste"),
      false,
      `${filePath} contains a hardcoded local path`
    );
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
