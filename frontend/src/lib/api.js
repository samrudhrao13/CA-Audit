import { firebaseAuth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

/** Just the Authorization header — for requests whose body sets its own Content-Type (e.g. multipart uploads). */
async function authOnlyHeaders() {
  const user = firebaseAuth.currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function authHeaders() {
  return { "Content-Type": "application/json", ...(await authOnlyHeaders()) };
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: await authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

/** Downloads a file (CSV/Excel export) that requires auth headers a plain <a href> can't send. */
async function download(path) {
  const res = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Download failed");
  }
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : "export";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Like `download`, but POSTs a JSON body first (e.g. exporting data that only exists in browser state). */
async function postDownload(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || "Download failed");
  }
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : "export";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Uploads a single file as multipart/form-data — don't set Content-Type manually, the browser adds the boundary. */
async function uploadFile(path, fieldName, file, fields = {}) {
  return uploadFiles(path, { [fieldName]: file }, fields);
}

/** Like uploadFile, but for multiple files under different field names in one multipart request
 *  (e.g. two Excel files being compared) — filesByField is {fieldName: File}. */
async function uploadFiles(path, filesByField, fields = {}) {
  const formData = new FormData();
  for (const [fieldName, file] of Object.entries(filesByField)) {
    formData.append(fieldName, file);
  }
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authOnlyHeaders(),
    body: formData,
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, { method: "GET", ...opts }),
  post: (path, body, opts) => request(path, { method: "POST", body, ...opts }),
  put: (path, body, opts) => request(path, { method: "PUT", body, ...opts }),
  delete: (path, opts) => request(path, { method: "DELETE", ...opts }),
  download,
  postDownload,
  uploadFile,
  uploadFiles,
};
