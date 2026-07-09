"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActionResult } from "@/lib/actions";
import { replayWrite } from "./replay";
import { getQueueStore } from "./store";
import { flushQueue, type QueuedWrite, saveOrQueue } from "./write-queue";

export interface OfflineQueueHandle {
  /** Writes durably queued right now, still awaiting a successful replay. */
  pendingCount: number;
  /** Try the write over the network now; on failure, durably queue it for later replay. */
  save: (write: QueuedWrite, fn: () => Promise<ActionResult<null>>) => Promise<boolean>;
  /** Re-attempt every queued write now, oldest first (manual retry button + auto reconnect). */
  retry: () => Promise<void>;
}

/**
 * Durable, online-first write queue for the kiosk session (V3 — never lose a trial). A write is
 * always attempted over the network first — the online path is unchanged; a failure (offline,
 * flaky Wi-Fi) queues it in IndexedDB and it's replayed automatically when the tab regains
 * connectivity, through the exact same server action, oldest-first.
 */
export function useOfflineQueue(): OfflineQueueHandle {
  const [pendingCount, setPendingCount] = useState(0);
  const store = getQueueStore();

  const refreshCount = useCallback(async () => {
    setPendingCount((await store.list()).length);
  }, [store]);

  const retry = useCallback(async () => {
    await flushQueue(store, replayWrite);
    await refreshCount();
  }, [store, refreshCount]);

  useEffect(() => {
    void retry(); // pick up anything left queued from a previous tab/session
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  const save = useCallback(
    async (write: QueuedWrite, fn: () => Promise<ActionResult<null>>) => {
      const ok = await saveOrQueue(store, write, async () => (await fn()).error === null);
      await refreshCount();
      return ok;
    },
    [store, refreshCount],
  );

  return { pendingCount, save, retry };
}
