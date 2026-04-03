/**
 * src/hooks/useDetectionSocket.js
 *
 * Connects to /ws/detection and fans out each frame to all four stores.
 *
 * Alert logic
 * ───────────
 *   - Only calls addAlert() when frame.type is set and !== "NONE"
 *   - Timestamp is generated on the frontend (new Date().toISOString())
 *   - Duplicate suppression: same type+risk combo ignored within DEDUP_WINDOW (2 s)
 *
 * Store fan-out per frame
 * ───────────────────────
 *   useAlertStore.pushFrame()       — latestDetection + logs (every frame)
 *   useAlertStore.addAlert()        — alerts list (only when type !== "NONE" + dedup pass)
 *   useRiskStore.syncFromFrame()    — risk score / level / delta
 *   useSimulationStore.wsSync()     — simulation mode (user-lock aware)
 *   useConnectionStore.setStatus()  — WS lifecycle state
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

const BASE_DELAY   = 1_000;
const MAX_DELAY    = 30_000;
const MAX_RETRIES  = 10;
const DEDUP_WINDOW = 2_000; // ms — ignore same type+risk within this window

export function useDetectionSocket() {
  // Store actions — stable references, read once at hook init
  const pushFrame     = useAlertStore.getState().pushFrame;
  const addAlert      = useAlertStore.getState().addAlert;
  const syncFromFrame = useRiskStore.getState().syncFromFrame;
  const wsSync        = useSimulationStore.getState().wsSync;
  const setStatus     = useConnectionStore.getState().setStatus;

  const socketRef  = useRef(null);
  const retryRef   = useRef(0);
  const retryTimer = useRef(null);
  const unmounted  = useRef(false);

  // Dedup tracker — key: "TYPE:RISK", value: last accepted ms timestamp
  const dedupRef = useRef({});

  // ── Dedup check ───────────────────────────────────────────────────────────
  // Returns true (skip) if the same type+risk was accepted within DEDUP_WINDOW.
  // Writes the current timestamp when the alert is accepted (returns false).
  const isDuplicate = useCallback((type, risk) => {
    const key  = `${type}:${risk}`;
    const now  = Date.now();
    const last = dedupRef.current[key] ?? 0;
    if (now - last < DEDUP_WINDOW) {
      console.log(`[DetectionSocket] dedup  key=${key}  age=${now - last}ms — skipped`);
      return true;
    }
    dedupRef.current[key] = now;
    return false;
  }, []);

  // ── Message handler ───────────────────────────────────────────────────────
  const handleMessage = useCallback((event) => {
    try {
      const frame = JSON.parse(event.data);

      // 1. Always sync risk score and simulation mode
      syncFromFrame(frame);
      if (frame.mode) wsSync(frame.mode);

      // 2. Always push to frame log (updates latestDetection + logs)
      pushFrame(frame);

      // 3. Alert gate — only when type is present and meaningful
      const type = frame.type ?? "";
      if (type && type !== "NONE") {
        const risk = frame.risk ?? "LOW";

        if (!isDuplicate(type, risk)) {
          addAlert({
            type,
            reason:     frame.reason     ?? "",
            confidence: frame.confidence ?? 0,
            risk,
            timestamp:  new Date().toISOString(), // always frontend-generated
            source:     frame.source ?? "none",
            status:     frame.status,
          });
        }
      }

    } catch {
      // malformed frame — skip silently
    }
  }, [isDuplicate]); // eslint-disable-line react-hooks/exhaustive-deps

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
