"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { uploadCSV, queryData, deleteDataset, generateDashboard, checkDataHealth, fixDataIssue, getColumnProfile } from "@/lib/api";

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
  title?: string; question: string; sql: string; columns: string[];
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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  
  const [editingSql, setEditingSql] = useState<{ [key: number]: string }>({});
  const [chartOverrides, setChartOverrides] = useState<{ [key: string]: string }>({});
  
  const [showSchema, setShowSchema] = useState(false);
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // New features state
  const [viewMode, setViewMode] = useState<"chat" | "dashboard">("chat");
  const [dashboardResults, setDashboardResults] = useState<QueryResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [fixing, setFixing] = useState(false);
  const [profilingColumn, setProfilingColumn] = useState<{table: string, column: string} | null>(null);
  const [profileData, setProfileData] = useState<any>(null);

  const [queryHistory, setQueryHistory] = useState<{question: string, sql: string, result_summary: string, chart_type: string, row_count: number, timestamp: number}[]>([]);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (retryCountdown !== null && retryCountdown > 0) {
      timer = setTimeout(() => setRetryCountdown(retryCountdown - 1), 1000);
    } else if (retryCountdown === 0) {
      setRetryCountdown(null);
      loadDashboard();
    }
    return () => clearTimeout(timer);
  }, [retryCountdown]);

  useEffect(() => {
    const saved = sessionStorage.getItem("ttd_history");
    if (saved) {
      try { setQueryHistory(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("ttd_history", JSON.stringify(queryHistory));
  }, [queryHistory]);

  /* ---- Upload ---- */
  const handleUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => f.name.toLowerCase().endsWith(".csv") && f.size <= 25 * 1024 * 1024);
    
    if (validFiles.length === 0) { 
      setError("No valid CSV files selected. Files must be .csv and under 25MB."); 
      return; 
    }
    
    setUploading(true); 
    setError(null);
    let lastRes = null;

    try {
      for (let i = 0; i < validFiles.length; i++) {
        setUploadProgress(`Uploading ${i + 1} of ${validFiles.length}...`);
        lastRes = await uploadCSV(validFiles[i]);
      }
      if (lastRes) {
        setSessionData(lastRes);
        setActiveTabIdx(lastRes.tables.length - 1);
        setUploadProgress("All files uploaded successfully");
        setTimeout(() => setUploadProgress(null), 3000);
      }
    } catch (e: any) { 
      setError(e.message); 
      setUploadProgress(null);
    } finally { 
      setUploading(false); 
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }, [handleUpload]);

  /* ---- Query ---- */
  const handleQuery = async (q?: string, sqlOverride?: string) => {
    const qText = q || question;
    if (!qText.trim() && !sqlOverride) return;
    if (!sessionData) { setError("Please upload a CSV first."); return; }
    
    setLoading(true); setError(null);
    setViewMode("chat");
    
    const historyContext = queryHistory.slice(-3).map(h => ({question: h.question, sql: h.sql}));
    
    try {
      const res = await queryData(qText, sqlOverride, historyContext);
      setResults(prev => [res, ...prev]);
      if (!sqlOverride) setQuestion("");
      
      const summary = res.rows.slice(0, 3).map((r: any) => JSON.stringify(r)).join(" | ");
      setQueryHistory(prev => [{ question: qText, sql: res.sql, result_summary: summary, chart_type: res.chart.type, row_count: res.row_count, timestamp: Date.now() }, ...prev]);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleClear = async () => {
    await deleteDataset().catch(() => {});
    setSessionData(null); setResults([]); setQuestion(""); setError(null);
    setQueryHistory([]); setChartOverrides({}); setEditingSql({});
    setViewMode("chat");
    setDashboardResults([]);
    setShowHealth(false);
    setHealthData(null);
  };

  /* ---- Dashboard ---- */
  const loadDashboard = async () => {
    if (!sessionData) return;
    setLoading(true);
    setError(null);
    setViewMode("dashboard");
    try {
      const res = await generateDashboard();
      setDashboardResults(res.results || res);
      setRetryCountdown(null);
    } catch (e: any) { 
      if (e.message.includes("Rate limit reached")) {
        setError("Gemini API rate limit reached. Please wait 30 seconds and try again.");
        setRetryCountdown(30);
      } else {
        setError(e.message);
        setViewMode("chat");
      }
    }
    finally { setLoading(false); }
  };

  /* ---- Data Health ---- */
  const loadHealth = async () => {
    if (!sessionData) return;
    setShowHealth(true);
    setHealthData(null);
    try {
      const res = await checkDataHealth(sessionData.tables[activeTabIdx].name);
      setHealthData(res);
    } catch (e: any) { setError(e.message); }
  };

  const applyFix = async (fixType: string, column: string | null) => {
    if (!sessionData) return;
    setFixing(true);
    try {
      await fixDataIssue(sessionData.tables[activeTabIdx].name, fixType, column || undefined);
      await loadHealth(); // reload health
    } catch (e: any) { setError(e.message); }
    finally { setFixing(false); }
  };

  /* ---- Profile ---- */
  const openProfile = async (col: string) => {
    if (!sessionData) return;
    setProfilingColumn({ table: sessionData.tables[activeTabIdx].name, column: col });
    setProfileData(null);
    try {
      const res = await getColumnProfile(sessionData.tables[activeTabIdx].name, col);
      setProfileData(res);
    } catch(e: any) { setError(e.message); }
  };

  const askAboutColumn = () => {
    if (profilingColumn) {
      setQuestion(`Tell me more about the ${profilingColumn.column} column`);
      setProfilingColumn(null);
      setTimeout(() => document.getElementById("qInput")?.focus(), 100);
    }
  };

  /* ---- Export PDF ---- */
  const exportPDF = () => setTimeout(() => window.print(), 500);

  /* ---- Chart renderer ---- */
  const renderChart = (result: QueryResult, idx: number, prefix: string = "") => {
    const overrideKey = (prefix ? `${prefix}_` : "") + idx;
    const activeType = chartOverrides[overrideKey] || result.chart.type;
    const { chart, rows, columns } = result;
    
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

  const renderResultCard = (result: QueryResult, idx: number, isDashboard: boolean = false) => {
    const activeType = chartOverrides[(isDashboard ? "dash_" : "") + idx] || result.chart.type;
    return (
      <div key={idx} className="bg-white rounded-xl border border-border print:border-gray-300 print:mb-8 overflow-hidden animate-enter print:break-inside-avoid flex flex-col h-full">
        {/* Question header */}
        <div className="px-5 py-4 border-b border-border bg-surface-muted print:bg-gray-100 flex justify-between items-center">
          <div>
            <p className="text-[14px] font-medium text-text print:text-black">{result.title || result.question || "Custom SQL"}</p>
            {isDashboard && result.title && <p className="text-[12px] text-text-muted mt-0.5">{result.question}</p>}
            {!isDashboard && <p className="text-[11px] text-text-muted mt-0.5 print:text-gray-500">{result.row_count} rows returned</p>}
          </div>
          {/* Chart type toggle */}
          <div className="no-print flex gap-1 bg-white p-1 rounded-lg border border-border shrink-0 ml-2">
            {["bar", "line", "pie", "table"].map((t) => (
              <button key={t} onClick={() => setChartOverrides(p => ({...p, [(isDashboard ? "dash_" : "") + idx]: t}))}
                className={`px-2 py-1 text-[10px] font-medium rounded-md capitalize transition-colors ${activeType === t ? "bg-brand text-white" : "text-text-muted hover:bg-surface-muted"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1">
          {activeType !== "table" && activeType !== "stat" && result.rows.length > 0 && (
            <div className="px-5 pt-5 no-print">
              {renderChart(result, idx, isDashboard ? "dash" : "")}
            </div>
          )}
          {activeType === "stat" && result.rows.length > 0 && (
            <div className="px-5 pt-5">
              {renderChart(result, idx, isDashboard ? "dash" : "")}
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
          {!isDashboard && (
            <div className="no-print mt-auto">
              <SqlEditor
                sql={editingSql[idx] ?? result.sql}
                onChange={(v) => setEditingSql(prev => ({ ...prev, [idx]: v }))}
                onRun={() => handleQuery(result.question, editingSql[idx] ?? result.sql)}
              />
            </div>
          )}

          {/* Print SQL Block */}
          <div className="hidden print:block px-5 py-3 border-y border-gray-200 bg-gray-50 mt-auto">
            <p className="text-[11px] text-gray-500 font-mono font-medium mb-1 uppercase tracking-wider">Generated SQL</p>
            <pre className="text-[11px] font-mono text-gray-800 whitespace-pre-wrap">{result.sql}</pre>
          </div>

          {/* Data table */}
          {result.rows.length > 0 && activeType === "table" && (
            <div className="overflow-x-auto print:max-w-full">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-t border-border bg-surface-muted print:bg-gray-100">
                    {result.columns.map((col) => (
                      <th key={col} 
                          onClick={() => !isDashboard && openProfile(col)}
                          className={`text-left py-2 px-4 text-text-muted print:text-gray-700 font-medium whitespace-nowrap ${!isDashboard ? "cursor-pointer hover:text-brand" : ""}`}>
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
      </div>
    );
  };

  return (
    <div className="min-h-screen printable-container flex">
      {/* Sidebar History */}
      <div className={`fixed inset-y-0 left-0 bg-white border-r border-border z-40 transition-transform transform ${showHistory ? "translate-x-0" : "-translate-x-full"} w-[280px] flex flex-col no-print`}>
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-[14px] font-semibold text-text">Query History</h2>
          <button onClick={() => setShowHistory(false)} className="text-text-muted hover:text-text">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {queryHistory.length === 0 ? (
            <p className="text-[12px] text-text-muted text-center py-4">No query history yet.</p>
          ) : (
            queryHistory.map((h, i) => (
              <div key={i} className="p-3 bg-surface-muted rounded-lg border border-border hover:border-brand/30 cursor-pointer" 
                   onClick={() => {
                     setQuestion(h.question);
                     handleQuery(h.question);
                     setShowHistory(false);
                   }}>
                <p className="text-[13px] font-medium text-text mb-1 line-clamp-2">{h.question.length > 50 ? h.question.substring(0, 50) + "..." : h.question}</p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[10px] bg-white border border-border px-1.5 py-0.5 rounded text-text-secondary capitalize">{h.chart_type}</span>
                  <span className="text-[10px] text-text-muted">{h.row_count} rows</span>
                </div>
              </div>
            ))
          )}
        </div>
        {queryHistory.length > 0 && (
          <div className="p-4 border-t border-border">
            <button onClick={() => setQueryHistory([])} className="w-full py-2 text-[12px] text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">Clear History</button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-border sticky top-0 z-30 no-print">
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setShowHistory(true)} className="mr-2 p-1.5 rounded-lg border border-border hover:bg-surface-muted text-text-muted transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
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
                <button onClick={() => setViewMode("chat")}
                  className={`text-[12px] px-3 h-8 rounded-lg border ${viewMode === "chat" ? "bg-brand text-white border-brand" : "border-border text-text-secondary hover:text-brand"}`}>
                  Chat
                </button>
                <button onClick={loadDashboard}
                  className={`text-[12px] px-3 h-8 rounded-lg border ${viewMode === "dashboard" ? "bg-brand text-white border-brand" : "border-border text-text-secondary hover:text-brand"}`}>
                  Dashboard
                </button>
                <button onClick={loadHealth}
                  className="text-[12px] px-3 h-8 rounded-lg border border-border hover:border-brand/30 text-text-secondary hover:text-brand transition-colors">
                  Data Health
                </button>
                {results.length > 0 && viewMode === "chat" && (
                  <button onClick={exportPDF}
                    className="text-[12px] px-3 h-8 rounded-lg border border-border text-text-secondary hover:text-brand transition-colors mr-2">
                    Export
                  </button>
                )}
                <button onClick={handleClear}
                  className="text-[12px] px-3 h-8 rounded-lg border border-border hover:border-red-300 text-text-muted hover:text-red-500 transition-colors">
                  Clear
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

        <div className="max-w-5xl mx-auto px-6 py-8 print:py-0 print:px-0 w-full">
          {error && (
            <div className="no-print mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px] animate-enter flex justify-between items-center">
              <span>{error}</span>
              {error.includes("rate limit") && (
                <div className="flex items-center gap-3">
                  {retryCountdown !== null && (
                    <span className="text-[12px] font-medium text-red-700 bg-red-100 px-2 py-1 rounded">Retrying in {retryCountdown}s</span>
                  )}
                  <button onClick={() => { setRetryCountdown(null); loadDashboard(); }} className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-red-700 font-medium transition-colors">
                    Retry Now
                  </button>
                </div>
              )}
            </div>
          )}

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
                    <p className="text-[13px] text-text-secondary">{uploadProgress || "Processing your CSV..."}</p>
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
                <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden"
                  onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); }} />
              </div>
            </div>
          ) : viewMode === "chat" ? (
            <div className="space-y-6">
              {/* Dataset info */}
              <div className="bg-white rounded-xl border border-border px-5 py-3 print:border-none print:bg-transparent flex justify-between items-center">
                <div className="flex flex-wrap items-center gap-3">
                  {sessionData.tables.map((table, tIdx) => (
                    <div key={table.name} className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5 bg-surface-muted print:bg-white print:border-gray-200">
                      <div className="w-5 h-5 rounded bg-success/[0.08] flex items-center justify-center no-print">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                      <div>
                        <p className="text-[12px] font-medium text-text print:text-black">{table.name} <span className="text-text-muted font-normal print:text-gray-500">({table.filename})</span></p>
                        <p className="text-[10px] text-text-muted print:text-gray-500">{table.row_count.toLocaleString()} rows</p>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => fileInputRef.current?.click()} className="no-print h-9 w-9 rounded-lg border border-dashed border-border hover:border-brand/40 flex items-center justify-center text-brand transition-colors" title="Upload another table">+</button>
                  <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); }} />
                </div>
                <button onClick={() => setShowSchema(!showSchema)} className="no-print text-[12px] text-brand hover:underline">{showSchema ? "Hide" : "Show"} Schema</button>
              </div>

              {/* Schema panel */}
              {showSchema && (
                <div className="no-print bg-white rounded-xl border border-border p-5 animate-enter">
                  <div className="flex gap-4 border-b border-border mb-3">
                    {sessionData.tables.map((t, idx) => (
                      <button key={t.name} onClick={() => setActiveTabIdx(idx)} className={`pb-2 text-[13px] font-medium transition-colors ${activeTabIdx === idx ? "text-brand border-b-2 border-brand" : "text-text-muted hover:text-text"}`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-border"><th className="text-left py-2 px-3 text-text-muted">Column</th><th className="text-left py-2 px-3 text-text-muted">Type</th><th className="text-left py-2 px-3 text-text-muted">Sample Values</th></tr>
                      </thead>
                      <tbody>
                        {sessionData.tables[activeTabIdx]?.schema.map((col) => (
                          <tr key={col.column} className="border-b border-border/50 hover:bg-surface-muted cursor-pointer" onClick={() => openProfile(col.column)}>
                            <td className="py-2 px-3 font-mono font-medium text-brand hover:underline">{col.column}</td>
                            <td className="py-2 px-3"><span className="px-2 py-0.5 rounded bg-surface-raised text-text-secondary">{col.type}</span></td>
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
                  <input id="qInput" type="text" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleQuery()} placeholder="Ask a question about your data..." disabled={loading} className="flex-1 h-10 px-4 rounded-lg border border-border text-[14px] text-text placeholder:text-text-muted focus:outline-none focus:border-brand/40 disabled:opacity-50" />
                  <button onClick={() => handleQuery()} disabled={loading || !question.trim()} className="h-10 px-5 rounded-lg bg-brand hover:bg-brand-light text-white text-[13px] font-medium disabled:opacity-40 transition-colors">{loading ? "Thinking..." : "Ask"}</button>
                </div>
                {sessionData.suggested_questions && sessionData.suggested_questions.length > 0 && results.length === 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] text-text-muted mb-2 uppercase tracking-wider">Suggested questions</p>
                    <div className="flex flex-wrap gap-2">
                      {sessionData.suggested_questions.map((q) => (
                        <button key={q} onClick={() => handleQuery(q)} className="text-[12px] px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-brand/[0.06] border border-border hover:border-brand/30 text-text-secondary hover:text-brand transition-all">{q}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {loading && (
                <div className="no-print bg-white rounded-xl border border-border p-8 text-center animate-enter">
                  <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[13px] text-text-secondary">Generating SQL and fetching results...</p>
                </div>
              )}

              {/* Results */}
              {results.map((result, idx) => renderResultCard(result, idx, false))}
            </div>
          ) : (
            <div className="space-y-6 animate-enter">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-text">Auto-Generated Dashboard</h2>
                <p className="text-text-secondary text-[14px] mt-1">AI-curated insights and overviews for your data.</p>
              </div>
              
              {loading && (
                <div className="no-print bg-white rounded-xl border border-border p-12 text-center">
                  <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-[14px] font-medium text-text">Generating dashboard...</p>
                  <p className="text-[12px] text-text-muted mt-1">Analyzing schema and building diverse queries</p>
                </div>
              )}
              
              {!loading && dashboardResults.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {dashboardResults.map((result, idx) => renderResultCard(result, idx, true))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Data Health Slide-in */}
      <div className={`fixed inset-y-0 right-0 bg-white shadow-xl z-50 w-full sm:w-[400px] border-l border-border transform transition-transform duration-300 ${showHealth ? "translate-x-0" : "translate-x-full"} flex flex-col`}>
        <div className="p-5 border-b border-border flex justify-between items-center bg-surface-muted">
          <h2 className="text-[16px] font-bold text-text">Data Health Assistant</h2>
          <button onClick={() => setShowHealth(false)} className="text-text-muted hover:text-text p-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {!healthData ? (
            <div className="flex justify-center items-center h-40"><div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className={`w-32 h-32 rounded-full border-8 mx-auto flex items-center justify-center mb-4 ${healthData.health_score >= 80 ? "border-green-500 text-green-600" : healthData.health_score >= 60 ? "border-yellow-400 text-yellow-600" : "border-red-500 text-red-600"}`}>
                  <span className="text-4xl font-bold">{healthData.health_score}</span>
                </div>
                <h3 className="font-semibold text-[15px] text-text">Overall Health Score</h3>
              </div>
              
              <div>
                <h4 className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider mb-3">Detected Issues</h4>
                {healthData.issues.length === 0 ? (
                  <p className="text-[13px] text-green-600 bg-green-50 p-3 rounded-lg border border-green-100 text-center">No major issues found. Data looks clean!</p>
                ) : (
                  <div className="space-y-3">
                    {healthData.issues.map((issue: any, i: number) => (
                      <div key={i} className="bg-white border border-border rounded-lg p-3 relative">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-[13px] font-medium text-text">{issue.description}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider ${issue.severity === 'high' ? 'bg-red-100 text-red-700' : issue.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{issue.severity}</span>
                        </div>
                        {issue.fix_available && (
                          <button onClick={() => applyFix(issue.type, issue.column)} disabled={fixing}
                            className="mt-1 text-[11px] bg-brand hover:bg-brand-light text-white px-3 py-1.5 rounded disabled:opacity-50 transition-colors">
                            Fix {issue.type.replace(/_/g, " ")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Column Profile Modal */}
      {profilingColumn && profileData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-enter">
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-[16px] font-bold text-text flex items-center gap-2">
                <span className="font-mono text-brand bg-brand/[0.08] px-2 py-0.5 rounded">{profilingColumn.column}</span>
              </h2>
              <button onClick={() => setProfilingColumn(null)} className="text-text-muted hover:text-text">✕</button>
            </div>
            
            <div className="p-5 space-y-6">
              {/* Top stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-muted p-3 rounded-lg border border-border">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider">Type</p>
                  <p className="text-[14px] font-medium text-text capitalize">{profileData.type}</p>
                </div>
                <div className="bg-surface-muted p-3 rounded-lg border border-border">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider">Null Values</p>
                  <p className={`text-[14px] font-medium ${profileData.null_count > 0 ? 'text-red-500' : 'text-text'}`}>
                    {profileData.null_count} ({(profileData.null_percent * 100).toFixed(1)}%)
                  </p>
                </div>
              </div>

              {profileData.type === "numeric" && (
                <>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {['min', 'max', 'mean', 'median', 'std_dev'].map(stat => (
                      <div key={stat} className="bg-white border border-border p-2 rounded-lg">
                        <p className="text-[10px] text-text-muted capitalize">{stat.replace('_', ' ')}</p>
                        <p className="text-[12px] font-medium text-text mt-1">{profileData[stat] != null ? Number(profileData[stat]).toFixed(2) : "-"}</p>
                      </div>
                    ))}
                  </div>
                  
                  {profileData.histogram && profileData.histogram.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[12px] font-medium text-text mb-3">Distribution</p>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={profileData.histogram} margin={{top:5, right:0, left:0, bottom:20}}>
                          <XAxis dataKey="bucket_label" tick={{fontSize: 10}} angle={-30} textAnchor="end" interval={0} />
                          <Tooltip contentStyle={{fontSize:11, borderRadius:6}} />
                          <Bar dataKey="count" fill="#2563eb" radius={[2,2,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}

              {profileData.type === "text" && (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {['min_length', 'max_length', 'avg_length'].map(stat => (
                      <div key={stat} className="bg-white border border-border p-2 rounded-lg">
                        <p className="text-[10px] text-text-muted capitalize">{stat.replace('_', ' ')}</p>
                        <p className="text-[12px] font-medium text-text mt-1">{profileData[stat] != null ? Number(profileData[stat]).toFixed(1) : "-"}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {profileData.most_common && profileData.most_common.length > 0 && (
                <div>
                  <p className="text-[12px] font-medium text-text mb-2">Most Common Values</p>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={profileData.most_common} layout="vertical" margin={{top:0, right:20, left:40, bottom:0}}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="value" tick={{fontSize:10}} width={60} />
                      <Tooltip contentStyle={{fontSize:11, borderRadius:6}} />
                      <Bar dataKey="count" fill="#059669" radius={[0,2,2,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="pt-2">
                <button onClick={askAboutColumn} className="w-full py-2.5 rounded-lg bg-brand/[0.08] text-brand hover:bg-brand/[0.15] border border-brand/20 text-[13px] font-medium transition-colors">
                  Ask AI about this column
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay to close health panel */}
      {showHealth && <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setShowHealth(false)} />}
      
    </div>
  );
}

/* ---- SQL Editor component ---- */
function SqlEditor({ sql, onChange, onRun }: { sql: string; onChange: (v: string) => void; onRun: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border mt-auto">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-2.5 text-[12px] text-text-muted hover:text-text-secondary transition-colors">
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          {open ? "Hide SQL" : "View SQL"}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
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
