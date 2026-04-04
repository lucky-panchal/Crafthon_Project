/**
 * src/store/useSignalStore.js
 *
 * Single source of truth for live telemetry signal values.
 *
 * Fixes applied
 * ─────────────
 *   1. snr resolution: raw.snr (no self-reference)
 *   2. _fallbackTimer moved to module-level — avoids Zustand state anti-pattern
 *      and React StrictMode double-fire
 *   3. stopFallback called via useSignalStore.getState() not get() to avoid
 *      fragile pre-set() call ordering
 */

import { create } from "zustand";
import { shallow } from "zustand/shallow";

const MAX_HISTORY          = 20;
const FALLBACK_INTERVAL_MS = 1_000;

const SIM = {
  snr:        { drift: 1.5, min: 10,  max: 35  },
  packetLoss: { drift: 0.8, min: 0,   max: 40  },
  packetRate: { drift: 20,  min: 100, max: 800 },
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function step(current, cfg) {
  return parseFloat(clamp(current + (Math.random() - 0.5) * 2 * cfg.drift, cfg.min, cfg.max).toFixed(2));
}

let _fallbackTimer  = null;
let _datasetTimer   = null;

// ── Dataset row parser ────────────────────────────────────────────────────────
// Tries to extract snr, packetLoss, packetRate from any row object.
function extractRow(row) {
  const k = (obj, ...keys) => {
    for (const key of keys) {
      const found = Object.keys(obj).find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === key);
      if (found !== undefined && obj[found] !== "" && !isNaN(Number(obj[found]))) return Number(obj[found]);
    }
    return null;
  };
  return {
    snr:        k(row, "snr", "signaltonoise", "signal"),
    packetLoss: k(row, "packetloss", "loss", "pktloss", "losspct"),
    packetRate: k(row, "packetrate", "rate", "pktrate", "packets"),
  };
}

