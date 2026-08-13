// Must match backend/src/lib/runStore.js's status values.
export const RUN_STATUS_META = {
  QUEUED: { label: "Queued", color: "#94a3b8" },
  RUNNING: { label: "Running", color: "#3b82f6" },
  WAITING_OTP: { label: "Waiting for OTP", color: "#f59e0b" },
  DOWNLOADING: { label: "Downloading", color: "#3b82f6" },
  PARSING: { label: "Parsing", color: "#3b82f6" },
  SUCCEEDED: { label: "Succeeded", color: "#059669" },
  FAILED: { label: "Failed", color: "#dc2626" },
};

export function describeRunStatus(status) {
  return RUN_STATUS_META[status] || { label: status, color: "#94a3b8" };
}
