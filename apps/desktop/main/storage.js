const fs = require("node:fs/promises");
const path = require("node:path");
const projectBuilderProtocol = require("../../../packages/protocol");

const DB_FILE_NAME = "nextstep-db.json";
const TMP_FILE_NAME = "nextstep-db.tmp";
const IMPORT_BACKUP_FILE_NAME = "nextstep-db.backup.json";
const APP_VERSION = "0.1.0";
const IN_PROGRESS_AI_STATUSES = new Set([
  "opening",
  "waiting_login",
  "finding_input",
  "sending_prompt",
  "waiting_response",
  "extracting_response"
]);

let dbFilePath = null;
let tmpFilePath = null;
let backupFilePath = null;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultTask(projectId = "") {
  const ts = nowIso();
  return {
    id: createId("task"),
    project_id: projectId,
    parent_task_id: null,
    source_flaw_id: null,
    title: "",
    status: "clarification",
    raw_idea: "",
    user_inputs: {
      goal: "",
      input_output: "",
      out_of_scope: "",
      toggles: {
        new_ui: false,
        database: false,
        security: false,
        monolith_risk: false,
        overengineering_risk: false,
        tests: false
      }
    },
    active_round: 0,
    current_prompt: null,
    ai_worker_status: "idle",
    ai_worker_error: null,
    ai_worker_started_at: null,
    ai_worker_timeout_at: null,
    ai_rounds: [],
    processed_flaws: [],
    selected_codex_step_index: 0,
    completed_steps_indexes: [],
    final_codex_prompt: null,
    kanban_position: 0,
    logs: [],
    created_at: ts,
    updated_at: ts
  };
}

function createDefaultParticipants() {
  return [
    {
      id: "planner",
      name: "Planner AI",
      role: "planner",
      provider: "chatgpt",
      mode: "manual"
    },
    {
      id: "critic",
      name: "Critic AI",
      role: "critic",
      provider: "claude",
      mode: "manual"
    }
  ];
}

function createDefaultDebate() {
  return {
    ...projectBuilderProtocol.createProjectBuilderDebate({ title: "Untitled AI Project", raw_idea: "" }),
    goal: "",
    target_rounds: 4,
    active_round_index: 0,
    participants: createDefaultParticipants()
  };
}

function createDefaultState() {
  const ts = nowIso();
  return {
    schema_version: 1,
    app_version: APP_VERSION,
    projects: [],
    tasks: [],
    debates: [],
    active_project_id: null,
    active_task_id: null,
    active_debate_id: null,
    settings: {
      default_provider: "chatgpt",
      browser_mode: "auto",
      max_ai_run_minutes: 3,
      login_timeout_minutes: 2,
      auto_open_browser: true,
      keep_browser_open_after_run: false,
      browser_channel_preference: "chrome_first",
      save_failure_screenshots: true,
      local_metrics_enabled: true,
      selectors_editor_json: "{}",
      selectors_status_message: ""
    },
    metrics: {
      ai_runs_total: 0,
      ai_runs_success: 0,
      ai_runs_failed: 0,
      parse_failures: 0,
      timeout_failures: 0,
      login_required_count: 0,
      manual_fallback_count: 0,
      average_response_ms: 0
    },
    created_at: ts,
    updated_at: ts
  };
}

function ensureInitialized() {
  if (!dbFilePath || !tmpFilePath || !backupFilePath) {
    throw new Error("Storage not initialized");
  }
}

function initializeStorage(userDataPath) {
  dbFilePath = path.join(userDataPath, DB_FILE_NAME);
  tmpFilePath = path.join(userDataPath, TMP_FILE_NAME);
  backupFilePath = path.join(userDataPath, IMPORT_BACKUP_FILE_NAME);
}

async function safeWriteState(state) {
  ensureInitialized();
  const content = JSON.stringify(state, null, 2);
  await fs.writeFile(tmpFilePath, content, "utf8");
  await fs.rename(tmpFilePath, dbFilePath);
}

