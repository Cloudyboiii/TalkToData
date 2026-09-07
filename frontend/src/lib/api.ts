const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10000";

function getSessionId(): string {
  if (typeof window === "undefined") return "default";
  let id = localStorage.getItem("talktodata_session");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("talktodata_session", id); }
  return id;
}

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "X-Session-ID": getSessionId(), ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadCSV(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request("/api/upload", { method: "POST", body: formData });
}

export async function queryData(question: string, sqlOverride?: string) {
  return request("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, sql_override: sqlOverride || null }),
  });
}

export async function deleteDataset() {
  return request("/api/dataset", { method: "DELETE" });
}

export async function healthCheck() {
  return request("/api/health");
}
