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

const FIELD_ALIASES = {
  time: [
    "time", "timestamp", "datetime", "date", "eventtime", "recordedat",
  ],
  snr: [
    "snr", "snrdb", "signaltonoiseratio", "signaltonoise", "signalnoise",
  ],
  packetLoss: [
    "packetloss", "packetlosspct", "packetlosspercent", "losspct",
    "losspercentage", "losspercent", "loss", "pktloss", "droprate",
  ],
  packetRate: [
    "packetrate", "packetspersecond", "pps", "pktrate", "rate",
    "trafficrate", "throughput", "packets",
  ],
  sourceId: ["sourceid", "srcid", "deviceid"],
};

function normalizeKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).trim();
  if (!text || /^(n\/a|na|null|none|nan|undefined|unknown|--?)$/i.test(text)) return null;

  const compact = text.replace(/,/g, "");
  const direct = Number(compact);
  if (Number.isFinite(direct)) return direct;

  const match = compact.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAliasedValue(row, aliases, { numeric = true } = {}) {
  for (const [key, value] of Object.entries(row)) {
    if (!aliases.includes(normalizeKey(key))) continue;
    if (!numeric) return value;
    const parsed = parseNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function getNumericColumns(row) {
  return Object.entries(row)
    .map(([key, value]) => ({ key, value: parseNumber(value) }))
    .filter((entry) => entry.value !== null);
}

function inferRowFromNumbers(row) {
  const numericColumns = getNumericColumns(row).filter(({ key }) => {
    const normalized = normalizeKey(key);
    return !["id", "idx", "index", "row", "line", "year"].includes(normalized);
  });

  if (numericColumns.length === 0) return null;

  return {
    time: getAliasedValue(row, FIELD_ALIASES.time, { numeric: false }),
    snr: numericColumns[0]?.value ?? null,
    packetLoss: numericColumns[1]?.value ?? null,
    packetRate: numericColumns[2]?.value ?? null,
    source_id: getAliasedValue(row, FIELD_ALIASES.sourceId),
    _inferred: true,
  };
}

function toObjects(table) {
  if (!Array.isArray(table) || table.length < 2) return [];
  const [headerRow, ...bodyRows] = table;
  const headers = headerRow.map((cell) => String(cell ?? "").trim().replace(/^"|"$/g, ""));
  return bodyRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function parseDelimited(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return toObjects(rows);
}

function buildDatasetPoints(rows) {
  let pointIndex = 0;

  return rows
    .map((row) => {
      const extracted = extractRow(row);
      if (extracted.snr === null && extracted.packetLoss === null && extracted.packetRate === null) {
        return null;
      }

      const time = extracted.time == null || String(extracted.time).trim() === ""
        ? `T+${pointIndex}`
        : String(extracted.time);

      const point = {
        ...row,
        time,
        snr: extracted.snr ?? 25,
        packetLoss: extracted.packetLoss ?? 0,
        packetRate: extracted.packetRate ?? 0,
        _rowIndex: pointIndex,
      };

      if (extracted.source_id !== null) point.source_id = extracted.source_id;

      pointIndex += 1;
      return point;
    })
    .filter(Boolean);
}

function buildFallbackPoints(rows) {
  let pointIndex = 0;

  return rows
    .map((row) => {
      const inferred = inferRowFromNumbers(row);
      if (!inferred) return null;

      const point = {
        ...row,
        time: inferred.time == null || String(inferred.time).trim() === "" ? `T+${pointIndex}` : String(inferred.time),
        snr: inferred.snr ?? 25,
        packetLoss: inferred.packetLoss ?? 0,
        packetRate: inferred.packetRate ?? 0,
        _rowIndex: pointIndex,
        _inferred: true,
      };

      if (inferred.source_id !== null) point.source_id = inferred.source_id;

      pointIndex += 1;
      return point;
    })
    .filter(Boolean);
}

function extractRowsFromText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const values = Array.from(line.matchAll(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g), (match) => Number(match[0]));
      if (values.length === 0) return null;
      return {
        raw: line,
        snr: values[0] ?? 25,
        packetLoss: values[1] ?? 0,
        packetRate: values[2] ?? 0,
      };
    })
    .filter(Boolean);
}

function buildBaselinePoint(name, text = "") {
  return [{
    time: "T+0",
    snr: 25,
    packetLoss: 0,
    packetRate: 0,
    _rowIndex: 0,
    _fallback: true,
    _filename: name,
    raw: text.slice(0, 500),
  }];
}

// ── Dataset row parser ────────────────────────────────────────────────────────
// Tries to extract snr, packetLoss, packetRate from any row object.
function extractRow(row) {
  const numericColumns = getNumericColumns(row);

  let snr = getAliasedValue(row, FIELD_ALIASES.snr);
  let packetLoss = getAliasedValue(row, FIELD_ALIASES.packetLoss);
  let packetRate = getAliasedValue(row, FIELD_ALIASES.packetRate);

  if (snr === null && packetLoss === null && packetRate === null && numericColumns.length >= 3 && numericColumns.length <= 4) {
    [snr, packetLoss, packetRate] = numericColumns.slice(0, 3).map((entry) => entry.value);
  }

  return {
    time: getAliasedValue(row, FIELD_ALIASES.time, { numeric: false }),
    snr,
    packetLoss,
    packetRate,
    source_id: getAliasedValue(row, FIELD_ALIASES.sourceId),
  };
}

// ── CSV parser (no dependency) ────────────────────────────────────────────────
function parseCSV(text) {
  return parseDelimited(text, ",");
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
    return [{ time: "T+0", snr: 25, packetLoss: 0, packetRate: 0, _pkl: true, _filename: file.name }];
  }

  // Excel / ODS — use xlsx library for proper binary parsing
  if (EXCEL_EXTS.some((ext) => name.endsWith(ext))) {
    const rows = await parseExcel(file);
    const points = buildDatasetPoints(rows);
    return points.length > 0 ? points : buildFallbackPoints(rows).length > 0 ? buildFallbackPoints(rows) : buildBaselinePoint(file.name);
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

  let points = buildDatasetPoints(rows);
  if (points.length > 0) return points;

  points = buildFallbackPoints(rows);
  if (points.length > 0) return points;

  const textRows = extractRowsFromText(text);
  points = buildFallbackPoints(textRows);
  if (points.length > 0) return points;

  return buildBaselinePoint(file.name, text);
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
