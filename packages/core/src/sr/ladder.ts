import type { SrConfig } from "./config";

/** Next rung after a successful recall: ×growthFactor, capped at maxIntervalSec. */
export function nextIntervalSec(currentSec: number, config: SrConfig): number {
  return Math.min(currentSec * config.growthFactor, config.maxIntervalSec);
}

/**
 * Rung after a confirmed miss: revert to the last SUCCESSFUL interval, never to zero;
 * with no prior success, the base interval.
 */
export function resetIntervalSec(lastSuccessSec: number | null, config: SrConfig): number {
  return lastSuccessSec ?? config.baseIntervalSec;
}

/** Success at (or above) the ceiling ends within-session work → between-session handoff. */
export function isAtCeiling(intervalSec: number, config: SrConfig): boolean {
  return intervalSec >= config.maxIntervalSec;
}
