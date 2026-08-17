import { useRef, useState } from "react";

/** Click-to-browse file picker that also accepts drag-and-drop — multiple files at
 *  once, up to `maxFiles`, with a removable list of what's been picked so far. */
export function FileDropZone({ id, accept, files, onChange, disabled, maxFiles = 10, hint }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const atLimit = files.length >= maxFiles;

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    onChange([...files, ...incoming].slice(0, maxFiles));
  }

  function removeAt(index) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className={`file-drop-zone${dragging ? " dragging" : ""}${atLimit ? " disabled" : ""}`}
        onClick={() => !disabled && !atLimit && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !atLimit) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && !atLimit) addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple
          disabled={disabled}
          style={{ display: "none" }}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length === 0 ? (
          <>
            <p style={{ margin: 0, fontWeight: 600 }}>Drop files here, or click to browse</p>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
              {hint || `Image (JPG, PNG, WEBP) or PDF — up to ${maxFiles} at once`}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontWeight: 600 }}>
            {atLimit
              ? `${files.length} of ${maxFiles} files selected (limit reached)`
              : `${files.length} of ${maxFiles} files selected — drop more or click to add`}
          </p>
        )}
      </div>

      {files.length > 0 && (
        <ul className="file-drop-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="file-drop-list-item">
              <span>
                <strong>{f.name}</strong> <span className="muted">({Math.round(f.size / 1024)} KB)</span>
              </span>
              <button
                type="button"
                className="file-drop-remove-btn"
                disabled={disabled}
                onClick={() => removeAt(i)}
                aria-label={`Remove ${f.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
