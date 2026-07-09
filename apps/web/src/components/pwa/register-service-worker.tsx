"use client";

import { useEffect } from "react";

/**
 * Registers the shell/static-asset service worker (PWA installability, V3). No-op on browsers
 * without support, and never blocks rendering — registration happens fire-and-forget after mount.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort: a failed SW registration must never break the kiosk session.
    });
  }, []);
  return null;
}
