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
  buildProjectBrowserTree,
  getVisibleProjectBrowserNodes,
  getTaskImprovePayload,
  getMasterPlanImprovePayload,
  getTaskRoadmapPayload,
  getNextEligibleRoadmapItem,
  getPlanPrimaryAction,
  getPrimaryActionState,
  getNextRecommendedAction,
  getMasterPlanActionLabel,
  renderProjectPlanHtml,
  getRoundPreview,
  getProjectFolderName,
  getProjectDraftPath,
  getDraftCommitFallback
} = require("../renderer");

assert.deepEqual(getWorkflowStatusView({
  message: "Extension loaded, waiting for WebSocket handshake.",
  tone: "success",
  extensionState: "loaded",
  nextTarget: "ChatGPT"
}), {
  connected: false,
  connectionText: "Extension loaded",
  readinessText: "Waiting",
  detailText: "Extension loaded, waiting for WebSocket handshake.",
  nextTarget: "ChatGPT"
});

assert.deepEqual(getWorkflowStatusView({
  message: "Extension connected. Ready for next AI step.",
  tone: "success",
  extensionState: "connected",
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
  tone: "error",
  extensionState: "disconnected"
}), {
  connected: false,
  connectionText: "Waiting for extension",
  readinessText: "Waiting",
  detailText: "Install the extension once, then click Connect extension",
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
assert.equal(getProjectFolderName("My Cool App"), "My Cool App");
assert.equal(getProjectFolderName("Proiectul pulii"), "Proiectul pulii");
assert.equal(getProjectFolderName("Bad:Project/Name"), "Bad Project Name");
assert.equal(getProjectDraftPath("My Cool App"), "Projects\\My Cool App");
assert.equal(getProjectDraftPath("Proiectul pulii"), "Projects\\Proiectul pulii");
assert.equal(getProjectDraftPath("Proiectul pulii", "D:\\Work\\Tasks"), "D:\\Work\\Tasks\\Proiectul pulii");
assert.equal(getProjectDraftPath(""), "Projects\\Project");
assert.equal(getDraftCommitFallback("My Cool App"), "Initialize My Cool App");
assert.equal(getDraftCommitFallback(""), "");

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

const tree = buildProjectBrowserTree({
  projects: [{ id: "project_1", name: "CopyPaste", path: "F:\\Projects\\CopyPaste" }],
  promptPacks: [{
    id: "pack_1",
    projectId: "project_1",
    title: "Execution Pack",
    chunks: [
      { id: "chunk_2", order: 2, title: "Task 2", status: "ready" },
      { id: "chunk_1", order: 1, title: "Task 1", status: "done" }
    ]
  }]
});
assert.equal(tree.length, 1);
assert.equal(tree[0].packs.length, 1);
assert.equal(tree[0].packs[0].chunks[0].id, "chunk_1");

const multiProjectTree = buildProjectBrowserTree({
  projects: [
    { id: "project_1", name: "Alpha", path: "F:\\Projects\\Alpha" },
    { id: "project_2", name: "Beta", path: "F:\\Projects\\Beta" }
  ],
  promptPacks: []
});
assert.deepEqual(
  getVisibleProjectBrowserNodes(multiProjectTree, { selectedProjectId: "project_2", showAllProjects: false }).map((project) => project.name),
  ["Beta"]
);
assert.deepEqual(
  getVisibleProjectBrowserNodes(multiProjectTree, { selectedProjectId: "project_2", showAllProjects: true }).map((project) => project.name),
  ["Alpha", "Beta"]
);
assert.deepEqual(
  getVisibleProjectBrowserNodes(multiProjectTree, {
    selectedProjectId: "",
    showAllProjects: false,
    draftProject: { id: "__draft__", name: "New Project", packs: [] }
  }).map((project) => project.name),
  ["New Project"]
);

const improvePayload = getTaskImprovePayload(
  { title: "Sidebar task", prompt: "Current prompt", runHistory: [] },
  [{ note: "Run one" }, { note: "Run two" }],
  "Improve this task"
);
assert.equal(improvePayload.currentStageId, "task_improve");
assert.equal(improvePayload.targetProvider, "chatgpt");
assert.equal(improvePayload.taskName, "Sidebar task");
assert.equal(improvePayload.taskContent, "Current prompt");
assert.deepEqual(improvePayload.runHistory, ["Run one", "Run two"]);

const masterPlanPayload = getMasterPlanImprovePayload({
  projectName: "Spinning Ball",
  projectIdea: "a perfect spinning ball",
  masterPlan: "# Master Plan\n\n"
});
assert.equal(masterPlanPayload.currentStageId, "master_plan");
assert.equal(masterPlanPayload.targetProvider, "chatgpt");
assert.match(masterPlanPayload.text, /a perfect spinning ball/);
assert.match(masterPlanPayload.text, /Return a complete master plan/);

const roadmapPayload = getTaskRoadmapPayload({
  projectName: "Spinning Ball",
  projectPath: "F:\\Projects\\CopyPaste\\Projects\\Spinning Ball",
  projectIdea: "a perfect spinning ball",
  masterPlan: "# Master Plan\n\nUse physics tests."
});
assert.equal(roadmapPayload.currentStageId, "task_roadmap");
assert.equal(roadmapPayload.targetProvider, "chatgpt");
assert.match(roadmapPayload.text, /Return JSON only/);
assert.match(roadmapPayload.text, /"items"/);
assert.match(roadmapPayload.text, /Use physics tests/);

const nextRoadmapItem = getNextEligibleRoadmapItem({
  roadmap: {
    items: [
      { id: "roadmap_1", order: 1, title: "Done first", dependsOn: [] },
      { id: "roadmap_2", order: 2, title: "Next", dependsOn: ["roadmap_1"] },
      { id: "roadmap_3", order: 3, title: "Blocked", dependsOn: ["roadmap_missing"] }
    ]
  },
  chunks: [
    { roadmapItemId: "roadmap_1", status: "done" }
  ]
});
assert.equal(nextRoadmapItem.id, "roadmap_2");
assert.deepEqual(getPlanPrimaryAction({
  project: { id: "project_1", idea: "Build a planner.", masterPlan: "# Master Plan\n\n" },
  pack: null
}), {
  id: "master_plan",
  label: "Generate Master Plan",
  enabled: true,
  handler: "sendGenerateMasterPlan",
  roadmapItemId: ""
});
assert.deepEqual(getPrimaryActionState({
  project: { id: "project_1", idea: "", masterPlan: "" },
  pack: null
}), {
  id: "project_idea",
  label: "Save Project Idea",
  enabled: true,
  handler: "saveProjectBrief",
  roadmapItemId: ""
});
assert.notEqual(getPrimaryActionState({
  project: { id: "project_1", idea: "Idea", masterPlan: "# Master Plan\n\n", activeMasterPlanVersionId: "mp_1" },
  pack: { roadmap: { items: [] }, chunks: [] }
}).handler, "generatePromptPack");
assert.deepEqual(getPlanPrimaryAction({
  project: { id: "project_1", idea: "Build a planner.", masterPlan: "# Master Plan\n\nReal plan" },
  pack: { roadmap: { items: [] }, chunks: [] }
}), {
  id: "save_master_plan",
  label: "Save Master Plan & Create Task Roadmap",
  enabled: true,
  handler: "saveMasterPlanAndCreateRoadmap",
  roadmapItemId: ""
});
assert.deepEqual(getPlanPrimaryAction({
  project: {
    id: "project_1",
    idea: "Build a planner.",
    masterPlan: "# Master Plan\n\nReal plan",
    activeMasterPlanVersionId: "mp_1"
  },
  pack: { roadmap: { items: [] }, chunks: [] }
}), {
  id: "roadmap",
  label: "Create Task Roadmap",
  enabled: true,
  handler: "createTaskRoadmap",
  roadmapItemId: ""
});
assert.deepEqual(getPlanPrimaryAction({
  project: {
    id: "project_1",
    idea: "Build a planner.",
    masterPlan: "# Master Plan\n\nReal plan",
    activeMasterPlanVersionId: "mp_1"
  },
  pack: {
    roadmap: { items: [] },
    roadmapVersions: [{ id: "roadmap_version_1", responseText: "{\"items\":[]}", createdAt: "2024-01-01T00:00:00.000Z", appliedAt: "" }],
    chunks: []
  }
}), {
  id: "save_roadmap",
  label: "Save Roadmap",
  enabled: true,
  handler: "saveRoadmap",
  roadmapItemId: ""
});
assert.deepEqual(getPlanPrimaryAction({
  project: {
    id: "project_1",
    idea: "Build a planner.",
    masterPlan: "# Master Plan\n\nReal plan",
    activeMasterPlanVersionId: "mp_1"
  },
  pack: {
    roadmap: { items: [{ id: "roadmap_1", order: 1, title: "Audit workspace", dependsOn: [] }] },
    chunks: []
  }
}), {
  id: "start_task",
  label: "Create Task 001: Audit workspace",
  enabled: true,
  handler: "startNextTask",
  roadmapItemId: "roadmap_1"
});
assert.deepEqual(getPlanPrimaryAction({
  project: {
    id: "project_1",
    idea: "Build a planner.",
    masterPlan: "# Master Plan\n\nReal plan",
    activeMasterPlanVersionId: "mp_1"
  },
  pack: {
    roadmap: { items: [{ id: "roadmap_1", order: 1, title: "Audit workspace", dependsOn: [] }] },
    chunks: [{ roadmapItemId: "roadmap_1", status: "in_progress" }]
  }
}), {
  id: "blocked",
  label: "No Roadmap Tasks Ready",
  enabled: false,
  handler: "",
  roadmapItemId: ""
});
assert.equal(getMasterPlanActionLabel(""), "Create Master Plan");
assert.equal(getMasterPlanActionLabel("# Master Plan\n\n"), "Create Master Plan");
assert.equal(getMasterPlanActionLabel("# Master Plan\n\nReal plan"), "Improve Master Plan");

const rootHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const rendererJs = fs.readFileSync(path.join(__dirname, "..", "renderer.js"), "utf8");
assert.match(rootHtml, /AI Project Builder/);
assert.match(rootHtml, /Project Browser/);
assert.match(rootHtml, /Workspace/);
assert.match(rootHtml, /Inspector/);
assert.match(rootHtml, /Master Plan/);
assert.match(rootHtml, /Task Roadmap/);
assert.match(rootHtml, /Serial/);
assert.match(rootHtml, /Parallel/);
assert.match(rootHtml, /Tasks/);
assert.match(rootHtml, /data-workspace-tab="tasks"/);
assert.match(rootHtml, /data-workspace-tab="plan"/);
assert.doesNotMatch(rootHtml, /data-workspace-tab="debate"/);
assert.match(rootHtml, /data-inspector-tab="ai"/);
assert.match(rootHtml, /data-inspector-tab="versions"/);
assert.match(rootHtml, /data-inspector-tab="runs"/);
assert.match(rootHtml, /data-inspector-tab="details"/);
assert.match(rootHtml, /Project idea/);
assert.match(rootHtml, /Master Plan/);
assert.doesNotMatch(rootHtml, /AI Debate/);
assert.match(rootHtml, /Project Plan/);
assert.doesNotMatch(rootHtml, /Codex Prompts/);
assert.doesNotMatch(rootHtml, /Current stage/);
assert.doesNotMatch(rootHtml, /Current provider/);
assert.doesNotMatch(rootHtml, /Round history/);
assert.doesNotMatch(rootHtml, /Generate Codex Prompts/);
assert.doesNotMatch(rootHtml, /Latest Prompt Pack/);
assert.doesNotMatch(rootHtml, /Older Packs/);
assert.match(rootHtml, /id="saveProjectBriefBtn"[^>]*>Save Draft<\/button>/);
assert.match(rootHtml, /id="generateMasterPlanBtn"[^>]*>Generate Master Plan<\/button>/);
assert.match(rootHtml, /id="improveMasterPlanClaudeBtn"[^>]*>Improve with Claude<\/button>/);
assert.match(rootHtml, /id="reviseMasterPlanGptBtn"[^>]*>Revise with GPT<\/button>/);
assert.match(rootHtml, /id="saveMasterPlanCreateRoadmapBtn"[^>]*>Save Master Plan &amp; Create Task Roadmap<\/button>/);
assert.match(rootHtml, /id="retryCreateRoadmapBtn"[^>]*>Retry Create Roadmap<\/button>/);
assert.match(rootHtml, /id="improveRoadmapClaudeBtn"[^>]*>Improve Roadmap with Claude<\/button>/);
assert.match(rootHtml, /id="saveRoadmapBtn"[^>]*>Save Roadmap<\/button>/);
assert.match(rootHtml, /id="createNextTaskBtn"[^>]*>Create Next Task<\/button>/);
assert.match(rootHtml, /id="createAllTasksBtn"[^>]*>Create All Tasks<\/button>/);
assert.match(rootHtml, /id="cancelPlanningBtn"[^>]*>Cancel<\/button>/);
assert.doesNotMatch(rootHtml, />Apply Master Plan<\/button>/);
assert.doesNotMatch(rootHtml, />Apply Roadmap<\/button>/);
assert.match(rootHtml, /Planning Status/);
assert.match(rendererJs, /async function sendGenerateMasterPlan/);
assert.match(rendererJs, /async function sendClaudeMasterPlanImprove/);
assert.match(rendererJs, /async function sendGptMasterPlanRevision/);
assert.match(rendererJs, /async function saveMasterPlanAndCreateRoadmap/);
assert.match(rendererJs, /async function createAllTasks/);
assert.match(rendererJs, /requestId = crypto\.randomUUID/);
assert.doesNotMatch(rendererJs, /await triggerWorkflowStep\(\);/);
assert.match(rootHtml, /Default projects folder/);
assert.match(rootHtml, /See all projects/);
assert.match(rootHtml, /id="projectContextMenu"/);
assert.match(rootHtml, /data-context-action="copy-project-path"/);
assert.match(rootHtml, /data-context-action="delete-project"/);
assert.match(rootHtml, /data-context-action="copy-task"/);
assert.match(rootHtml, /data-context-action="delete-task"/);
assert.match(rendererJs, /projectContextMenu\.dataset\.open !== "true"/);
assert.match(rendererJs, /async function createTaskRoadmap/);
assert.match(rendererJs, /async function applyRoadmapDraft/);
assert.match(rendererJs, /async function startNextTask/);
assert.doesNotMatch(rendererJs, /desktopApi\.approvePrompt\(/);
assert.doesNotMatch(rendererJs, /desktopApi\.copyPromptToCodex\(/);
assert.doesNotMatch(rendererJs, /desktopApi\.markPromptDone\(/);
assert.doesNotMatch(rendererJs, /desktopApi\.buildChunkImprovePrompt\(/);
assert.doesNotMatch(rendererJs, /desktopApi\.addChunkVersion\(/);
assert.match(rendererJs, /desktopApi\.approveTaskPrompt\(/);
assert.match(rendererJs, /desktopApi\.copyCodexHandoff\(/);
assert.match(rendererJs, /desktopApi\.markTaskPromptDone\(/);
assert.match(rendererJs, /desktopApi\.prepareTaskImprovePrompt\(/);
assert.match(rendererJs, /desktopApi\.saveTaskImproveResponse\(/);
assert.match(rootHtml, /Task name/);
assert.match(rootHtml, /Save Task/);
assert.match(rootHtml, /Improve Task/);
assert.match(rootHtml, /Copy to Codex/);
assert.match(rootHtml, /Mark Done/);
assert.match(rootHtml, /Refresh status/);
assert.match(rootHtml, /First-time setup/);
assert.match(rootHtml, /Copy extension path/);
assert.match(rootHtml, /Copy chrome:\/\/extensions/);
assert.match(rootHtml, /Open extension folder/);
assert.match(rootHtml, />Connect</);
assert.match(rootHtml, />Setup</);
assert.match(rootHtml, /Refresh status/);
assert.match(rootHtml, /First time setup: click First-time setup, open chrome:\/\/extensions, set Developer mode to ON, then load unpacked from this repo's apps\/extension folder\./);
assert.doesNotMatch(rootHtml, /Extension Setup Checklist/);
assert.doesNotMatch(rootHtml, /Launch Chrome with extension/);
assert.doesNotMatch(rootHtml, /Chrome launched with CopyPaste extension flags/);
assert.match(rootHtml, /Advanced settings/);
assert.match(rootHtml, /Defaults work for most projects/);
assert.match(rootHtml, /Return plain text only/);
assert.doesNotMatch(rootHtml, /Do not use artifacts, widgets, cards, tables, diagrams, interactive views, visualizations, HTML, CSS, or custom UI formatting/);
assert.match(rootHtml, /workspace-layout/);
assert.match(rootHtml, /inspector-section/);
assert.match(rootHtml, /overflow-wrap: anywhere/);
assert.match(rootHtml, /scrollbar-gutter: stable/);
assert.match(rootHtml, /\.plan-document/);
assert.match(rootHtml, /\.plan-eyebrow/);
assert.match(rootHtml, /\.plan-numbered-heading/);
assert.match(rootHtml, /\.plan-list/);
assert.match(rootHtml, /\.tree-project, \.tree-pack, \.tree-item\s*\{[\s\S]*justify-content: flex-start;/);
assert.match(rootHtml, /\.tree-item > span:first-child/);
assert.match(rootHtml, /\.tree-item \.status-pill/);
assert.doesNotMatch(rendererJs, /window\.prompt\(/);
assert.doesNotMatch(rootHtml, /Gemini <span class="provider-badge">Future/);
assert.doesNotMatch(rootHtml, /Grok <span class="provider-badge">Future/);
assert.doesNotMatch(rootHtml, /Task Drawer/);
assert.doesNotMatch(rootHtml, /Next Step Controller/);
assert.doesNotMatch(rootHtml, /Generate Codex Pack/);
assert.doesNotMatch(rootHtml, /Copy Launcher/);
assert.doesNotMatch(rootHtml, />[^<]*chunks?[^<]*</i);
assert.doesNotMatch(rootHtml, /Prompt pack title/);
assert.doesNotMatch(rootHtml, /<button[^>]*data-workspace-tab="prompts"/);
assert.doesNotMatch(rootHtml, /Prompt name/);
assert.doesNotMatch(rootHtml, /Save Prompt/);
assert.doesNotMatch(rootHtml, /Improve Prompt/);
assert.doesNotMatch(rootHtml, /editor-toolbar/);
assert.doesNotMatch(rootHtml, /title="Help"/);
assert.doesNotMatch(rootHtml, /title="Settings"/);
