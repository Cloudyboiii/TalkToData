"use client";

import { useState, useRef, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { uploadCSV, queryData, deleteDataset } from "@/lib/api";

/* ---- Types ---- */
interface SchemaCol { column: string; type: string; sample_values: any[]; }
interface Dataset {
  filename: string; row_count: number; column_count: number;
  schema: SchemaCol[]; sample_rows: any[]; suggested_questions: string[];
}
interface QueryResult {
  question: string; sql: string; columns: string[];
  rows: any[]; row_count: number;
  chart: { type: string; x: string | null; y: string | null };
}

export default function Home() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editingSql, setEditingSql] = useState<{ [key: number]: string }>({});
  const [showSchema, setShowSchema] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- Upload ---- */
  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Only CSV files are accepted."); return; }
    if (file.size > 25 * 1024 * 1024) { setError("File exceeds 25MB limit."); return; }
    setUploading(true); setError(null);
    try {
      const res = await uploadCSV(file);
      setDataset(res); setResults([]);
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  /* ---- Query ---- */
  const handleQuery = async (q?: string, sqlOverride?: string) => {
    const qText = q || question;
    if (!qText.trim() && !sqlOverride) return;
    if (!dataset) { setError("Please upload a CSV first."); return; }
    setLoading(true); setError(null);
    try {
      const res = await queryData(qText, sqlOverride);
      setResults(prev => [res, ...prev]);
      if (!sqlOverride) setQuestion("");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleClear = async () => {
    await deleteDataset().catch(() => {});
    setDataset(null); setResults([]); setQuestion(""); setError(null);
  };

  /* ---- Chart renderer ---- */
  const renderChart = (result: QueryResult) => {
    const { chart, rows, columns } = result;
    if (chart.type === "stat" && chart.y) {
      const val = rows[0]?.[chart.y];
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-4xl font-bold text-brand">{typeof val === "number" ? val.toLocaleString() : val}</p>
            <p className="text-sm text-text-muted mt-1">{chart.y.replace(/_/g, " ")}</p>
          </div>
        </div>
      );
    }
    if (chart.type === "bar" && chart.x && chart.y && rows.length > 0) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={chart.x} tick={{ fontSize: 11, fill: "#64748b" }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Bar dataKey={chart.y} fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    if (chart.type === "line" && chart.x && chart.y && rows.length > 0) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={chart.x} tick={{ fontSize: 11, fill: "#64748b" }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Line type="monotone" dataKey={chart.y} stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-text">TalkToData</h1>
              <p className="text-[11px] text-text-muted -mt-0.5">Natural Language SQL</p>
            </div>
          </div>
          {dataset && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowSchema(!showSchema)}
                className="text-[12px] px-3 h-8 rounded-lg border border-border hover:border-brand/30 text-text-secondary hover:text-brand transition-colors">
                {showSchema ? "Hide" : "Show"} Schema
              </button>
              <button onClick={handleClear}
                className="text-[12px] px-3 h-8 rounded-lg border border-border hover:border-red-300 text-text-muted hover:text-red-500 transition-colors">
                Clear Dataset
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Error toast */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px] animate-enter">
            {error}
          </div>
        )}

        {/* Upload section */}
        {!dataset ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-text mb-2">Ask your data anything</h2>
              <p className="text-text-secondary text-[14px]">Upload a CSV file and ask questions in plain English. Get SQL, tables, and charts instantly.</p>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${dragging ? "border-brand bg-brand/[0.03]" : "border-border hover:border-brand/40 hover:bg-brand/[0.02]"}`}
            >
              {uploading ? (
                <div>
                  <div className="w-10 h-10 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[13px] text-text-secondary">Processing your CSV...</p>
                </div>
              ) : (
                <div>
                  <div className="w-12 h-12 rounded-xl bg-brand/[0.08] mx-auto mb-3 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M12 16V8m0 0l-3 3m3-3l3 3M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p className="text-[14px] font-medium text-text mb-1">Drop a CSV file here</p>
                  <p className="text-[12px] text-text-muted">or click to browse — up to 25MB</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>

            {/* Sample datasets hint */}
            <p className="text-center text-[12px] text-text-muted mt-4">
              Try with any CSV — sales data, HR records, financial reports, survey results
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Dataset info bar */}
            <div className="bg-white rounded-xl border border-border px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-success/[0.08] flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-text">{dataset.filename}</p>
                  <p className="text-[11px] text-text-muted">{dataset.row_count.toLocaleString()} rows · {dataset.column_count} columns</p>
                </div>
              </div>
              <button onClick={() => fileInputRef.current?.click()}
                className="text-[12px] text-brand hover:underline">
                Replace
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>

            {/* Schema panel */}
            {showSchema && (
              <div className="bg-white rounded-xl border border-border p-5 animate-enter">
                <h3 className="text-[13px] font-semibold text-text mb-3">Schema</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-text-muted font-medium">Column</th>
                        <th className="text-left py-2 px-3 text-text-muted font-medium">Type</th>
                        <th className="text-left py-2 px-3 text-text-muted font-medium">Sample Values</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataset.schema.map((col) => (
                        <tr key={col.column} className="border-b border-border/50 hover:bg-surface-muted">
                          <td className="py-2 px-3 font-mono font-medium text-brand">{col.column}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded bg-surface-raised text-text-secondary">{col.type}</span>
                          </td>
                          <td className="py-2 px-3 text-text-muted">{col.sample_values.slice(0, 3).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="bg-white rounded-xl border border-border p-4">
              <div className="flex gap-3">
                <input
                  type="text" value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                  placeholder="Ask a question about your data..."
                  disabled={loading}
                  className="flex-1 h-10 px-4 rounded-lg border border-border text-[14px] text-text placeholder:text-text-muted focus:outline-none focus:border-brand/40 disabled:opacity-50"
                />
                <button onClick={() => handleQuery()} disabled={loading || !question.trim()}
                  className="h-10 px-5 rounded-lg bg-brand hover:bg-brand-light text-white text-[13px] font-medium disabled:opacity-40 transition-colors">
                  {loading ? "Thinking..." : "Ask"}
                </button>
              </div>

              {/* Suggested questions */}
              {dataset.suggested_questions.length > 0 && results.length === 0 && (
                <div className="mt-3">
                  <p className="text-[11px] text-text-muted mb-2 uppercase tracking-wider">Suggested questions</p>
                  <div className="flex flex-wrap gap-2">
                    {dataset.suggested_questions.map((q) => (
                      <button key={q} onClick={() => handleQuery(q)}
                        className="text-[12px] px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-brand/[0.06] border border-border hover:border-brand/30 text-text-secondary hover:text-brand transition-all">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Loading */}
            {loading && (
              <div className="bg-white rounded-xl border border-border p-8 text-center animate-enter">
                <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[13px] text-text-secondary">Generating SQL and fetching results...</p>
              </div>
            )}

            {/* Results */}
            {results.map((result, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-border overflow-hidden animate-enter">
                {/* Question header */}
                <div className="px-5 py-4 border-b border-border bg-surface-muted">
                  <p className="text-[14px] font-medium text-text">{result.question || "Custom SQL"}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{result.row_count} rows returned</p>
                </div>

                {/* Chart */}
                {result.chart.type !== "table" && result.rows.length > 0 && (
                  <div className="px-5 pt-5">
                    {renderChart(result)}
                  </div>
                )}

                {/* SQL editor */}
                <SqlEditor
                  sql={editingSql[idx] ?? result.sql}
                  onChange={(v) => setEditingSql(prev => ({ ...prev, [idx]: v }))}
                  onRun={() => handleQuery(result.question, editingSql[idx] ?? result.sql)}
                />

                {/* Data table */}
                {result.rows.length > 0 && result.chart.type !== "stat" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-t border-border bg-surface-muted">
                          {result.columns.map((col) => (
                            <th key={col} className="text-left py-2 px-4 text-text-muted font-medium whitespace-nowrap">
                              {col.replace(/_/g, " ")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.slice(0, 50).map((row, rIdx) => (
                          <tr key={rIdx} className="border-t border-border/50 hover:bg-surface-muted">
                            {result.columns.map((col) => (
                              <td key={col} className="py-2 px-4 text-text-secondary whitespace-nowrap">
                                {row[col] === null || row[col] === undefined ? (
                                  <span className="text-text-muted italic">null</span>
                                ) : String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {result.rows.length > 50 && (
                      <p className="text-center text-[11px] text-text-muted py-2">
                        Showing 50 of {result.rows.length} rows
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-border py-5 mt-12">
        <p className="text-center text-[12px] text-text-muted">
          TalkToData · Powered by Gemini + SQLite · Built by Badal Gupta
        </p>
      </footer>
    </div>
  );
}

/* ---- SQL Editor component ---- */
function SqlEditor({ sql, onChange, onRun }: { sql: string; onChange: (v: string) => void; onRun: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-2.5 text-[12px] text-text-muted hover:text-text-secondary transition-colors">
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          {open ? "Hide SQL" : "View SQL"}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4 animate-enter">
          <textarea value={sql} onChange={(e) => onChange(e.target.value)}
            className="sql-editor w-full p-3 rounded-lg bg-surface-raised border border-border text-text focus:outline-none focus:border-brand/40 min-h-[80px]"
          />
          <button onClick={onRun}
            className="mt-2 text-[12px] px-3 h-7 rounded-lg bg-brand/[0.08] text-brand hover:bg-brand/[0.14] border border-brand/20 transition-colors">
            Run modified SQL
          </button>
        </div>
      )}
    </div>
  );
}
