import { endSessionAction, recordTrialAction } from "@/lib/session/actions";
import type { QueuedWrite } from "./write-queue";

/**
 * Replays a queued write through the EXACT SAME server action it was recorded for — the offline
 * queue never forks the write path, it only defers the same call. `recordTrialAction`'s input
 * carries the client-generated `trialId` idempotency key, so a replay of a write that actually
 * already landed (response merely lost) is a safe no-op, not a duplicate.
 */
export async function replayWrite(write: QueuedWrite): Promise<boolean> {
  const result =
    write.action === "recordTrial"
      ? await recordTrialAction(write.input)
      : await endSessionAction(write.input);
  return result.error === null;
}
