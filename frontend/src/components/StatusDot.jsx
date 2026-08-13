import { CLIENT_STATUS_META } from "../lib/clientStatus";

export function StatusDot({ status }) {
  const meta = CLIENT_STATUS_META[status] || CLIENT_STATUS_META.not_set_up;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span
        style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, display: "inline-block", flexShrink: 0 }}
      />
      <span className="muted">{meta.label}</span>
    </span>
  );
}
