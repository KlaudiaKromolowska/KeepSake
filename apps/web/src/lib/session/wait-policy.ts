import { type SrConfig, scaleWaitMs } from "@keepsake/core/sr";

/** Waits at or below this many seconds always play in real time — only longer gaps compress. */
export const REALTIME_MAX_SEC = 60;

/** Wall-clock ms for a distractor wait, per the demo compression profile (PLAN §8b). */
export function demoWaitMs(intervalSec: number, demoSpeed: number): number {
  const realMs = intervalSec * 1000;
  return intervalSec <= REALTIME_MAX_SEC ? realMs : scaleWaitMs(realMs, demoSpeed);
}

/** The full doubling/halving ladder for a config, base → max, rounded ints, deduped. */
export function ladderRungs(config: SrConfig): number[] {
  const rungs: number[] = [];
  for (let sec = config.baseIntervalSec; sec < config.maxIntervalSec; sec *= config.growthFactor) {
    const r = Math.round(sec);
    if (rungs.at(-1) !== r) rungs.push(r);
  }
  if (rungs.at(-1) !== config.maxIntervalSec) rungs.push(config.maxIntervalSec);
  return rungs;
}
