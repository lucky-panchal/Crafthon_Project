import { useRef, useState, useCallback, useEffect } from "react";
import useSignalStore, { parseDatasetFile } from "../store/useSignalStore";
import useAlertStore from "../store/useAlertStore";
import useRiskStore from "../store/useRiskStore";
import { analyseDataset, fetchLatestDetection } from "../services/api";

const ACCEPTED = ".csv,.tsv,.json,.txt,.log,.xlsx,.xls,.ods,.xlsm,.xlsb,.xltx,.xltm,.xlt,.xlam,.xla,.pdf,.docx,.doc,.xml,.yaml,.yml,.pkl";

const LOADING_MSGS = [
  "Uploading dataset to analysis engine…",
  "Parsing signal columns…",
  "Running threat detection algorithms…",
  "Checking SNR patterns for jamming…",
  "Scanning packet loss for spoofing…",
  "Computing statistical baselines…",
  "Cross-referencing known attack signatures…",
  "Finalising risk assessment…",
  "Waiting for backend response…",
];

const RISK_COLOR = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e" };

// ── Convert any Google Sheets URL → CSV export URL ────────────────────────────
function toSheetCsvUrl(input) {
  const trimmed = input.trim();

  // Already a direct CSV URL
  if (trimmed.includes("output=csv") || trimmed.endsWith(".csv")) return trimmed;

  // Standard Google Sheets share/edit URL
  // https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=GID
  // https://docs.google.com/spreadsheets/d/SHEET_ID/pub?gid=GID
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;

  const sheetId = match[1];
  const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// ── Fetch + parse Google Sheet as CSV ─────────────────────────────────────────
async function fetchGoogleSheet(url) {
  const csvUrl = toSheetCsvUrl(url);
  if (!csvUrl) throw new Error("Invalid Google Sheets URL.");

  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error("Could not fetch sheet — make sure it is shared publicly (Anyone with link → Viewer).");

  const text = await res.text();
  if (!text.trim()) throw new Error("Sheet appears empty.");

  // Parse CSV inline
  const lines   = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Sheet has no data rows.");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

export default function DatasetUploader() {
  const inputRef  = useRef(null);
  const abortRef  = useRef(null);

  const [tab,        setTab]        = useState("file");   // "file" | "sheet"
  const [sheetUrl,   setSheetUrl]   = useState("");
  const [phase,      setPhase]      = useState("idle");   // idle|ready|analysing|done|error
  const [parsedRows, setParsedRows] = useState(null);
  const [filename,   setFilename]   = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [result,     setResult]     = useState(null);
  const [errorMsg,   setErrorMsg]   = useState("");

  const loadDataset  = useSignalStore((s) => s.loadDataset);
  const clearDataset = useSignalStore((s) => s.clearDataset);

  // ── Cycle loading messages ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "analysing") return;
    setLoadingMsg(LOADING_MSGS[0]);
    const t = setInterval(() => {
      setLoadingMsg((prev) => {
        const idx  = LOADING_MSGS.indexOf(prev);
        return LOADING_MSGS[(idx + 1) % LOADING_MSGS.length];
      });
    }, 1800);
    return () => clearInterval(t);
  }, [phase]);

  // ── Shared: load parsed points into store ─────────────────────────────────
  const commitPoints = useCallback((points, name) => {
    setParsedRows(points);
    setFilename(name);
    if (points.length > 0 && !points[0]?._pkl) loadDataset(points, name);
    setPhase("ready");
  }, [loadDataset]);

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setPhase("idle"); setResult(null); setErrorMsg("");
    try {
      const points = await parseDatasetFile(file);
      commitPoints(points, file.name);
    } catch {
      setErrorMsg("Could not read file — try CSV, JSON or Excel.");
      setPhase("error");
      setTimeout(() => setPhase("idle"), 3000);
    }
  }, [commitPoints]);

  const handleChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Google Sheet import ───────────────────────────────────────────────────
  const handleSheetImport = useCallback(async () => {
    if (!sheetUrl.trim()) return;
    setPhase("analysing"); setResult(null); setErrorMsg("");
    setLoadingMsg("Connecting to Google Sheets…");
    try {
      const rows   = await fetchGoogleSheet(sheetUrl);
      // Re-use parseDatasetFile logic via a synthetic Blob
      const csv    = [
        Object.keys(rows[0]).join(","),
        ...rows.map((r) => Object.values(r).join(",")),
      ].join("\n");
      const blob   = new Blob([csv], { type: "text/csv" });
      const file   = new File([blob], "google-sheet.csv", { type: "text/csv" });
      const points = await parseDatasetFile(file);
      if (points.length === 0) throw new Error("No signal columns found (snr / packetLoss / packetRate).");
      commitPoints(points, "Google Sheet");
    } catch (err) {
      setErrorMsg(err?.message ?? "Failed to import sheet.");
      setPhase("error");
      setTimeout(() => setPhase("idle"), 4000);
    }
  }, [sheetUrl, commitPoints]);

  // ── Analyse ───────────────────────────────────────────────────────────────
  const handleAnalyse = useCallback(async () => {
    if (!parsedRows) return;
    setPhase("analysing"); setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await analyseDataset(parsedRows, filename);
      if (controller.signal.aborted) return;
      setResult(res);
      setPhase("done");

      // ── Fetch authoritative state from backend after analysis ─────────────
      let det = res.last_detection;
      try {
        const latest = await fetchLatestDetection();
        if (latest?.detection) det = latest.detection;
      } catch { /* non-fatal — use last_detection from /analyse response */ }

      // ── Push into all stores so dashboard updates immediately ────────────
      if (det) {
        const frame = {
          type:       det.type       ?? (res.final_threat !== "LOW" ? res.final_threat : "NONE"),
          status:     det.anomaly    ? "ALERT" : "NORMAL",
          risk:       det.risk       ?? res.final_threat ?? "LOW",
          confidence: det.confidence ?? res.avg_confidence ?? 0,
          reason:     det.reason     ?? "",
          source:     det.source     ?? "dataset",
          score:      det.score      ?? 0,
          timestamp:  new Date().toISOString(),
          mode:       "NORMAL",
        };
        // Use getState() to avoid stale closure — always gets current actions
        useAlertStore.getState().pushFrame(frame);
        useRiskStore.getState().syncFromFrame(frame);
      }

      // ── Add individual threat alerts ──────────────────────────────────────
      res.threats?.forEach((t) => useAlertStore.getState().addAlert({
        type: t.type, risk: t.risk, confidence: t.confidence,
        reason: t.reason, source: "dataset", timestamp: new Date().toISOString(),
      }));

    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMsg(err?.message?.includes("fetch")
        ? "Backend unreachable — charts updated from dataset."
        : err?.message ?? "Analysis failed.");
      setPhase("error");
      setTimeout(() => setPhase("ready"), 4000);
    } finally { abortRef.current = null; }
  }, [parsedRows, filename]);

  const handleCancel = useCallback(() => { abortRef.current?.abort(); setPhase("ready"); }, []);
  const handleClear  = useCallback(() => {
    abortRef.current?.abort();
    clearDataset();
    setParsedRows(null); setFilename(""); setResult(null);
    setErrorMsg(""); setSheetUrl(""); setPhase("idle");
  }, [clearDataset]);

  // ── IDLE — tabbed upload UI ───────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="flex flex-col gap-1.5" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <input ref={inputRef} type="file" accept={ACCEPTED} onChange={handleChange} className="hidden" />

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-slate-700/40 w-fit">
          {[["file", "📁 File"], ["sheet", "🔗 Sheet"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={[
                "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all",
                tab === key
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : "text-slate-500 hover:text-slate-300",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* File tab */}
        {tab === "file" && (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-600/60 bg-white/5 backdrop-blur-sm text-slate-300 text-[11px] font-medium hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-300 transition-all duration-200"
            title="Upload CSV, JSON, Excel, PKL and more"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Dataset
          </button>
        )}

        {/* Google Sheet tab */}
        {tab === "sheet" && (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSheetImport()}
              placeholder="Paste Google Sheets URL…"
              className="px-2.5 py-1.5 rounded-xl border border-slate-600/50 bg-white/5 text-slate-300 text-[11px] placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all w-52"
            />
            <button
              onClick={handleSheetImport}
              disabled={!sheetUrl.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-green-500/40 bg-green-500/10 text-green-300 text-[11px] font-semibold hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Import
            </button>
          </div>
        )}

        {/* Hint for sheet tab */}
        {tab === "sheet" && (
          <p className="text-[9px] text-slate-600 max-w-[240px] leading-relaxed">
            Sheet must be shared: <span className="text-slate-500">Anyone with link → Viewer</span>
          </p>
        )}
      </div>
    );
  }

  // ── READY ─────────────────────────────────────────────────────────────────
  if (phase === "ready") {
    return (
      <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept={ACCEPTED} onChange={handleChange} className="hidden" />
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#3a4f1a]/60 bg-[#1e2d0e]/50 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
          <span className="text-slate-300 truncate max-w-[120px]" title={filename}>{filename}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">
            {parsedRows?.[0]?._pkl ? "ML model" : `${parsedRows?.length ?? 0} rows`}
          </span>
        </div>
        <button
          onClick={handleAnalyse}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-500/50 bg-blue-500/15 text-blue-300 text-[11px] font-semibold hover:bg-blue-500/25 hover:border-blue-400 transition-all"
        >
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          Analyse
        </button>
        <button onClick={handleClear} className="text-slate-600 hover:text-red-400 text-xs transition-colors" title="Remove">✕</button>
      </div>
    );
  }

  // ── ANALYSING ─────────────────────────────────────────────────────────────
  if (phase === "analysing") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300 text-[11px] max-w-[280px]">
          <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="truncate">{loadingMsg}</span>
        </div>
        <button
          onClick={handleCancel}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-[11px] max-w-[280px]">
          <span className="shrink-0">⚠</span>
          <span className="truncate">{errorMsg}</span>
        </div>
        <button onClick={handleClear} className="text-slate-600 hover:text-slate-300 text-xs transition-colors">✕</button>
      </div>
    );
  }

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (phase === "done" && result) {
    const riskColor = RISK_COLOR[result.overall_risk] ?? "#94a3b8";
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold"
          style={{ borderColor: `${riskColor}40`, background: `${riskColor}15`, color: riskColor }}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: riskColor }} />
          {result.overall_risk} RISK
        </div>
        {result.threats?.length > 0 ? (
          result.threats.map((t) => (
            <span
              key={t.type}
              className="px-2 py-1 rounded-lg border text-[10px] font-bold"
              style={{ borderColor: `${RISK_COLOR[t.risk]}40`, background: `${RISK_COLOR[t.risk]}15`, color: RISK_COLOR[t.risk] }}
            >
              {t.type} ×{t.count}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-green-400 font-medium">Clean — no threats</span>
        )}
        <span className="text-[10px] text-slate-600">{result.total_rows} rows</span>
        <button
          onClick={handleAnalyse}
          className="text-[10px] text-slate-500 hover:text-blue-400 border border-slate-700 hover:border-blue-500/40 px-2 py-1 rounded-lg transition-all"
        >
          Re-analyse
        </button>
        <button onClick={handleClear} className="text-slate-600 hover:text-red-400 text-xs transition-colors" title="Remove">✕</button>
      </div>
    );
  }

  return null;
}