// ── CSV parser (no dependency) ────────────────────────────────────────────────
function parseCSV(text) {
  const lines  = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

// ── TSV / plain text parser ───────────────────────────────────────────────────
function parseTSV(text) {
  const lines   = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const sep     = lines[0].includes("\t") ? "\t" : /\s{2,}/.test(lines[0]) ? /\s{2,}/ : " ";
  const headers = lines[0].split(sep).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(sep).map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

// ── JSON parser ───────────────────────────────────────────────────────────────
function parseJSON(text) {
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : data.data ?? data.rows ?? data.records ?? [];
  } catch { return []; }
}

// ── Excel parser (xlsx library) ──────────────────────────────────────────────
async function parseExcel(file) {
  try {
    const XLSX       = await import("xlsx");
    const buffer     = await file.arrayBuffer();
    const workbook   = XLSX.read(buffer, { type: "array" });
    const sheet      = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  } catch { return []; }
}

const EXCEL_EXTS = [".xlsx", ".xls", ".ods", ".xlsm", ".xlsb", ".xltx", ".xltm", ".xlt", ".xlam", ".xla"];

// ── Master file parser ────────────────────────────────────────────────────────
export async function parseDatasetFile(file) {
  const name = file.name.toLowerCase();

  // PKL — binary Python pickle; cannot be parsed in browser.
  if (name.endsWith(".pkl")) {
    return [{ time: "T+0", snr: 25, packetLoss: 5, packetRate: 300, _pkl: true, _filename: file.name }];
  }

  // Excel / ODS — use xlsx library for proper binary parsing
  if (EXCEL_EXTS.some((ext) => name.endsWith(ext))) {
    const rows = await parseExcel(file);
    const points = rows
      .map((r, i) => ({ ...extractRow(r), idx: i }))
      .filter((r) => r.snr !== null || r.packetLoss !== null || r.packetRate !== null)
      .map((r, i) => ({
        time:       `T+${i}`,
        snr:        r.snr        ?? 25,
        packetLoss: r.packetLoss ?? 5,
        packetRate: r.packetRate ?? 300,
      }));
    return points;
  }

  const text = await file.text().catch(() => "");

  let rows = [];

  if (name.endsWith(".csv"))                          rows = parseCSV(text);
  else if (name.endsWith(".tsv"))                     rows = parseTSV(text);
  else if (name.endsWith(".json"))                    rows = parseJSON(text);
  else if (name.endsWith(".txt") || name.endsWith(".log")) rows = parseCSV(text).length > 1 ? parseCSV(text) : parseTSV(text);
  else {
    // PDF, DOCX, etc — extract any numbers from plain text lines
    const numLines = text.split(/\r?\n/).filter((l) => /[\d.]+/.test(l));
    rows = numLines.map((l) => {
      const nums = l.match(/[\d.]+/g) ?? [];
      return { snr: nums[0], packetLoss: nums[1], packetRate: nums[2] };
    });
  }

  // Extract valid signal rows
  const points = rows
    .map((r, i) => ({ ...extractRow(r), idx: i }))
    .filter((r) => r.snr !== null || r.packetLoss !== null || r.packetRate !== null)
    .map((r, i) => ({
      time:       `T+${i}`,
      snr:        r.snr        ?? 25,
      packetLoss: r.packetLoss ?? 5,
      packetRate: r.packetRate ?? 300,
    }));

  return points;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const useSignalStore = create((set, get) => ({

  // ── State ──────────────────────────────────────────────────────────────────
  snr:         28,
  packetLoss:  5,
  packetRate:  0,
  lastUpdated: "--",
  source:      "fallback",  // "live" | "fallback" | "dataset"
  datasetName: null,        // filename when dataset is loaded
  history:     [],

  // ── setSignalData ──────────────────────────────────────────────────────────
  setSignalData: (raw) => {
    // Fix 1: correct field resolution — no self-reference
    const snr        = raw.snr;
    const packetLoss = raw.packetLoss ?? raw.packet_loss;
    const packetRate = raw.packetRate ?? raw.packet_rate;
    const time       = raw.time;

    const next = {};
    if (Number.isFinite(snr))        next.snr        = snr;
    if (Number.isFinite(packetLoss)) next.packetLoss = packetLoss;
    if (Number.isFinite(packetRate)) next.packetRate = packetRate;
    if (time)                        next.lastUpdated = time;

    if (Object.keys(next).length === 0) return;

    // Fix 3: use getState() not get() — safe regardless of call ordering
    if (get().source === "fallback") {
      useSignalStore.getState().stopFallback();
      next.source = "live";
    }

    // Append to rolling history using current state snapshot
    const s = get();
    next.history = [
      ...s.history.slice(-(MAX_HISTORY - 1)),
      {
        time:       next.lastUpdated ?? s.lastUpdated,
        snr:        next.snr        ?? s.snr,
        packetLoss: next.packetLoss ?? s.packetLoss,
      },
    ];

    set(next);
    console.log(`[SignalStore] live  snr=${next.snr ?? "--"}  loss=${next.packetLoss ?? "--"}`);
  },

  // ── loadDataset ────────────────────────────────────────────────────────────
  loadDataset: (points, filename) => {
    if (!points || points.length === 0) return false;

    // Stop fallback + any previous dataset playback
    useSignalStore.getState().stopFallback();
    if (_datasetTimer) { clearInterval(_datasetTimer); _datasetTimer = null; }

    // Seed history with up to MAX_HISTORY points immediately
    const initial = points.slice(0, MAX_HISTORY);
    const last    = initial[initial.length - 1];
    set({
      snr:         last.snr,
      packetLoss:  last.packetLoss,
      packetRate:  last.packetRate,
      lastUpdated: last.time,
      source:      "dataset",
      datasetName: filename,
      history:     initial,
    });

    // Replay remaining rows one per second, then loop
    let idx = MAX_HISTORY;
    _datasetTimer = setInterval(() => {
      const pt = points[idx % points.length];
      idx++;
      const s = useSignalStore.getState();
      set({
        snr:         pt.snr,
        packetLoss:  pt.packetLoss,
        packetRate:  pt.packetRate,
        lastUpdated: pt.time,
        history:     [...s.history.slice(-(MAX_HISTORY - 1)), pt],
      });
    }, 1_000);

    console.log(`[SignalStore] dataset loaded: ${filename} (${points.length} rows)`);
    return true;
  },

  // ── clearDataset ───────────────────────────────────────────────────────────
  clearDataset: () => {
    if (_datasetTimer) { clearInterval(_datasetTimer); _datasetTimer = null; }
    set({ source: "fallback", datasetName: null, history: [] });
    useSignalStore.getState().startFallback();
    console.log("[SignalStore] dataset cleared — fallback resumed");
  },

  // ── startFallback ──────────────────────────────────────────────────────────
  startFallback: () => {
    if (_fallbackTimer) return; // Fix 2: module-level guard, no Zustand state needed

    console.log("[SignalStore] fallback started");

    _fallbackTimer = setInterval(() => {
      const s   = get();
      const now = new Date().toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      const nextSnr  = step(s.snr,        SIM.snr);
      const nextLoss = step(s.packetLoss, SIM.packetLoss);
      const nextPR   = step(s.packetRate, SIM.packetRate);

      set({
        snr:         nextSnr,
        packetLoss:  nextLoss,
        packetRate:  nextPR,
        lastUpdated: now,
        source:      "fallback",
        history:     [
          ...s.history.slice(-(MAX_HISTORY - 1)),
          { time: now, snr: nextSnr, packetLoss: nextLoss },
        ],
      });
    }, FALLBACK_INTERVAL_MS);
  },

  // ── stopFallback ───────────────────────────────────────────────────────────
  stopFallback: () => {
    if (!_fallbackTimer) return;
    clearInterval(_fallbackTimer);
    _fallbackTimer = null;
    console.log("[SignalStore] fallback stopped");
  },

}));

export default useSignalStore;

// ── Selectors ─────────────────────────────────────────────────────────────────

/** SNR + Packet Loss + lastUpdated — SignalIntegrityPanel */
export function useSignalMetrics() {
  return useSignalStore(
    (s) => ({ snr: s.snr, packetLoss: s.packetLoss, lastUpdated: s.lastUpdated }),
    shallow,
  );
}

/** All signal fields — SystemStatus, MiniStat cards */
export function useSignalData() {
  return useSignalStore(
    (s) => ({
      snr:         s.snr,
      packetLoss:  s.packetLoss,
      packetRate:  s.packetRate,
      lastUpdated: s.lastUpdated,
      source:      s.source,
    }),
    shallow,
  );
}

/** Rolling history — SignalGraph */
export function useSignalHistory() {
  return useSignalStore((s) => s.history);
}
