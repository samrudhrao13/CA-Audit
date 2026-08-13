// Must match backend/src/lib/workflowProgress.js's summarizeClientStatus() output.
export const CLIENT_STATUS_META = {
  up_to_date: { label: "Filed", color: "#059669" },
  in_progress: { label: "In progress", color: "#d97706" },
  action_needed: { label: "Action needed", color: "#dc2626" },
  not_set_up: { label: "Not set up", color: "#94a3b8" },
};