function mergeDefault(defaultValue, inputValue) {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(inputValue) ? inputValue : [...defaultValue];
  }

  if (defaultValue && typeof defaultValue === "object") {
    const source = inputValue && typeof inputValue === "object" ? inputValue : {};
    const merged = {};
    for (const key of Object.keys(defaultValue)) {
      merged[key] = mergeDefault(defaultValue[key], source[key]);
    }
    return merged;
  }

  return inputValue === undefined ? defaultValue : inputValue;
}

function sanitizeTask(task, index) {
  const fallback = createDefaultTask();
  const base = mergeDefault(fallback, task && typeof task === "object" ? task : {});

  if (!base.id) base.id = createId("task");
  if (!base.title) base.title = `Task ${index + 1}`;
  if (!base.project_id) base.project_id = "";

  if (IN_PROGRESS_AI_STATUSES.has(base.ai_worker_status)) {
    base.ai_worker_status = "failed";
    base.ai_worker_error = "App closed during AI run. Press Retry.";
    base.updated_at = nowIso();
  }

  return base;
}

function stageIdFromLegacyRound(source) {
  const stageId = String(source.stage_id || "").trim();
  if (stageId) return stageId;
  const type = String(source.type || "").toLowerCase();
  const participant = String(source.participant_id || source.provider || "").toLowerCase();
  if (type.includes("critic") || participant.includes("claude")) return "claude_critic";
  if (type.includes("improve") || type.includes("revised")) return "gpt_revised_plan";
  if (type.includes("consensus") || type.includes("synthesis")) return "gpt_final_synthesis";
  if (type.includes("prompt")) return "codex_prompt_forge";
  if (type.includes("clar")) return "gpt_clarifier";
  if (type.includes("plan") || participant.includes("planner")) return "gpt_planner";
  return "gpt_clarifier";
}

function stageMeta(stageId) {
  const step = projectBuilderProtocol.listWorkflowSteps().find((item) => item.id === stageId);
  return step || projectBuilderProtocol.listWorkflowSteps().find((item) => item.id === "gpt_clarifier");
}

function sanitizeDebateRound(round, index) {
  const ts = nowIso();
  const source = round && typeof round === "object" ? round : {};
  const stageId = stageIdFromLegacyRound(source);
  const step = stageMeta(stageId);
  const promptSent = String(source.prompt_sent || source.prompt || "");
  const responseReceived = String(source.response_received || source.response || "");
  const provider = String(source.provider || step.provider || source.participant_id || "");
  const role = String(source.role || step.role || source.type || "");
  const status = String(source.status || (responseReceived ? "received" : promptSent ? "sent" : "pending"));
  return {
    id: source.id || createId("debate_round"),
    round_number: Number(source.round_number || index + 1),
    stage_id: stageId,
    stage_label: source.stage_label || step.label || "",
    type: source.type || role || "plan",
    participant_id: source.participant_id || provider || "",
    provider,
    role,
    status,
    prompt_sent: promptSent,
    response_received: responseReceived,
    prompt: promptSent,
    response: responseReceived,
    parsed: source.parsed || null,
    parse_ok: Boolean(source.parse_ok),
    parse_error: source.parse_error || null,
    sent_at: source.sent_at || (promptSent ? source.created_at || ts : null),
    received_at: source.received_at || (responseReceived ? source.updated_at || source.created_at || ts : null),
    created_at: source.created_at || ts,
    updated_at: source.updated_at || ts
  };
}

function inferCurrentStageId(sourceDebate, rounds) {
  if (sourceDebate && sourceDebate.current_stage_id) return sourceDebate.current_stage_id;
  if (rounds.length) return rounds[rounds.length - 1].stage_id || "gpt_clarifier";
  return "gpt_clarifier";
}

