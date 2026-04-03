import { useState, useEffect, useRef, useCallback } from "react";

const MAX_POINTS = 20;

/** @returns {number} integer in [min, max] */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
 * Streams simulated RF signal data every `interval` ms.
 *
 * @param {number} [interval=1000]
 * @returns {{
 *   history:    Array<{ time: string, packetRate: number, snr: number }>,
 *   latest:     { time: string, packetRate: number, snr: number } | null,
 *   status:     "normal" | "warning" | "critical",
 *   lastUpdated: string,
 * }}
 */
export function useRealtimeData(interval = 1000) {
  const bufferRef = useRef(/** @type {Array<{ time: string, packetRate: number, snr: number }>} */ ([]));
  const [history, setHistory] = useState([]);

  const tick = useCallback(() => {
    const point = {
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      packetRate: randInt(100, 200),
      snr: randInt(20, 35),
    };
    bufferRef.current = [...bufferRef.current.slice(-(MAX_POINTS - 1)), point];
    setHistory([...bufferRef.current]);
  }, []);

  useEffect(() => {
    tick(); // populate immediately — no blank first render
    const id = setInterval(tick, interval);
    return () => clearInterval(id); // no memory leak
  }, [tick, interval]);

  const latest = history[history.length - 1] ?? null;
  const status = deriveStatus(latest?.snr ?? 99);
  const lastUpdated = latest?.time ?? "--";

  return { history, latest, status, lastUpdated };
}
