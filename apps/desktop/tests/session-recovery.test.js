const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createVaultStore } = require("../prompt-vault");
const {
  shouldRepairPlanningSession,
  getPlanningSessionControlView,
  getPlanningControlState
} = require("../renderer");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "next-step-session-recovery-"));

try {
  const dbPath = path.join(tmpRoot, "prompt-vault-db.json");
  const projectPath = path.join(tmpRoot, "Polluted");
  fs.mkdirSync(projectPath, { recursive: true });
  const store = createVaultStore({ dbPath });
  const project = store.saveProjectBrief({
    projectName: "Polluted",
    projectPath,
    idea: "Build a game.",
    masterPlan: ""
  }).project;

  store.writePlanningSession(project.id, {
    phase: "idea",
    busyState: true,
    activeContext: "master_generate",
    activeRequestId: "",
    lastError: "Ignored stale response (missing requestId)"
  });

  const polluted = store.getOrInitPlanningSession(project.id).session;
  assert.equal(shouldRepairPlanningSession(polluted), true);
  const repairedView = getPlanningSessionControlView(polluted);
  assert.equal(repairedView.busyState, false);
  assert.equal(repairedView.activeContext, "");
  assert.equal(repairedView.activeRequestId, "");
  assert.equal(repairedView.phase, "idea");
  assert.equal(repairedView.lastError, "Ignored stale response (missing requestId)");

  if (shouldRepairPlanningSession(polluted)) {
    store.writePlanningSession(project.id, {
      busyState: false,
      activeContext: "",
      activeRequestId: ""
    });
  }

  const recovered = store.getOrInitPlanningSession(project.id).session;
  assert.equal(recovered.busyState, false);
  assert.equal(recovered.activeContext, "");
  assert.equal(recovered.activeRequestId, "");
  assert.equal(recovered.phase, "idea");
  assert.equal(recovered.lastError, "Ignored stale response (missing requestId)");

  const controls = getPlanningControlState({
    session: recovered,
    project,
    currentText: ""
  });
  assert.equal(controls.generateMasterPlan.label, "Retry Generate Master Plan");
  assert.equal(controls.generateMasterPlan.disabled, false);
  assert.equal(controls.cancel.visible, false);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
