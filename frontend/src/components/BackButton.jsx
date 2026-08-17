import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeftIcon } from "./icons";

// Landing pages for each role — going back further would just leave the app
// (to /login or nowhere), so the button hides itself there instead of doing nothing useful.
const NO_BACK_PATHS = new Set(["/dashboard", "/platform"]);

/** Sits in the topbar of every authenticated layout (company + platform admin alike), so it's
 *  available on every page for every role without each page having to wire up its own back
 *  link. Uses real browser history (`navigate(-1)`) rather than a hardcoded parent route, so it
 *  works correctly no matter how deep the current page is. */
export function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  if (NO_BACK_PATHS.has(location.pathname)) return null;

  return (
    <button type="button" className="back-btn" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
      <ArrowLeftIcon size={16} />
      <span>Back</span>
    </button>
  );
}
