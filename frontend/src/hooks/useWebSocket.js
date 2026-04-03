/**
 * src/hooks/useWebSocket.js
 *
 * Connects to /ws/telemetry.
 * On every frame:
 *   - Maintains rolling 20-point history for the chart
 *   - Calls useSignalStore.setSignalData() with camelCase-normalised fields
 *
 * Fallback:
 *   - On disconnect / error → useSignalStore.startFallback()
 *   - On connect / first valid frame → useSignalStore.stopFallback()
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createTelemetrySocket } from "../services/socket";
import useSignalStore from "../store/useSignalStore";

const MAX_POINTS  = 20;
const BASE_DELAY  = 1_000;
const MAX_DELAY   = 30_000;
const MAX_RETRIES = 10;

export function deriveStatus(snr) {
  if (snr < 15) return "critical";
  if (snr < 20) return "warning";
  return "normal";
}

export function useWebSocket() {
  const bufferRef  = useRef([]);
  const socketRef  = useRef(null);
  const retryRef   = useRef(0);
  const retryTimer = useRef(null);
  const unmounted  = useRef(false);

  const [history,    setHistory]    = useState([]);
  const [connStatus, setConnStatus] = useState("connecting");

  // ── Normalise raw frame → camelCase + chart point ─────────────────────────
  const handleMessage = useCallback((event) => {
    try {
      const raw = JSON.parse(event.data);

      // Normalise snake_case → camelCase for the store
      const point = {
        time:       raw.time       ?? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        snr:        raw.snr,
        packetRate: raw.packetRate ?? raw.packet_rate,
        packetLoss: raw.packetLoss ?? raw.packet_loss,
      };

      // Chart history
      bufferRef.current = [...bufferRef.current.slice(-(MAX_POINTS - 1)), point];
      if (!unmounted.current) setHistory([...bufferRef.current]);

      // Signal store — also stops fallback on first valid frame
      useSignalStore.getState().setSignalData(point);

    } catch {
      // Malformed frame — skip silently
    }
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (unmounted.current) return;

    setConnStatus("connecting");
    const ws = createTelemetrySocket();
    socketRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      retryRef.current = 0;
      setConnStatus("connected");
      // Stop fallback — real data is flowing
      useSignalStore.getState().stopFallback();
    };

    ws.onmessage = handleMessage;

    ws.onerror = () => {
      if (unmounted.current) return;
      setConnStatus("error");
      // Start fallback so the panel never goes stale
      useSignalStore.getState().startFallback();
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setConnStatus("disconnected");
      // Start fallback while reconnecting
      useSignalStore.getState().startFallback();
      scheduleReconnect();
    };
  }, [handleMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconnect scheduler ───────────────────────────────────────────────────
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
    // Start fallback immediately — stops automatically on first WS frame
    useSignalStore.getState().startFallback();
    connect();

    return () => {
      unmounted.current = true;
      clearTimeout(retryTimer.current);
      socketRef.current?.close();
      useSignalStore.getState().stopFallback();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ────────────────────────────────────────────────────────
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
