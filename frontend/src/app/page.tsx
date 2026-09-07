"use client";

import { useState, useRef, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { uploadCSV, queryData, deleteDataset } from "@/lib/api";

/* ---- Types ---- */
interface SchemaCol { column: string; type: string; sample_values: any[]; }
interface TableInfo {
  name: string; filename: string; row_count: number; column_count: number;
  schema: SchemaCol[]; sample_rows: any[];
}
interface SessionData {
  tables: TableInfo[];
  suggested_questions: string[];
}
interface QueryResult {
  question: string; sql: string; columns: string[];
  rows: any[]; row_count: number;
  chart: { type: string; x: string | null; y: string | null };
  insights?: string[];
}

const PIE_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

export default function Home() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  
  const [editingSql, setEditingSql] = useState<{ [key: number]: string }>({});
  const [chartOverrides, setChartOverrides] = useState<{ [key: number]: string }>({});
  
  const [showSchema, setShowSchema] = useState(false);
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  const [queryHistory, setQueryHistory] = useState<{question: string, sql: string, result_summary: string}[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- Upload ---- */
  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Only CSV files are accepted."); return; }
    if (file.size > 25 * 1024 * 1024) { setError("File exceeds 25MB limit."); return; }
    setUploading(true); setError(null);
    try {
      const res = await uploadCSV(file);
      setSessionData(res);
      setActiveTabIdx(res.tables.length - 1);
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
    if (!sessionData) { setError("Please upload a CSV first."); return; }
    
    setLoading(true); setError(null);
    
    // Pass last 3 queries
    const historyContext = queryHistory.slice(-3);
    
    try {
      const res = await queryData(qText, sqlOverride, historyContext);
      setResults(prev => [res, ...prev]);
      if (!sqlOverride) setQuestion("");
      
      // Update history
      const summary = res.rows.slice(0, 3).map((r: any) => JSON.stringify(r)).join(" | ");
      setQueryHistory(prev => [...prev, { question: qText, sql: res.sql, result_summary: summary }]);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleClear = async () => {
    await deleteDataset().catch(() => {});
    setSessionData(null); setResults([]); setQuestion(""); setError(null);
    setQueryHistory([]); setChartOverrides({}); setEditingSql({});
  };

  /* ---- Export PDF ---- */
  const exportPDF = () => {
    setTimeout(() => {
      window.print();
    }, 500);
  };

  /* ---- Chart renderer ---- */
  const renderChart = (result: QueryResult, idx: number) => {
    const activeType = chartOverrides[idx] || result.chart.type;
    const { chart, rows, columns } = result;
    
    // Default X/Y logic if override is forced and default didn't have one
    const xAxis = chart.x || (columns.length > 0 ? columns[0] : null);
    const yAxis = chart.y || (columns.length > 1 ? columns[1] : null);

    if (activeType === "stat" && yAxis) {
      const val = rows[0]?.[yAxis];
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-4xl font-bold text-brand">{typeof val === "number" ? val.toLocaleString() : val}</p>
            <p className="text-sm text-text-muted mt-1">{yAxis.replace(/_/g, " ")}</p>
          </div>
        </div>
      );
    }
    
    if (activeType === "bar" && xAxis && yAxis && rows.length > 0) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xAxis} tick={{ fontSize: 11, fill: "#64748b" }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Bar dataKey={yAxis} fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    
    if (activeType === "line" && xAxis && yAxis && rows.length > 0) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xAxis} tick={{ fontSize: 11, fill: "#64748b" }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Line type="monotone" dataKey={yAxis} stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (activeType === "pie" && xAxis && yAxis && rows.length > 0) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <Pie data={rows} dataKey={yAxis} nameKey={xAxis} cx="50%" cy="50%" outerRadius={90} label>
              {rows.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen printable-container">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-30 no-print">
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
          {sessionData && (
            <div className="flex items-center gap-2">
              {results.length > 0 && (
                <button onClick={exportPDF}
                  className="text-[12px] px-3 h-8 rounded-lg bg-brand text-white font-medium hover:bg-brand-light transition-colors mr-2">
                  Export Report
                </button>
              )}
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

      {/* Print-only Header */}
      <div className="hidden print:block print:mb-8 text-center">
        <h1 className="text-3xl font-bold text-black mb-2">TalkToData Analysis Report</h1>
        <p className="text-sm text-gray-600">Generated: {new Date().toLocaleString()}</p>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 print:py-0 print:px-0">
        {/* Error toast */}
        {error && (
          <div className="no-print mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px] animate-enter">
            {error}
          </div>
        )}

        {/* Upload section */}
        {!sessionData ? (
          <div className="max-w-2xl mx-auto no-print">
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
          </div>
        ) : (
          <div className="space-y-6">
            {/* Dataset info bar */}
            <div className="bg-white rounded-xl border border-border px-5 py-3 print:border-none print:bg-transparent">
              <h3 className="text-[14px] font-semibold text-text mb-2 no-print">Active Tables</h3>
              <div className="flex flex-wrap items-center gap-3">
                {sessionData.tables.map((table, tIdx) => (
                  <div key={table.name} className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5 bg-surface-muted print:bg-white print:border-gray-200">
                    <div className="w-5 h-5 rounded bg-success/[0.08] flex items-center justify-center no-print">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-text print:text-black">{table.name} <span className="text-text-muted font-normal print:text-gray-500">({table.filename})</span></p>
                      <p className="text-[10px] text-text-muted print:text-gray-500">{table.row_count.toLocaleString()} rows</p>
                    </div>
                  </div>
                ))}
                
                <button onClick={() => fileInputRef.current?.click()}
                  className="no-print h-9 w-9 rounded-lg border border-dashed border-border hover:border-brand/40 flex items-center justify-center text-brand transition-colors"
                  title="Upload another table">
                  +
                </button>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              </div>
            </div>

            {/* Schema panel */}
            {showSchema && (
              <div className="no-print bg-white rounded-xl border border-border p-5 animate-enter">
                <div className="flex gap-4 border-b border-border mb-3">
                  {sessionData.tables.map((t, idx) => (
                    <button key={t.name} onClick={() => setActiveTabIdx(idx)}
                      className={`pb-2 text-[13px] font-medium transition-colors ${activeTabIdx === idx ? "text-brand border-b-2 border-brand" : "text-text-muted hover:text-text"}`}>
                      {t.name}
                    </button>
                  ))}
                </div>
                
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
                      {sessionData.tables[activeTabIdx]?.schema.map((col) => (
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
            <div className="no-print bg-white rounded-xl border border-border p-4">
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
              {sessionData.suggested_questions && sessionData.suggested_questions.length > 0 && results.length === 0 && (
                <div className="mt-3">
                  <p className="text-[11px] text-text-muted mb-2 uppercase tracking-wider">Suggested questions</p>
                  <div className="flex flex-wrap gap-2">
                    {sessionData.suggested_questions.map((q) => (
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
              <div className="no-print bg-white rounded-xl border border-border p-8 text-center animate-enter">
                <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[13px] text-text-secondary">Generating SQL and fetching results...</p>
              </div>
            )}

            {/* Results */}
            {results.map((result, idx) => {
              const activeType = chartOverrides[idx] || result.chart.type;
              return (
                <div key={idx} className="bg-white rounded-xl border border-border print:border-gray-300 print:mb-8 overflow-hidden animate-enter print:break-inside-avoid">
                  {/* Question header */}
                  <div className="px-5 py-4 border-b border-border bg-surface-muted print:bg-gray-100 flex justify-between items-center">
                    <div>
                      <p className="text-[14px] font-medium text-text print:text-black">{result.question || "Custom SQL"}</p>
                      <p className="text-[11px] text-text-muted mt-0.5 print:text-gray-500">{result.row_count} rows returned</p>
                    </div>
                    {/* Chart type toggle */}
                    <div className="no-print flex gap-1 bg-white p-1 rounded-lg border border-border">
                      {["bar", "line", "pie", "table"].map((t) => (
                        <button key={t} onClick={() => setChartOverrides(p => ({...p, [idx]: t}))}
                          className={`px-3 py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${activeType === t ? "bg-brand text-white" : "text-text-muted hover:bg-surface-muted"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chart */}
                  {activeType !== "table" && activeType !== "stat" && result.rows.length > 0 && (
                    <div className="px-5 pt-5 no-print">
                      {renderChart(result, idx)}
                    </div>
                  )}
                  {activeType === "stat" && result.rows.length > 0 && (
                    <div className="px-5 pt-5">
                      {renderChart(result, idx)}
                    </div>
                  )}

                  {/* Insights */}
                  {result.insights && result.insights.length > 0 && (
                    <div className="mx-5 mt-4 mb-2 p-4 rounded-xl bg-blue-50 border border-blue-100 print:bg-white print:border-gray-200">
                      <h4 className="text-[12px] font-semibold text-brand flex items-center gap-1.5 mb-2 print:text-black">
                        <span>✨</span> AI Insights
                      </h4>
                      <ul className="space-y-1.5 pl-2">
                        {result.insights.map((insight, iIdx) => (
                          <li key={iIdx} className="text-[12px] text-text-secondary print:text-black leading-relaxed flex gap-2">
                            <span className="text-brand/50 print:text-gray-500">•</span>
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* SQL editor */}
                  <div className="no-print">
                    <SqlEditor
                      sql={editingSql[idx] ?? result.sql}
                      onChange={(v) => setEditingSql(prev => ({ ...prev, [idx]: v }))}
                      onRun={() => handleQuery(result.question, editingSql[idx] ?? result.sql)}
                    />
                  </div>

                  {/* Print SQL Block */}
                  <div className="hidden print:block px-5 py-3 border-y border-gray-200 bg-gray-50">
                    <p className="text-[11px] text-gray-500 font-mono font-medium mb-1 uppercase tracking-wider">Generated SQL</p>
                    <pre className="text-[11px] font-mono text-gray-800 whitespace-pre-wrap">{result.sql}</pre>
                  </div>

                  {/* Data table */}
                  {result.rows.length > 0 && activeType !== "stat" && (
                    <div className="overflow-x-auto print:max-w-full">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-t border-border bg-surface-muted print:bg-gray-100">
                            {result.columns.map((col) => (
                              <th key={col} className="text-left py-2 px-4 text-text-muted print:text-gray-700 font-medium whitespace-nowrap">
                                {col.replace(/_/g, " ")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.slice(0, 50).map((row, rIdx) => (
                            <tr key={rIdx} className="border-t border-border/50 hover:bg-surface-muted print:border-gray-200 print:hover:bg-transparent">
                              {result.columns.map((col) => (
                                <td key={col} className="py-2 px-4 text-text-secondary print:text-black whitespace-nowrap">
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
                        <p className="text-center text-[11px] text-text-muted py-2 no-print">
                          Showing 50 of {result.rows.length} rows
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-border py-5 mt-12 no-print">
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
