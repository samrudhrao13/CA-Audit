import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useUserProfile } from "../context/UserProfileContext";

const STATUS_META = {
  present: { label: "Present", color: "var(--success)" },
  absent: { label: "Absent", color: "var(--danger)" },
  leave: { label: "Leave", color: "var(--warning)" },
  half_day: { label: "Half day", color: "#6366f1" },
};
const STATUS_ORDER = ["present", "absent", "leave", "half_day"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthStr() {
  return new Date().toISOString().slice(0, 7);
}

function StatusBadge({ status }) {
  if (!status) {
    return <span className="muted">Not marked</span>;
  }
  const meta = STATUS_META[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: meta.color }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, display: "inline-block" }} />
      {meta.label}
    </span>
  );
}

function StatusButtons({ current, disabled, onPick }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {STATUS_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className={current === s ? "" : "secondary"}
          style={{ padding: "5px 10px", fontSize: 12.5 }}
        >
          {STATUS_META[s].label}
        </button>
      ))}
    </div>
  );
}

export function AttendancePage() {
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "COMPANY_ADMIN";

  return (
    <div className="stack">
      <div>
        <h1>Attendance</h1>
        <p className="muted">{isAdmin ? "Today's roster and monthly summary for your team." : "Mark your attendance and see your history."}</p>
      </div>
      {isAdmin ? <AdminAttendance /> : <MyAttendance />}
    </div>
  );
}

function MyAttendance() {
  const [records, setRecords] = useState(null);
  const [month, setMonth] = useState(monthStr());
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState(null);

  async function load(m) {
    const { records } = await api.get(`/api/attendance/me?month=${m}`);
    setRecords(records);
  }

  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const today = todayStr();
  const todayRecord = records?.find((r) => r.date === today);

  async function handleMark(status) {
    setMarking(true);
    setError(null);
    try {
      await api.post("/api/attendance/mark", { date: today, status });
      await load(month);
    } catch (err) {
      setError(err.message);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <p style={{ marginTop: 0, fontWeight: 600 }}>Today — {today}</p>
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <StatusBadge status={todayRecord?.status} />
          <StatusButtons current={todayRecord?.status} disabled={marking} onPick={handleMark} />
        </div>
        {error && (
          <p className="error-text" style={{ marginBottom: 0 }}>
            {error}
          </p>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>My history</p>
          <div className="field" style={{ margin: 0 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
        {records === null ? (
          <p className="muted">Loading...</p>
        ) : records.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            No attendance marked for this month yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {records.map((r) => (
              <li key={r.date} className="list-item-row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <span>{r.date}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminAttendance() {
  const [date, setDate] = useState(todayStr());
  const [roster, setRoster] = useState(null);
  const [markingUid, setMarkingUid] = useState(null);
  const [rosterError, setRosterError] = useState(null);

  const [month, setMonth] = useState(monthStr());
  const [summary, setSummary] = useState(null);

  async function loadRoster(d) {
    const { roster } = await api.get(`/api/attendance/company?date=${d}`);
    setRoster(roster);
  }
  async function loadSummary(m) {
    const { summary } = await api.get(`/api/attendance/company/summary?month=${m}`);
    setSummary(summary);
  }

  useEffect(() => {
    loadRoster(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  useEffect(() => {
    loadSummary(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function handleMark(uid, status) {
    setMarkingUid(uid);
    setRosterError(null);
    try {
      await api.post("/api/attendance/mark", { uid, date, status });
      await Promise.all([loadRoster(date), loadSummary(month)]);
    } catch (err) {
      setRosterError(err.message);
    } finally {
      setMarkingUid(null);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Today's roster</p>
          <div className="field" style={{ margin: 0 }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {rosterError && <p className="error-text">{rosterError}</p>}
        {roster === null ? (
          <p className="muted">Loading...</p>
        ) : roster.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            No company users yet — add some under Settings → Team.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {roster.map((m) => (
              <li
                key={m.uid}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              >
                <span>
                  {m.name} <span className="muted">({m.userId})</span>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <StatusBadge status={m.record?.status} />
                  <StatusButtons current={m.record?.status} disabled={markingUid === m.uid} onPick={(s) => handleMark(m.uid, s)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Monthly summary</p>
          <div className="field" style={{ margin: 0 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
        {summary === null ? (
          <p className="muted">Loading...</p>
        ) : summary.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            No company users yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Leave</th>
                  <th>Half day</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.uid}>
                    <td>{s.name}</td>
                    <td>{s.present}</td>
                    <td>{s.absent}</td>
                    <td>{s.leave}</td>
                    <td>{s.half_day}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
