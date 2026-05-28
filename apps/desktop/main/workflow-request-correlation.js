function getPendingMap(registry, socket) {
  if (!registry || !socket) return null;
  let pending = registry.get(socket);
  if (!pending) {
    pending = new Map();
    registry.set(socket, pending);
  }
  return pending;
}

function rememberPendingWorkflowRequest(registry, socket, payload = {}) {
  const pending = getPendingMap(registry, socket);
  const requestId = String(payload.requestId || "");
  if (!pending || !requestId) return null;
  const request = {
    requestId,
    projectId: String(payload.projectId || ""),
    activeContext: String(payload.activeContext || ""),
    targetProvider: String(payload.targetProvider || "")
  };
  pending.set(requestId, request);
  return request;
}

function listPendingWorkflowRequests(registry, socket) {
  const pending = registry && socket ? registry.get(socket) : null;
  return pending ? Array.from(pending.values()) : [];
}

function clearPendingWorkflowRequest(registry, socket, requestId = "") {
  const pending = registry && socket ? registry.get(socket) : null;
  if (!pending) return;
  const safeRequestId = String(requestId || "");
  if (safeRequestId) {
    pending.delete(safeRequestId);
  } else {
    pending.clear();
  }
  if (pending.size === 0) {
    registry.delete(socket);
  }
}

function backfillWorkflowResponseMetadata(registry, socket, response = {}, log = () => {}) {
  const output = response && typeof response === "object" ? { ...response } : {};
  const pending = registry && socket ? registry.get(socket) : null;
  if (!pending || pending.size === 0) {
    return { response: output, backfilled: false, conflict: false, pending: [] };
  }

  if (output.requestId) {
    const request = pending.get(String(output.requestId));
    if (request) {
      output.projectId = output.projectId || request.projectId;
      output.activeContext = output.activeContext || request.activeContext;
      output.provider = output.provider || output.target || request.targetProvider;
    }
    return { response: output, backfilled: false, conflict: false, pending: listPendingWorkflowRequests(registry, socket) };
  }

  const pendingRequests = listPendingWorkflowRequests(registry, socket);
  if (pendingRequests.length === 1) {
    const request = pendingRequests[0];
    output.requestId = request.requestId;
    output.projectId = output.projectId || request.projectId;
    output.activeContext = output.activeContext || request.activeContext;
    output.provider = output.provider || output.target || request.targetProvider;
    log("Backfilled missing request metadata from pending workflow request.", {
      requestId: output.requestId,
      projectId: output.projectId,
      activeContext: output.activeContext
    });
    return { response: output, backfilled: true, conflict: false, pending: pendingRequests };
  }

  return { response: output, backfilled: false, conflict: true, pending: pendingRequests };
}

module.exports = {
  rememberPendingWorkflowRequest,
  listPendingWorkflowRequests,
  clearPendingWorkflowRequest,
  backfillWorkflowResponseMetadata
};
