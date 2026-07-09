import { endSessionAction, recordTrialAction } from "@/lib/session/actions";
import type { QueuedWrite, ReplayOutcome } from "./write-queue";

/**
 * Replays a queued write through the EXACT SAME server action it was recorded for — the offline
 * queue never forks the write path, it only defers the same call. `recordTrialAction`'s input
 * carries the client-generated `trialId` idempotency key, so a replay of a write that actually
 * already landed (response merely lost) is a safe no-op, not a duplicate.
 *
 * Server actions here never throw across the RSC boundary (see `ActionResult`) — they always
 * return a structured result. So a *returned* `error` means the server was reached and made a
 * deterministic decision (bad input, a business-rule rejection) that will fail identically on
 * every future replay of the same payload: non-retryable. A *thrown* error (network drop, fetch
 * failure reaching the server at all) is caught by `flushQueue` and treated as retryable.
 */
export async function replayWrite(write: QueuedWrite): Promise<ReplayOutcome> {
  const result =
    write.action === "recordTrial"
      ? await recordTrialAction(write.input)
      : await endSessionAction(write.input);
  if (result.error === null) return { ok: true };
  return { ok: false, retryable: false, reason: result.error };
}
