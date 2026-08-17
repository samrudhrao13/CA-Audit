import { Link } from "react-router-dom";
import { PROGRESS_STAGES, STAGE_LABELS } from "../lib/progressStages";

/** Flipkart/courier-tracker-style step tracker instead of a flat percent bar — each of the
 *  4 stages gets a dot (checked once passed, highlighted while current, gray while upcoming)
 *  joined by connector lines that fill in as the workflow moves forward. Pass `linkTo` to make
 *  the whole thing a link into the document checklist — omit it on the checklist page itself,
 *  since linking to the page you're already on would be a dead click. */
export function ProgressBar({ stage, documentsUploaded, documentsTotal, linkTo }) {
  const currentIndex = PROGRESS_STAGES.indexOf(stage);
  const isTerminal = stage === PROGRESS_STAGES[PROGRESS_STAGES.length - 1];
  const docCount = documentsTotal != null ? `${documentsUploaded ?? 0} of ${documentsTotal} documents uploaded` : null;

  const content = (
    <div>
      <div style={{ display: "flex" }}>
        {PROGRESS_STAGES.map((step, i) => {
          const done = i < currentIndex || isTerminal;
          const active = i === currentIndex && !isTerminal;
          const highlighted = done || active;
          const leftLineDone = i > 0 && (i <= currentIndex || isTerminal);
          const rightLineDone = i < currentIndex || isTerminal;

          return (
            <div key={step} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: i === 0 ? "transparent" : leftLineDone ? "var(--primary)" : "var(--border-soft)",
                  }}
                />
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: highlighted ? "white" : "#94a3b8",
                    background: highlighted ? "var(--primary)" : "white",
                    border: `2px solid ${highlighted ? "var(--primary)" : "#cbd5e1"}`,
                    boxShadow: active ? "0 0 0 3px var(--primary-soft)" : "none",
                    transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
                  }}
                >
                  {done ? "✓" : i + 1}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background:
                      i === PROGRESS_STAGES.length - 1 ? "transparent" : rightLineDone ? "var(--primary)" : "var(--border-soft)",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 11,
                  marginTop: 6,
                  textAlign: "center",
                  fontWeight: active ? 700 : 500,
                  color: highlighted ? "var(--text)" : "var(--text-muted)",
                }}
              >
                {STAGE_LABELS[step]}
              </span>
            </div>
          );
        })}
      </div>

      {docCount && (
        <p className="muted" style={{ textAlign: "center", fontSize: 12, margin: "10px 0 0" }}>
          {docCount}
        </p>
      )}

      {linkTo && (
        <p style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--primary)", margin: "8px 0 0" }}>
          View document checklist &rarr;
        </p>
      )}
    </div>
  );

  if (!linkTo) return content;

  return (
    <Link to={linkTo} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      {content}
    </Link>
  );
}
