import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createTelemetrySocket } from "../services/socket";

const MAX_POINTS   = 20;
const BASE_DELAY   = 1_000;   // ms — first retry wait
const MAX_DELAY    = 30_000;  // ms — cap backoff at 30 s
const MAX_RETRIES  = 10;      // give up after this many consecutive failures

/**
 * @param {number} snr
 * @returns {"normal" | "warning" | "critical"}
 */
export function deriveStatus(snr) {
  if (snr < 15) return "critical";
  if (snr < 20) return "warning";
  return "normal";
}

/**
 * Connects to the backend WebSocket telemetry stream.
 * Automatically reconnects with exponential backoff on disconnect/error.
 * Clears all timers and closes the socket on unmount — no memory leaks.
 *
 * @returns {{
 *   history:     Array<{ time: string, packetRate: number, snr: number, packetLoss: number }>,
 *   latest:      { time: string, packetRate: number, snr: number, packetLoss: number } | null,
 *   status:      "normal" | "warning" | "critical",
 *   connStatus:  "connecting" | "connected" | "disconnected" | "error",
 *   lastUpdated: string,
 * }}
 */
export function useWebSocket() {
  // ── Refs — mutations never trigger re-renders ─────────────────────────────
  const bufferRef   = useRef([]);          // rolling data buffer
  const socketRef   = useRef(null);        // active WebSocket instance
  const retryRef    = useRef(0);           // consecutive failure count
  const retryTimer  = useRef(null);        // setTimeout handle for reconnect
  const unmounted   = useRef(false);       // guard against post-unmount setState

  // ── State — only what the UI actually needs ───────────────────────────────
  const [history,    setHistory]    = useState([]);
  const [connStatus, setConnStatus] = useState("connecting");

  // ── Message handler — stable ref, never recreated ────────────────────────
  const handleMessage = useCallback((event) => {
    try {
      const point = JSON.parse(event.data);
      bufferRef.current = [
        ...bufferRef.current.slice(-(MAX_POINTS - 1)),
        point,
      ];
      if (!unmounted.current) setHistory([...bufferRef.current]);
    } catch {
      // Malformed frame — skip silently
    }
  }, []);

  // ── Connect — creates socket, wires all handlers ──────────────────────────
  const connect = useCallback(() => {
    if (unmounted.current) return;

    setConnStatus("connecting");
    const ws = createTelemetrySocket();
    socketRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      retryRef.current = 0;           // reset backoff on successful connect
      setConnStatus("connected");
    };

    ws.onmessage = handleMessage;

    ws.onerror = () => {
      if (unmounted.current) return;
      setConnStatus("error");
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setConnStatus("disconnected");
      scheduleReconnect();
    };
  }, [handleMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconnect scheduler — exponential backoff ─────────────────────────────
  const scheduleReconnect = useCallback(() => {
    if (unmounted.current) return;
    if (retryRef.current >= MAX_RETRIES) {
      setConnStatus("error");
      return;
    }

    const delay = Math.min(BASE_DELAY * 2 ** retryRef.current, MAX_DELAY);
    retryRef.current += 1;

    retryTimer.current = setTimeout(() => {
      if (!unmounted.current) connect();
    }, delay);
  }, [connect]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      clearTimeout(retryTimer.current);
      socketRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ intentionally empty — connect/scheduleReconnect are stable callbacks

  // ── Derived values — memoised so downstream components don't re-render ────
  const latest = useMemo(
    () => history[history.length - 1] ?? null,
    [history],
  );

  const status = useMemo(
    () => deriveStatus(latest?.snr ?? 99),
    [latest?.snr],
  );

  const lastUpdated = latest?.time ?? "--";

  return { history, latest, status, connStatus, lastUpdated };
}