function sanitizeDebate(debate, index) {
  const sourceDebate = debate && typeof debate === "object" ? debate : {};
  const fallback = createDefaultDebate();
  const base = mergeDefault(fallback, sourceDebate);

  if (!base.id) base.id = createId("debate");
  if (!base.title) base.title = `Debate ${index + 1}`;
  base.protocol = base.protocol || "ai_project_builder";
  base.protocol_version = Number(base.protocol_version || 1);
  base.raw_idea = String(base.raw_idea || "");
  base.goal = String(base.goal || "");
  base.human_gated = true;
  base.auto_loop = false;
  base.status = base.status || "ready_for_user";
  base.target_rounds = Number(base.target_rounds || 4);
  base.participants = Array.isArray(base.participants) && base.participants.length ? base.participants : createDefaultParticipants();
  base.rounds = (Array.isArray(base.rounds) ? base.rounds : []).map((round, roundIndex) => sanitizeDebateRound(round, roundIndex));
  base.current_stage_id = inferCurrentStageId(sourceDebate, base.rounds);
  base.current_stage_index = Math.max(0, projectBuilderProtocol.listWorkflowSteps().filter((step) => step.actor === "ai").findIndex((step) => step.id === base.current_stage_id));
  base.providers = projectBuilderProtocol.listProviders();
  base.steps = projectBuilderProtocol.listWorkflowSteps();
  base.critique_items = Array.isArray(base.critique_items) ? base.critique_items : [];
  base.active_round_index = Math.min(Math.max(Number(base.active_round_index || 0), 0), Math.max(base.rounds.length - 1, 0));
  base.final_megaprompts = Array.isArray(base.final_megaprompts) ? base.final_megaprompts : [];
  base.logs = Array.isArray(base.logs) ? base.logs : [];

  return base;
}

function sanitizeStateOnStartup(state) {
  const fallback = createDefaultState();
  const merged = mergeDefault(fallback, state && typeof state === "object" ? state : {});

  merged.schema_version = 1;
  merged.app_version = APP_VERSION;
  merged.projects = Array.isArray(merged.projects) ? merged.projects : [];
  merged.tasks = (Array.isArray(merged.tasks) ? merged.tasks : []).map((task, index) => sanitizeTask(task, index));
  merged.debates = (Array.isArray(merged.debates) ? merged.debates : []).map((debate, index) => sanitizeDebate(debate, index));

  const projectIds = new Set(merged.projects.map((project) => project && project.id).filter(Boolean));
  merged.tasks = merged.tasks.filter((task) => !task.project_id || projectIds.has(task.project_id));

  if (!merged.projects.some((project) => project && project.id === merged.active_project_id)) {
    merged.active_project_id = merged.projects.length ? merged.projects[0].id : null;
  }

  if (!merged.tasks.some((task) => task.id === merged.active_task_id)) {
    merged.active_task_id = merged.tasks.length ? merged.tasks[0].id : null;
  }

  if (!merged.debates.some((debate) => debate.id === merged.active_debate_id)) {
    merged.active_debate_id = merged.debates.length ? merged.debates[0].id : null;
  }

  if (!merged.created_at) merged.created_at = nowIso();
  merged.updated_at = nowIso();

  return merged;
}

function migrateState(state) {
  if (!state || typeof state !== "object") return createDefaultState();
  if (!state.schema_version || state.schema_version < 1) {
    return sanitizeStateOnStartup({ ...createDefaultState(), ...state, schema_version: 1 });
  }
  return sanitizeStateOnStartup(state);
}

async function loadState() {
  ensureInitialized();
  try {
    const content = await fs.readFile(dbFilePath, "utf8");
    const parsed = JSON.parse(content);
    const migrated = migrateState(parsed);
    await safeWriteState(migrated);
    return migrated;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const initial = createDefaultState();
      await safeWriteState(initial);
      return initial;
    }

    const recovered = createDefaultState();
    recovered.updated_at = nowIso();
    await safeWriteState(recovered);
    return recovered;
  }
}

async function saveState(state) {
  ensureInitialized();
  const sanitized = migrateState(state);
  sanitized.updated_at = nowIso();
  await safeWriteState(sanitized);
  return sanitized;
}

async function exportState() {
  return loadState();
}

async function importState(importedState) {
  ensureInitialized();

  try {
    await fs.copyFile(dbFilePath, backupFilePath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }

  const sanitized = migrateState(importedState);
  sanitized.updated_at = nowIso();
  await safeWriteState(sanitized);
  return sanitized;
}

module.exports = {
  initializeStorage,
  createDefaultState,
  loadState,
  saveState,
  exportState,
  importState,
  migrateState,
  sanitizeStateOnStartup
};
