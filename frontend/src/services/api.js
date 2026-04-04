/**
 * src/services/api.js
 *
 * HTTP API service layer for the DefComm Shield backend.
 *
 * Design
 * ──────
 * All requests go through `apiFetch` — a thin wrapper around `fetch` that:
 *   • Adds Content-Type and Accept headers
 *   • Enforces a configurable timeout (default 5 s) via AbortController
 *   • Parses the response body as JSON
 *   • Throws a typed `ApiError` on any non-2xx status or network failure
 *
 * Callers receive either the parsed response object or a thrown `ApiError`.
 * They never need to inspect `response.ok` themselves.
 *
 * Exports
 * ───────
 *   ApiError              — typed error class with status + detail fields
 *   setSimulationMode(mode) → Promise<{ mode: string }>
 *   getSimulationMode()     → Promise<{ mode: string }>
 */

const BASE_URL     = "http://localhost:8000";
const TIMEOUT_MS   = 1_500;
const MAX_ANALYSIS_ROWS = 2_000;

// ── Typed error ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  /**
   * @param {string}  message   — human-readable summary
   * @param {number}  status    — HTTP status code (0 = network/timeout error)
   * @param {string}  detail    — raw detail from the backend error body
   */
  constructor(message, status = 0, detail = "") {
    super(message);
    this.name   = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

/**
 * @template T
 * @param {string} path               — relative path, e.g. "/set-mode"
 * @param {RequestInit} [options]     — standard fetch options
 * @param {number} [timeoutMs]        — abort after this many ms
 * @returns {Promise<T>}
 * @throws {ApiError}
 */
async function apiFetch(path, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  const url = `${BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        ...options.headers,
      },
    });

    // Parse body regardless of status — backend may include error detail
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const detail  = body?.detail ?? body?.message ?? "";
      const message = `API error ${response.status}: ${detail || response.statusText}`;
      throw new ApiError(message, response.status, String(detail));
    }

    return /** @type {T} */ (body);

  } catch (err) {
    if (err instanceof ApiError) throw err;

    // AbortController fired — timeout
    if (err.name === "AbortError") {
      throw new ApiError(
        `Request to ${path} timed out after ${timeoutMs}ms`,
        0,
        "timeout",
      );
    }

    // Network failure (no connection, CORS, etc.)
    throw new ApiError(
      `Network error reaching ${url}: ${err.message}`,
      0,
      "network_error",
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Simulation mode endpoints ─────────────────────────────────────────────────

/**
 * POST /set-mode
 * Switch the backend simulation scenario.
 *
 * @param {"NORMAL"|"JAMMING"|"SPOOFING"|"normal"|"jamming"|"spoofing"} mode
 * @returns {Promise<{ mode: string }>}
 * @throws {ApiError}
 *
 * @example
 * const { mode } = await setSimulationMode("JAMMING");
 * console.log(mode); // "jamming"
 */
export async function setSimulationMode(mode) {
  return apiFetch("/set-mode", {
    method: "POST",
    body:   JSON.stringify({ mode }),
  });
}

/**
 * GET /mode
 * Fetch the current simulation mode from the backend.
 *
 * @returns {Promise<{ mode: string }>}
 * @throws {ApiError}
 */
export async function getSimulationMode() {
  return apiFetch("/mode");
}

/**
 * POST /analyse
 * Send parsed dataset rows to backend for threat analysis.
 * Uses a long timeout (60s) since datasets can be large.
 */
export async function analyseDataset(rows, filename) {
  const prepared = prepareRowsForAnalysis(rows);
  return apiFetch("/analyse", {
    method: "POST",
    body:   JSON.stringify({
      rows: prepared.rows,
      filename,
      original_total: prepared.originalTotal,
    }),
  }, 60_000);
}

function slimRow(row) {
  return {
    time: row.time,
    snr: row.snr,
    packetLoss: row.packetLoss ?? row.packet_loss,
    packetRate: row.packetRate ?? row.packet_rate,
    source_id: row.source_id,
  };
}

function sampleRows(rows, maxRows) {
  if (rows.length <= maxRows) return rows;
  if (maxRows <= 1) return [rows[0]];

  const sampled = [];
  const step = (rows.length - 1) / (maxRows - 1);

  for (let i = 0; i < maxRows; i += 1) {
    sampled.push(rows[Math.round(i * step)]);
  }

  return sampled;
}

function prepareRowsForAnalysis(rows) {
  const canonical = rows.map(slimRow);
  return {
    rows: sampleRows(canonical, MAX_ANALYSIS_ROWS),
    originalTotal: rows.length,
  };
}

/**
 * GET /detection/latest
 * Fetch the current detection state snapshot from the backend.
 */
export async function fetchLatestDetection() {
  return apiFetch("/detection/latest", {}, 5_000);
}
