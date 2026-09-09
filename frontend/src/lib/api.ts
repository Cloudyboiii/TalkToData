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

export async function queryData(question: string, sqlOverride?: string, conversationHistory?: any[], activeFilter?: string) {
  return request("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      question, 
      sql_override: sqlOverride || null,
      conversation_history: conversationHistory || null,
      active_filter: activeFilter || null
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

export async function generateFilter(filterText: string, schema: any[]) {
  return request("/api/filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filter_text: filterText, schema })
  });
}

export async function getAnomalies() {
  return request("/api/anomalies", { method: "POST" });
}

export async function getForecast(dateColumn: string, valueColumn: string, periods: number) {
  return request("/api/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date_column: dateColumn, value_column: valueColumn, periods })
  });
}

export async function getCorrelations() {
  return request("/api/correlations", { method: "POST" });
}
