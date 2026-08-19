import { useState } from "react";

/**
 * Horizontal bar list — each row is independently scaled to the set's own max, bars square
 * at the baseline and rounded at the data end, values direct-labeled since a list this short
 * (a handful of rows) is exactly what direct labels are for. No legend box: each bar carries
 * its own label right beside it, so color only ever repeats an identity already spelled out
 * in text next to it.
 */
export function BarList({ data, formatValue = (v) => v.toLocaleString(), height = 14, emptyText = "No data yet." }) {
  const [hoveredKey, setHoveredKey] = useState(null);

  if (data.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {emptyText}
      </p>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="stack" style={{ gap: 14 }}>
      {data.map((d) => {
        const pct = d.value > 0 ? Math.max((d.value / max) * 100, 3) : 0;
        const hovered = hoveredKey === d.key;
        return (
          <div
            key={d.key}
            style={{ position: "relative" }}
            onMouseEnter={() => setHoveredKey(d.key)}
            onMouseLeave={() => setHoveredKey((k) => (k === d.key ? null : k))}
            onFocus={() => setHoveredKey(d.key)}
            onBlur={() => setHoveredKey((k) => (k === d.key ? null : k))}
            tabIndex={0}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 4,
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{d.label}</span>
              <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", fontWeight: 600, flexShrink: 0 }}>
                {formatValue(d.value)}
              </span>
            </div>
            <div
              style={{
                height,
                borderRadius: 4,
                background: "var(--border-soft)",
                overflow: "hidden",
                outline: hovered ? `2px solid ${d.color}` : "none",
                outlineOffset: 2,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: d.color,
                  borderRadius: "0 4px 4px 0",
                  transition: "width 300ms ease",
                }}
              />
            </div>
            {hovered && (
              <div
                role="tooltip"
                style={{
                  position: "absolute",
                  bottom: `calc(100% + 6px)`,
                  left: 0,
                  background: "var(--text)",
                  color: "#fff",
                  fontSize: 12,
                  padding: "5px 9px",
                  borderRadius: 6,
                  whiteSpace: "nowrap",
                  boxShadow: "var(--shadow-md)",
                  zIndex: 5,
                  pointerEvents: "none",
                }}
              >
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatValue(d.value)}</strong>
                <span style={{ opacity: 0.85, marginLeft: 6 }}>{d.label}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
