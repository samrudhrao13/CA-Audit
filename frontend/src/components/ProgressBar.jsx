import { STAGE_LABELS } from "../lib/progressStages";

export function ProgressBar({ stage, percent, documentsUploaded, documentsTotal }) {
  const label = STAGE_LABELS[stage] || stage;
  const docCount = documentsTotal != null ? `${documentsUploaded ?? 0} of ${documentsTotal} documents uploaded` : null;

  // Derive the bar's fill from the exact same numbers the label above shows, whenever a
  // document count is available — so the two can never visibly disagree (e.g. "50%" next to
  // "0 of 5 documents uploaded"), which happened when the server-stored percent came from a
  // coarse 4-stage bucket that didn't know about this client's actual document count yet.
  const displayPercent =
    stage === "filed" ? 100 : documentsTotal ? Math.round(((documentsUploaded || 0) / documentsTotal) * 100) : percent;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span>
          {label}
          {docCount ? <span className="muted"> — {docCount}</span> : null}
        </span>
        <span className="muted">{displayPercent}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${displayPercent}%`,
            background: stage === "filed" ? "#059669" : "#0f172a",
            transition: "width 0.2s",
          }}
        />
      </div>
    </div>
  );
}
