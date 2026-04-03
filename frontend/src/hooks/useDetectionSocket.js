/**
 * src/hooks/useDetectionSocket.js
 *
 * Connects to /ws/detection and fans out each frame to all four stores:
 *
 *   useAlertStore.pushFrame()        — alerts, logs, latestDetection
 *   useRiskStore.syncFromFrame()     — risk score + level + delta
 *   useSimulationStore.wsSync()      — simulation mode (user-lock aware)
 *   useConnectionStore.setStatus()   — WS lifecycle state
 *
 * Reconnect: exponential backoff 1 s → 30 s, max 10 retries.
 * Memory safety: unmounted ref guards all post-unmount writes.
 */

import { useEffect, useRef, useCallback } from "react";
import { createDetectionSocket } from "../services/socket";
import useAlertStore      from "../store/useAlertStore";
import useRiskStore       from "../store/useRiskStore";
import useSimulationStore from "../store/useSimulationStore";
import useConnectionStore from "../store/useConnectionStore";

const BASE_DELAY  = 1_000;
const MAX_DELAY   = 30_000;
const MAX_RETRIES = 10;

export function useDetectionSocket() {
  // Read actions once — store actions are stable references, never change
  const pushFrame     = useAlertStore.getState().pushFrame;
  const syncFromFrame = useRiskStore.getState().syncFromFrame;
  const wsSync        = useSimulationStore.getState().wsSync;
  const setStatus     = useConnectionStore.getState().setStatus;

  const socketRef  = useRef(null);
  const retryRef   = useRef(0);
  const retryTimer = useRef(null);
  const unmounted  = useRef(false);

  // ── Message handler ───────────────────────────────────────────────────────
  const handleMessage = useCallback((event) => {
    try {
      const frame = JSON.parse(event.data);

      pushFrame(frame);                          // → useAlertStore
      syncFromFrame(frame);                      // → useRiskStore
      if (frame.mode) wsSync(frame.mode);        // → useSimulationStore

    } catch {
      // malformed frame — skip silently
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ all deps are stable store action refs — no need to list them

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (unmounted.current) return;

    setStatus("connecting");
    const ws = createDetectionSocket();
    socketRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      retryRef.current = 0;
      setStatus("connected");
      console.log("[DetectionSocket] connected");
    };

    ws.onmessage = handleMessage;

    ws.onerror = () => {
      if (unmounted.current) return;
      setStatus("error");
      console.warn("[DetectionSocket] error");
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setStatus("disconnected");
      scheduleReconnect();
    };
  }, [handleMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconnect scheduler ───────────────────────────────────────────────────
  const scheduleReconnect = useCallback(() => {
    if (unmounted.current) return;
    if (retryRef.current >= MAX_RETRIES) {
      setStatus("error");
      return;
    }
    const delay = Math.min(BASE_DELAY * 2 ** retryRef.current, MAX_DELAY);
    retryRef.current += 1;
    console.log(`[DetectionSocket] reconnect in ${delay}ms (attempt ${retryRef.current})`);
    retryTimer.current = setTimeout(() => {
      if (!unmounted.current) connect();
    }, delay);
  }, [connect]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      clearTimeout(retryTimer.current);
      socketRef.current?.close();
      console.log("[DetectionSocket] unmounted — socket closed");
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
