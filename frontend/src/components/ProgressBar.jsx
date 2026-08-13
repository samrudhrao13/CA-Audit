import { STAGE_LABELS } from "../lib/progressStages";

export function ProgressBar({ stage, percent, documentsUploaded, documentsTotal }) {
  const label = STAGE_LABELS[stage] || stage;
  const docCount = documentsTotal != null ? `${documentsUploaded ?? 0} of ${documentsTotal} documents uploaded` : null;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span>
          {label}
          {docCount ? <span className="muted"> — {docCount}</span> : null}
        </span>
        <span className="muted">{percent}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            background: percent === 100 ? "#059669" : "#0f172a",
            transition: "width 0.2s",
          }}
        />
      </div>
    </div>
  );
}
