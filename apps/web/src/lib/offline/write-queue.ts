/**
 * Durable write queue — pure orchestration over an injected `QueueStore` (mirrors the SR engine's
 * injected-clock pattern: no browser API here, so this is testable with an in-memory store).
 *
 * A `QueuedWrite` stores nothing but the server action name + its exact input — the minimal
 * payload needed to replay the write later (data minimization; no derived/extra patient data).
 */
export interface QueuedWrite {
  id: string;
  action: "recordTrial" | "endSession";
  /** The exact, unchanged argument the server action expects — replay never forks the payload. */
  input: unknown;
  enqueuedAt: number;
}

/** Storage port. The browser adapter is IndexedDB-backed; tests use an in-memory implementation. */
export interface QueueStore {
  list(): Promise<QueuedWrite[]>;
  put(write: QueuedWrite): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * Online-first save: try the network now; only touch the durable queue on failure. This keeps
 * online behavior byte-for-byte the same as before the queue existed — `tryNetwork` is called
 * exactly once and its result is trusted (a throw counts as failure, not a crash).
 */
export async function saveOrQueue(
  store: QueueStore,
  write: QueuedWrite,
  tryNetwork: () => Promise<boolean>,
): Promise<boolean> {
  let ok: boolean;
  try {
    ok = await tryNetwork();
  } catch {
    ok = false;
  }
  if (!ok) await store.put(write);
  return ok;
}

/**
 * Replays every queued write in enqueue order (oldest first) and stops at the first failure —
 * trials mutate the session's snapshot in place, so a later write must never land before an
 * earlier one is confirmed. Successfully replayed writes are removed from the store; the rest
 * stay queued for the next reconnect/retry.
 */
export async function flushQueue(
  store: QueueStore,
  replay: (write: QueuedWrite) => Promise<boolean>,
): Promise<QueuedWrite[]> {
  const pending = [...(await store.list())].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  for (const write of pending) {
    let ok: boolean;
    try {
      ok = await replay(write);
    } catch {
      ok = false;
    }
    if (!ok) break;
    await store.remove(write.id);
  }
  return store.list();
}
