import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

const POLL_MS = 1500;
const TERMINAL_STATUSES = ["SUCCEEDED", "FAILED"];

export function RunPanel({ clientId, onRunFinished }) {
  const [period, setPeriod] = useState("");
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  function pollRun(id) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const data = await api.get(`/api/clients/${clientId}/gst/runs/${id}`);
      setRun(data);
      if (TERMINAL_STATUSES.includes(data.status)) {
        clearInterval(pollRef.current);
        onRunFinished?.();
      }
    }, POLL_MS);
  }

  async function startRun(e) {
    e.preventDefault();
    setError(null);
    setStarting(true);
    try {
      const { runId: newRunId } = await api.post(`/api/clients/${clientId}/gst/runs`, { period });
      setRunId(newRunId);
      setRun({ status: "QUEUED" });
      pollRun(newRunId);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/api/clients/${clientId}/gst/runs/${runId}/otp`, { otp });
      setOtp("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Fetch GST data</h2>
      <form onSubmit={startRun} className="row">
        <div className="field">
          <label htmlFor="period">Period (YYYY-MM)</label>
          <input
            id="period"
            required
            pattern="\d{4}-\d{2}"
            placeholder="2026-07"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        <button type="submit" disabled={starting}>
          {starting ? "Starting..." : "Fetch GST data"}
        </button>
      </form>

      {run && (
        <div className="card" style={{ marginTop: 16, background: "#f8fafc" }}>
          <p style={{ margin: 0 }}>
            Status: <strong>{run.status}</strong>
          </p>
          {run.message && (
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {run.message}
            </p>
          )}
          {run.errorMessage && <p className="error-text">{run.errorMessage}</p>}

          {run.status === "WAITING_OTP" && (
            <form onSubmit={submitOtp} className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label htmlFor="otp">OTP sent to client&apos;s registered mobile/email</label>
                <input id="otp" required value={otp} onChange={(e) => setOtp(e.target.value)} />
              </div>
              <button type="submit">Submit OTP</button>
            </form>
          )}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
