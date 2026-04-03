// Native WebSocket factory for the DefComm telemetry stream.
//
// Why a factory (not a module-level singleton)?
// React 18 StrictMode mounts every component twice in dev.
// A module-level singleton would be shared across both mounts,
// causing the second mount to receive a half-open socket.
// Returning a fresh instance per hook call is the safe pattern.

const WS_TELEMETRY  = "ws://localhost:8000/ws/telemetry";
const WS_DETECTION  = "ws://localhost:8000/ws/detection";

/** Raw telemetry stream — packet_rate, snr, packet_loss every second. */
export function createTelemetrySocket() {
  return new WebSocket(WS_TELEMETRY);
}

/** Hybrid detection stream — status, type, confidence, risk, reason every second. */
export function createDetectionSocket() {
  return new WebSocket(WS_DETECTION);
}

export { WS_TELEMETRY as WS_URL, WS_DETECTION };
