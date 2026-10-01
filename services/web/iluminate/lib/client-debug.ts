"use client";

type ClientDebugEntry = {
  at: string;
  event: string;
  details?: Record<string, unknown>;
};

const pending: ClientDebugEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function recordClientDebug(event: string, details?: Record<string, unknown>) {
  pending.push({ at: new Date().toISOString(), event, details });
  if (pending.length > 100) pending.splice(0, pending.length - 100);
  if (!flushTimer) flushTimer = setTimeout(() => void flushClientDebug(), 400);
}

export function installClientDebugHandlers() {
  const handleError = (event: ErrorEvent) => {
    recordClientDebug("window_error", {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined
    });
    void flushClientDebug();
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    recordClientDebug("unhandled_rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined
    });
    void flushClientDebug();
  };
  const handleVisibility = () => {
    if (document.visibilityState === "hidden") void flushClientDebug();
  };
  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);
  document.addEventListener("visibilitychange", handleVisibility);
  recordClientDebug("debug_session_started", { path: window.location.pathname });
  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

async function flushClientDebug() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!pending.length) return;
  const entries = pending.splice(0, pending.length);
  try {
    const response = await fetch("/api/debug/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
      keepalive: true
    });
    if (!response.ok) throw new Error(`debug log HTTP ${response.status}`);
  } catch {
    pending.unshift(...entries.slice(-100));
  }
}
