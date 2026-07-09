import type { SessionState } from "@keepsake/core/sr";
import type { CapsuleKind } from "./capsule-file";

/**
 * The kiosk-side memory-capsule reward: pure decision logic, no React, no clock — so the "reward
 * fires only on a genuine recall" rule is unit-testable in isolation and the SR engine
 * (packages/core) is never touched. The reward is a UI layer that renders AFTER an outcome is
 * recorded; nothing here can alter ladder/scheduler progression.
 */

/** A capsule the kiosk can render — a signed URL resolved server-side at session entry. */
export interface Capsule {
  id: string;
  kind: CapsuleKind;
  caption: string | null;
  /** Short-lived signed URL minted server-side on the RLS user client. */
  url: string;
}

/**
 * True iff the transition `prev -> next` just recorded a GENUINE correct recall — the only outcome
 * that earns a reward. Deliberately excludes:
 *   - misses and unclears (never a reward — the capsule is never a punishment or a consolation),
 *   - the errorless-correction / teach / end-on-win repeats (recorded `corrected: true`),
 *   - screening trials.
 * A reward is a warm reinforcement of a real retrieval, nothing else.
 */
export function isRewardableRecall(prev: SessionState, next: SessionState): boolean {
  if (next.trials.length <= prev.trials.length) return false; // no new trial this transition
  const trial = next.trials[next.trials.length - 1];
  if (!trial) return false;
  return trial.outcome === "recall" && !trial.corrected && !trial.isScreening;
}

/**
 * Pick which capsule to show for the `n`-th reward (0-based). Deterministic rotation through the
 * curated set — reproducible in tests and demo takes (no RNG), and it cycles so repeated recalls in
 * one session don't always replay the same photo. Null when the patient has no capsules (graceful
 * absence: the session runs exactly as it does today).
 */
export function selectCapsule(capsules: readonly Capsule[], rewardIndex: number): Capsule | null {
  if (capsules.length === 0) return null;
  const i = ((rewardIndex % capsules.length) + capsules.length) % capsules.length; // safe for any int
  return capsules[i] ?? null;
}
