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
const TIMEOUT_MS   = 5_000;

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
