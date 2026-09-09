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
    throw new Error(body.detail || body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadCSV(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request("/api/upload", { method: "POST", body: formData });
}

export async function queryData(question: string, sqlOverride?: string, conversationHistory?: any[]) {
  return request("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      question, 
      sql_override: sqlOverride || null,
      conversation_history: conversationHistory || null
    }),
  });
}

export async function healthCheck() {
  return request("/api/health");
}

export async function deleteDataset() {
  return request("/api/dataset", { method: "DELETE" });
}

export async function generateDashboard() {
  return request("/api/dashboard", { method: "POST" });
}

export async function checkDataHealth(tableName: string) {
  return request("/api/clean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table_name: tableName })
  });
}

export async function fixDataIssue(tableName: string, fixType: string, column?: string) {
  return request("/api/clean/fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table_name: tableName, fix_type: fixType, column: column || null })
  });
}

export async function getColumnProfile(tableName: string, columnName: string) {
  return request(`/api/profile/${encodeURIComponent(tableName)}/${encodeURIComponent(columnName)}`);
}
