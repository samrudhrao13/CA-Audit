import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ordinal } from "../lib/ordinal";
import { relevantMonthLabel } from "../lib/complianceMonth";
import { CautionIcon } from "./icons";

export function ComplianceBanner() {
  const [subscriptions, setSubscriptions] = useState(null);
  const [scrolling, setScrolling] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const viewportRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    api.get("/api/workflows/subscriptions").then((res) => setSubscriptions(res.subscriptions));
  }, []);

  const entries = (subscriptions || [])
    .filter((s) => s.status === "active")
    .map((s) => {
      const { documentCollectionStartDay, documentCollectionEndDay, filingDueDay } = s.timeline;
      const collected =
        documentCollectionStartDay && documentCollectionEndDay
          ? `Documents ${ordinal(documentCollectionStartDay)}–${ordinal(documentCollectionEndDay)}`
          : null;
      const due = filingDueDay ? `Filing due by the ${ordinal(filingDueDay)}` : null;
      const text = [collected, due].filter(Boolean).join(" · ");
      if (!text) return null;

      // Once the filing due day has passed this month, this is now next
      // month's cycle — fall back to the collection end day if no due day
      // is set at all.
      const month = relevantMonthLabel(filingDueDay ?? documentCollectionEndDay ?? null);
      return { key: s.workflowKey, text: `${text} — ${month}` };
    })
    .filter(Boolean);

  // Only actually scroll (and only then render the second, duplicate copy
  // that makes the loop seamless) when the content is wider than whatever
  // screen this is showing on. On a plenty-wide desktop monitor a single
  // short entry fits with room to spare — duplicating it there just shows
  // it twice for no reason. Re-measured on resize, so moving the same
  // browser window (or the tab) between a laptop and an external monitor
  // re-decides this correctly instead of it being fixed at load time.
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || entries.length === 0) {
      setScrolling(false);
      return;
    }

    function measure() {
      setScrolling(content.scrollWidth > viewport.clientWidth);
      setContentWidth(content.scrollWidth);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.map((e) => e.key + e.text).join("|")]);

  if (entries.length === 0) return null;

  // ~70px/s reading speed, based on the actual measured content width
  // rather than a guess from entry count.
  const duration = Math.max(10, Math.round(contentWidth / 70));

  return (
    <div className="compliance-banner">
      <div className="compliance-banner-icon">
        <CautionIcon size={16} />
      </div>
      <div className="compliance-banner-viewport" ref={viewportRef}>
        <div
          className={`compliance-banner-track${scrolling ? " scrolling" : ""}`}
          style={scrolling ? { animationDuration: `${duration}s` } : undefined}
        >
          <div className="compliance-banner-content" ref={contentRef}>
            {entries.map((entry) => (
              <span key={entry.key}>
                <strong>{entry.key}:</strong> {entry.text}
              </span>
            ))}
          </div>
          {scrolling && (
            <div className="compliance-banner-content" aria-hidden="true">
              {entries.map((entry) => (
                <span key={entry.key}>
                  <strong>{entry.key}:</strong> {entry.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
