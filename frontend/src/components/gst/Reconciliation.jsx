import { useState } from "react";
import { api } from "../../lib/api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function InvoiceTable({ rows, emptyText }) {
  if (rows.length === 0) return <p className="muted" style={{ fontSize: 13 }}>{emptyText}</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>GSTIN</th>
          <th>Invoice No.</th>
          <th>Invoice Date</th>
          <th>Taxable Value</th>
          <th>IGST</th>
          <th>CGST</th>
          <th>SGST</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.gstin}</td>
            <td>{r.invoiceNumber}</td>
            <td>{r.invoiceDate}</td>
            <td>{money(r.taxableValue)}</td>
            <td>{money(r.igst)}</td>
            <td>{money(r.cgst)}</td>
            <td>{money(r.sgst)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Compares the client's Invoice Excel for a period against an uploaded GSTR-2B (B2B sheet),
 *  flagging what's on one side but not the other — see backend/src/lib/gstReconciliation.js. */
export function Reconciliation({ clientId }) {
  const [period, setPeriod] = useState("");
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [gstr2bFile, setGstr2bFile] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleRun(e) {
    e.preventDefault();
    if (!invoiceFile || !gstr2bFile) {
      setError("Choose both the Invoice Excel and the GSTR-2B Excel for this period");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const data = await api.uploadFiles(
        `/api/clients/${clientId}/gst/reconciliation`,
        { invoiceFile, gstr2bFile },
        { period }
      );
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleLoadExisting() {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setError("Enter the period first (YYYY-MM)");
      return;
    }
    setError(null);
    try {
      const data = await api.get(`/api/clients/${clientId}/gst/reconciliation/${period}`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleExport() {
    await api.download(`/api/clients/${clientId}/gst/reconciliation/${period}/export`);
  }

  async function handleExportPdf() {
    await api.download(`/api/clients/${clientId}/gst/reconciliation/${period}/export-pdf`);
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>GSTR-2B reconciliation</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
        Compares the client&apos;s purchase invoices against GSTR-2B for a period. The Invoice
        Excel needs these columns (any order): GSTIN, Invoice Number, Invoice Date, Taxable
        Value, IGST, CGST, SGST. The GSTR-2B file is the real export downloaded from the GST
        portal, unmodified.
      </p>

      <form onSubmit={handleRun} className="row" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label htmlFor="reconPeriod">Period (YYYY-MM)</label>
          <input
            id="reconPeriod"
            required
            pattern="\d{4}-\d{2}"
            placeholder="2026-07"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="invoiceFile">Invoice Excel</label>
          <input
            id="invoiceFile"
            type="file"
            accept=".xlsx"
            required
            onChange={(e) => setInvoiceFile(e.target.files[0] || null)}
          />
        </div>
        <div className="field">
          <label htmlFor="gstr2bFile">GSTR-2B Excel</label>
          <input
            id="gstr2bFile"
            type="file"
            accept=".xlsx"
            required
            onChange={(e) => setGstr2bFile(e.target.files[0] || null)}
          />
        </div>
        <button type="submit" disabled={running}>
          {running ? "Reconciling..." : "Run reconciliation"}
        </button>
        <button type="button" className="secondary" onClick={handleLoadExisting}>
          Load existing report
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="card" style={{ background: "#f8fafc" }}>
            <p style={{ margin: 0 }}>
              <strong>{result.matched.length}</strong> matched, <strong>{result.mismatched.length}</strong> matched
              but amounts differ, <strong>{result.clientOnly.length}</strong> only in client invoices,{" "}
              <strong>{result.gstr2bOnly.length}</strong> only in GSTR-2B.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              ITC to be reversed/paid (invoices not backed by GSTR-2B): <strong>{money(result.amountToPay)}</strong>
            </p>
            {(result.skippedInvoiceRows?.outsidePeriod > 0 || result.skippedInvoiceRows?.unparseableDate > 0) && (
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                {result.skippedInvoiceRows.outsidePeriod > 0 &&
                  `${result.skippedInvoiceRows.outsidePeriod} row(s) in the Invoice Excel were for a different period, skipped. `}
                {result.skippedInvoiceRows.unparseableDate > 0 &&
                  `${result.skippedInvoiceRows.unparseableDate} row(s) had an invoice date that couldn't be read, skipped.`}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" className="secondary" onClick={handleExportPdf}>
                Download PDF report
              </button>
              <button type="button" className="secondary" onClick={handleExport}>
                Download Excel report
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3>Client invoices missing from GSTR-2B</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
              The client gave you these invoices, but the supplier hasn&apos;t reflected them in GSTR-2B — this ITC
              isn&apos;t currently eligible.
            </p>
            <InvoiceTable rows={result.clientOnly} emptyText="None — every client invoice is backed by GSTR-2B." />
          </div>

          <div style={{ marginTop: 16 }}>
            <h3>In GSTR-2B but not provided by client</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
              ITC is available on these per GSTR-2B, but the client hasn&apos;t submitted the invoice — worth chasing.
            </p>
            <InvoiceTable rows={result.gstr2bOnly} emptyText="None — every GSTR-2B entry has a matching client invoice." />
          </div>

          {result.mismatched.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Matched but amounts differ</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
                Same GSTIN + invoice number on both sides, but the taxable value or tax amounts don&apos;t line up —
                see the Excel export for a side-by-side.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
