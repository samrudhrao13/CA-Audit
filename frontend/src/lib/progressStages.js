// Must match backend/src/lib/workflowProgress.js's PROGRESS_STAGES.
export const PROGRESS_STAGES = ["documents_requested", "documents_received", "ready_for_filing", "filed"];

export const STAGE_LABELS = {
  not_started: "Not started",
  documents_requested: "Documents requested",
  documents_received: "Documents received",
  ready_for_filing: "Ready for filing",
  filed: "Filed",
};

// A gray-to-green progression so the stage a client is in reads as
// "how far along," not just a label — used anywhere stages get a color.
export const STAGE_COLORS = {
  not_started: "#94a3b8",
  documents_requested: "#f59e0b",
  documents_received: "#3b82f6",
  ready_for_filing: "#8b5cf6",
  filed: "#059669",
};

export function nextStage(current) {
  const index = PROGRESS_STAGES.indexOf(current);
  return PROGRESS_STAGES[Math.min(index + 1, PROGRESS_STAGES.length - 1)];
}
