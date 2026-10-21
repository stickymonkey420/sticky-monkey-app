"use client";

import { useEffect } from "react";

// Registers /sw.js (production only -- a worker in `next dev` caches stale
// chunks and fights HMR). Renders nothing.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Non-fatal: the site works the same without the worker.
    });
  }, []);
  return null;
}
