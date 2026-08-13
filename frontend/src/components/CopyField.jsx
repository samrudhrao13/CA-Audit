import { useState } from "react";

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Read-only labeled field with a one-click copy-to-clipboard button — used across client detail views. */
export function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const hasValue = value != null && value !== "";

  async function handleCopy() {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing else to fall back to.
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="copy-field">
        <span className={hasValue ? "copy-field-value" : "muted"}>{hasValue ? value : "Not set"}</span>
        {hasValue && (
          <button
            type="button"
            className="copy-field-btn"
            onClick={handleCopy}
            title={copied ? "Copied" : "Copy"}
            aria-label={`Copy ${label}`}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}
      </div>
    </div>
  );
}
