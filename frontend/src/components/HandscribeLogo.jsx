import { HandscribeMark } from "./icons";

const TEAL = "#0d9488";

/**
 * "Powered by HandScribe" attribution — HandScribe is the underlying
 * extraction engine, not this app's own brand, so it's credited rather than
 * given a full hero logo treatment. `sm` is a plain muted inline mention
 * (matches the sidebar's "Powered by {platform}" footer); `md` is a small
 * badge/pill for a bit more presence on the dedicated settings page.
 */
export function HandscribeLogo({ size = "md" }) {
  if (size === "sm") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }} className="muted">
        <span style={{ display: "inline-flex", color: TEAL }}>
          <HandscribeMark size={14} />
        </span>
        Powered by <strong style={{ color: TEAL, fontWeight: 700 }}>HandScribe</strong>
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px 6px 8px",
        borderRadius: 999,
        background: "#f0fdfa",
        border: "1px solid #99f6e4",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: TEAL,
          color: "white",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <HandscribeMark size={13} />
      </span>
      <span style={{ fontSize: 13, color: "#0f766e" }}>
        Powered by <strong style={{ fontWeight: 800, letterSpacing: "-0.01em" }}>HandScribe</strong>
      </span>
    </span>
  );
}
