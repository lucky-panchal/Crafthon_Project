import { useRef, useState, useCallback, useEffect } from "react";
import useSignalStore, { parseDatasetFile } from "../store/useSignalStore";
import useAlertStore from "../store/useAlertStore";
import { analyseDataset } from "../services/api";

const ACCEPTED = ".csv,.tsv,.json,.txt,.log,.xlsx,.xls,.ods,.pdf,.docx,.doc,.xml,.yaml,.yml";

// ── Loading messages — cycle through while waiting for backend ────────────────
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

export default function DatasetUploader() {
  const inputRef   = useRef(null);
  const abortRef   = useRef(null); // AbortController for cancel

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase,       setPhase]       = useState("idle");
  // idle | ready | analysing | done | error
  const [parsedRows,  setParsedRows]  = useState(null);
  const [filename,    setFilename]    = useState("");
  const [loadingMsg,  setLoadingMsg]  = useState("");
  const [msgIdx,      setMsgIdx]      = useState(0);
  const [result,      setResult]      = useState(null);
  const [errorMsg,    setErrorMsg]    = useState("");

  const loadDataset  = useSignalStore((s) => s.loadDataset);
  const clearDataset = useSignalStore((s) => s.clearDataset);
  const source       = useSignalStore((s) => s.source);
  const datasetName  = useSignalStore((s) => s.datasetName);
  const addAlert     = useAlertStore((s) => s.addAlert);

  // ── Cycle loading messages while analysing ────────────────────────────────
  useEffect(() => {
    if (phase !== "analysing") return;
    setLoadingMsg(LOADING_MSGS[0]);
    setMsgIdx(0);
    const t = setInterval(() => {
      setMsgIdx((i) => {
        const next = (i + 1) % LOADING_MSGS.length;
        setLoadingMsg(LOADING_MSGS[next]);
        return next;
      });
    }, 1800);
    return () => clearInterval(t);
  }, [phase]);

  // ── Parse file on upload ──────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setPhase("idle");
    setResult(null);
    setErrorMsg("");

    try {
      const points = await parseDatasetFile(file);
      setParsedRows(points);
      setFilename(file.name);
      // Load into signal store immediately so charts update
      if (points.length > 0) loadDataset(points, file.name);
      setPhase("ready");
    } catch {
      setErrorMsg("Could not read file — try CSV or JSON.");
      setPhase("error");
      setTimeout(() => setPhase("idle"), 3000);
    }
  }, [loadDataset]);

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

  // ── Analyse ───────────────────────────────────────────────────────────────
  const handleAnalyse = useCallback(async () => {
    if (!parsedRows) return;
    setPhase("analysing");
    setResult(null);

    const controller  = new AbortController();
    abortRef.current  = controller;

    try {
      const res = await analyseDataset(parsedRows, filename);
      if (controller.signal.aborted) return;

      setResult(res);
      setPhase("done");

      // Push detected threats into the alert store
      if (res.threats?.length) {
        res.threats.forEach((t) => {
          addAlert({
            type:       t.type,
            risk:       t.risk,
            confidence: t.confidence,
            reason:     t.reason,
            source:     "dataset",
            timestamp:  new Date().toISOString(),
          });
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      // Never crash — fall back gracefully
      setErrorMsg(err?.message?.includes("fetch") ? "Backend unreachable — charts updated from dataset." : err?.message ?? "Analysis failed.");
      setPhase("error");
      setTimeout(() => setPhase("ready"), 4000);
    } finally {
      abortRef.current = null;
    }
  }, [parsedRows, filename, addAlert]);

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase("ready");
    setLoadingMsg("");
  }, []);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    clearDataset();
    setParsedRows(null);
    setFilename("");
    setResult(null);
    setErrorMsg("");
    setPhase("idle");
  }, [clearDataset]);

  // ── Render ────────────────────────────────────────────────────────────────

  // IDLE — just the upload button
  if (phase === "idle") {
    return (
      <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <input ref={inputRef} type="file" accept={ACCEPTED} onChange={handleChange} className="hidden" />
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-600/60 bg-white/5 backdrop-blur-sm text-slate-300 text-[11px] font-medium hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-300 transition-all duration-200 group"
          title="Upload dataset — CSV, JSON, Excel, PDF, DOCX, TXT and more"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload Dataset
        </button>
      </div>
    );
  }

  // READY — file loaded, show Analyse button
  if (phase === "ready") {
    return (
      <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept={ACCEPTED} onChange={handleChange} className="hidden" />

        {/* File badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#3a4f1a]/60 bg-[#1e2d0e]/50 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
          <span className="text-slate-300 truncate max-w-[120px]" title={filename}>{filename}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">{parsedRows?.length ?? 0} rows</span>
        </div>

        {/* Analyse button */}
        <button
          onClick={handleAnalyse}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-500/50 bg-blue-500/15 text-blue-300 text-[11px] font-semibold hover:bg-blue-500/25 hover:border-blue-400 transition-all"
        >
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          Analyse
        </button>

        {/* Clear */}
        <button onClick={handleClear} className="text-slate-600 hover:text-red-400 text-xs transition-colors" title="Remove dataset">✕</button>
      </div>
    );
  }

  // ANALYSING — loader + cycling messages + cancel
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

  // ERROR
  if (phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-[11px] max-w-[260px]">
          <span className="shrink-0">⚠</span>
          <span className="truncate">{errorMsg}</span>
        </div>
        <button onClick={handleClear} className="text-slate-600 hover:text-slate-300 text-xs transition-colors">✕</button>
      </div>
    );
  }

  // DONE — show result summary inline + re-analyse / clear
  if (phase === "done" && result) {
    const riskColor = RISK_COLOR[result.overall_risk] ?? "#94a3b8";
    return (
      <div className="flex items-center gap-2 flex-wrap">

        {/* Risk badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold"
          style={{ borderColor: `${riskColor}40`, background: `${riskColor}15`, color: riskColor }}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: riskColor }} />
          {result.overall_risk} RISK
        </div>

        {/* Threat tags */}
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

        {/* Row count */}
        <span className="text-[10px] text-slate-600">{result.total_rows} rows</span>

        {/* Re-analyse */}
        <button
          onClick={handleAnalyse}
          className="text-[10px] text-slate-500 hover:text-blue-400 border border-slate-700 hover:border-blue-500/40 px-2 py-1 rounded-lg transition-all"
        >
          Re-analyse
        </button>

        {/* Clear */}
        <button onClick={handleClear} className="text-slate-600 hover:text-red-400 text-xs transition-colors" title="Remove dataset">✕</button>
      </div>
    );
  }

  return null;
}
