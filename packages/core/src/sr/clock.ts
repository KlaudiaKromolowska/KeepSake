/** Time source for orchestration code. The system implementation lives in apps/web, never here. */
export interface Clock {
  /** epoch ms */
  now(): number;
}

/** Deterministic clock for tests and fixtures. */
export function fixedClock(atMs: number): Clock {
  return { now: () => atMs };
}
