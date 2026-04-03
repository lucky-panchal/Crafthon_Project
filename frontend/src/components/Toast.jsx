/**
 * src/components/Toast.jsx
 *
 * Lightweight toast system — no external library.
 *
 * Usage
 * ─────
 *   const toast = useToast();
 *   toast.error("Sync failed — rolled back");
 *   toast.success("Mode set to JAMMING");
 *   toast.warn("Backend unreachable");
 *
 * Mount <ToastContainer /> once at the app root (inside DefCommDashboard).
 * Toasts auto-dismiss after DURATION_MS. Max MAX_TOASTS shown at once.
 */

import { useState, useCallback, useRef, useEffect, createContext, useContext, useMemo } from "react";

const DURATION_MS = 3_500;
const MAX_TOASTS  = 4;

// ── Context ───────────────────────────────────────────────────────────────────

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const push = useCallback((message, variant = "info") => {
    const id = ++counterRef.current;
    setToasts((prev) =>
      [...prev, { id, message, variant, exiting: false }].slice(-MAX_TOASTS)
    );
    // Schedule removal
    setTimeout(() => {
      // Mark as exiting first (plays out animation)
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 220);
    }, DURATION_MS);
  }, []);

  const api = useMemo(() => ({
    success: (msg) => push(msg, "success"),
    error:   (msg) => push(msg, "error"),
    warn:    (msg) => push(msg, "warn"),
    info:    (msg) => push(msg, "info"),
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ── Visual config ─────────────────────────────────────────────────────────────

const VARIANT = {
  success: { icon: "✅", border: "border-green-500/40",  bg: "bg-green-500/10",  text: "text-green-300"  },
  error:   { icon: "⚠",  border: "border-red-500/40",    bg: "bg-red-500/10",    text: "text-red-300"    },
  warn:    { icon: "⚡",  border: "border-amber-500/40",  bg: "bg-amber-500/10",  text: "text-amber-300"  },
  info:    { icon: "ℹ",  border: "border-blue-500/40",   bg: "bg-blue-500/10",   text: "text-blue-300"   },
};

// ── Container ─────────────────────────────────────────────────────────────────

function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const v = VARIANT[t.variant] ?? VARIANT.info;
        return (
          <div
            key={t.id}
            className={[
              "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-xl",
              "text-xs font-medium max-w-xs backdrop-blur-sm",
              v.border, v.bg, v.text,
              t.exiting ? "toast-out" : "toast-in",
            ].join(" ")}
          >
            <span className="shrink-0">{v.icon}</span>
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
