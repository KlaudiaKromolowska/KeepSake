import type { Etiology, Outcome } from "../sr/types";
import type { Rng } from "./rng";

/**
 * A deliberately simple, illustrative forgetting-and-consolidation model — NOT a validated
 * clinical model of memory in dementia. It exists to give the in-silico simulation something
 * non-trivial to react to (recall gets harder as time passes, easier as an item gets practiced),
 * so the engine's scheduling logic has real dynamics to be exercised against. Full assumptions
 * and honest limitations are documented in docs/simulation/README.md — read that before citing
 * any number this model produces.
 *
 * Mechanics, in one paragraph: each target has a hidden "strength" (seconds) that behaves like a
 * half-life — recall probability decays exponentially with elapsed time relative to strength.
 * A successful recall at a given elapsed time is evidence the trace survives at least that long,
 * so strength grows toward (a multiple of) the tested interval (the textbook "spacing effect").
 * A miss shrinks strength back down, floored so it never collapses to zero. A patient-level
 * "ability" parameter and an etiology-level "decay multiplier" scale both directions.
 */

export interface MemoryState {
  strengthSec: number;
}

/** Recall probability is clamped away from 0/1 — real responses are never fully deterministic. */
const P_FLOOR = 0.02;
const P_CEILING = 0.98;

/** Untrained baseline strength, seconds. Calibrated so the Brush & Camp screen (0/15/30s) is a
 *  meaningful gate rather than a near-universal pass or fail: at ability 0.5 this puts the 15s
 *  level around a 50/50 single-attempt recall chance, with 3 attempts per level giving most
 *  mid-ability patients a real shot at passing while still failing the more severely impaired. */
const BASE_STRENGTH_SEC = 24;

/** Never below this even after a string of misses — a floor, not a clinical claim. */
const STRENGTH_FLOOR_SEC = 5;

/** Flat probability of an ambiguous "unclear" response, independent of the true recall draw.
 *  Simplification: real unclear responses likely correlate with word-finding difficulty /
 *  etiology, which this model does not attempt to capture (see docs/simulation/README.md). */
export const UNCLEAR_PROB = 0.06;

// Etiology-specific decay multiplier applied to strength (higher = forgets faster). Mirrors the
// same "DLB/PD forget faster" rationale already encoded in `defaultsForEtiology` (etiology.ts) —
// these numbers are illustrative, not fitted to any dataset (no head-to-head trial exists).
const ETIOLOGY_DECAY_MULTIPLIER: Record<Etiology, number> = {
  alzheimers: 1.0,
  vascular: 1.0,
  lewy: 1.3,
  parkinsons: 1.3,
  mixed: 1.15,
  unspecified: 1.0,
};

export function etiologyDecayMultiplier(etiology: Etiology): number {
  return ETIOLOGY_DECAY_MULTIPLIER[etiology];
}

/** Strength before any practice has occurred (used for the candidacy screen too). */
export function initialStrengthSec(ability: number, etiology: Etiology): MemoryState {
  const strengthSec = (BASE_STRENGTH_SEC * (0.4 + ability)) / etiologyDecayMultiplier(etiology);
  return { strengthSec: Math.max(strengthSec, STRENGTH_FLOOR_SEC) };
}

/** Probability of a true recall given elapsed seconds since the last exposure. */
export function recallProbability(memory: MemoryState, elapsedSec: number): number {
  const p = Math.exp(-Math.max(elapsedSec, 0) / memory.strengthSec);
  return Math.min(P_CEILING, Math.max(P_FLOOR, p));
}

/** Consolidation on a successful recall: strength grows toward the (ability-scaled) tested gap. */
export function growAfterSuccess(
  memory: MemoryState,
  testedElapsedSec: number,
  ability: number,
): MemoryState {
  const growth = 1.15 + 0.5 * ability;
  const strengthSec = Math.max(memory.strengthSec, testedElapsedSec) * growth;
  return { strengthSec };
}

/**
 * Consolidation on a device-delivered errorless correction (miss -> shown the answer -> patient
 * repeats). This is a real, assisted exposure, not a null event — the whole rationale for
 * errorless correction over letting a patient struggle (PLAN.md) is that repetition-without-
 * failure still builds the trace, just more gently than an unaided recall success. Smaller and
 * elapsed-independent (the correction always happens at ~0 delay).
 */
export function growAfterCorrection(memory: MemoryState, ability: number): MemoryState {
  const growth = 1.05 + 0.15 * ability;
  return { strengthSec: memory.strengthSec * growth };
}

/** Decay on a confirmed miss: strength shrinks, floored so it never collapses to zero. */
export function shrinkAfterFailure(memory: MemoryState, ability: number): MemoryState {
  const retained = 0.55 + 0.25 * ability;
  return { strengthSec: Math.max(memory.strengthSec * retained, STRENGTH_FLOOR_SEC) };
}

/** Draws one probe outcome: an independent "unclear" chance, else a recall/miss coin flip. */
export function drawOutcome(rng: Rng, memory: MemoryState, elapsedSec: number): Outcome {
  if (rng.bool(UNCLEAR_PROB)) return "unclear";
  return rng.bool(recallProbability(memory, elapsedSec)) ? "recall" : "miss";
}
