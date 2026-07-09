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

/** A write that failed deterministically on replay — kept for inspection, never retried again. */
export interface DeadLetteredWrite extends QueuedWrite {
  /** Short, non-patient-data reason (a validation message or generic server error string). */
  reason: string;
}

/** Storage port. The browser adapter is IndexedDB-backed; tests use an in-memory implementation. */
export interface QueueStore {
  list(): Promise<QueuedWrite[]>;
  put(write: QueuedWrite): Promise<void>;
  remove(id: string): Promise<void>;
  /**
   * Move a write out of the pending queue into the dead-letter list. Used for writes that fail
   * deterministically on replay (a structured server rejection, not a network drop) — kept so
   * the data isn't silently lost, but no longer replayed or able to block the queue.
   */
  deadLetter(write: QueuedWrite, reason: string): Promise<void>;
  listDeadLetters(): Promise<DeadLetteredWrite[]>;
}

/**
 * Result of attempting to replay one queued write.
 * - `retryable: true` (or a thrown error) means a transient/network failure — the write stays
 *   queued and the flush stops here so later writes replay only after this one succeeds.
 * - `retryable: false` means the server was reached and deterministically rejected the write
 *   (e.g. a validation error); replaying the identical payload will fail the same way every time,
 *   so it must not be allowed to block every write queued after it.
 */
export type ReplayOutcome = { ok: true } | { ok: false; retryable: boolean; reason?: string };

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
 * Replays every queued write in enqueue order (oldest first) and stops at the first *retryable*
 * failure — trials mutate the session's snapshot in place, so a later write must never land
 * before an earlier one is confirmed. A *non-retryable* failure (a deterministic server
 * rejection) is dead-lettered instead of blocking the queue: it can never succeed on replay, so
 * head-of-line blocking on it would stall every later trial forever. Successfully replayed writes
 * are removed from the store; retryable failures (and everything after them) stay queued for the
 * next reconnect/retry.
 */
export async function flushQueue(
  store: QueueStore,
  replay: (write: QueuedWrite) => Promise<ReplayOutcome>,
): Promise<QueuedWrite[]> {
  const pending = [...(await store.list())].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  for (const write of pending) {
    let outcome: ReplayOutcome;
    try {
      outcome = await replay(write);
    } catch {
      // A throw means the server was never reached (offline, fetch failure) — always retryable.
      outcome = { ok: false, retryable: true };
    }
    if (outcome.ok) {
      await store.remove(write.id);
      continue;
    }
    if (!outcome.retryable) {
      await store.deadLetter(write, outcome.reason ?? "non-retryable replay failure");
      continue;
    }
    break;
  }
  return store.list();
}
