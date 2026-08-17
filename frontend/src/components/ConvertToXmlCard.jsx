import { useState } from "react";
import { api } from "../lib/api";
import { FileDropZone } from "./FileDropZone";

const MAX_FILES = 20;
const ACCEPTED_EXTENSIONS = ["csv", "xlsx", "xls", "json"];

/** Direct structured-data-to-XML converter — CSV/Excel/JSON in, XML out, no OCR or template
 *  involved. Separate concept from the extractor above (which reads photos/scans of documents),
 *  for data that's already structured and just needs to end up as XML. */
export function ConvertToXmlCard() {
  const [files, setFiles] = useState([]);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [converted, setConverted] = useState([]);

  async function handleConvert(e) {
    e.preventDefault();
    if (files.length === 0) return;
    setConverting(true);
    setError(null);
    setConverted([]);

    const done = [];
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length });
      const file = files[i];
      try {
        await api.uploadFileDownload("/api/convert/to-xml", "file", file);
        done.push(file.name);
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }
    setProgress(null);
    setConverted(done);
    if (errors.length > 0) setError(errors.join("; "));
    if (done.length > 0) setFiles([]);
    setConverting(false);
  }

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>Convert to XML</p>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Drop a CSV, Excel (.xlsx/.xls), or JSON file with already-structured data and download
          it as XML — one <code>&lt;record&gt;</code> per row, straight conversion with no OCR or
          template involved.
        </p>
      </div>

      <form onSubmit={handleConvert} className="stack" style={{ gap: 12 }}>
        <FileDropZone
          id="convertXmlFiles"
          accept=".csv,.xlsx,.xls,.json"
          files={files}
          onChange={setFiles}
          disabled={converting}
          maxFiles={MAX_FILES}
          hint={`CSV, XLSX, XLS, or JSON — up to ${MAX_FILES} at once`}
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={files.length === 0 || converting} style={{ alignSelf: "flex-start" }}>
          {converting
            ? progress
              ? `Converting ${progress.done + 1} of ${progress.total}...`
              : "Converting..."
            : files.length > 1
              ? `Convert ${files.length} files`
              : "Convert to XML"}
        </button>
      </form>

      {converted.length > 0 && (
        <p className="success-text" style={{ margin: 0, fontSize: 13 }}>
          Downloaded {converted.length === 1 ? converted[0] : `${converted.length} files`} as XML.
        </p>
      )}

      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Supported: {ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")}.
      </p>
    </div>
  );
}
