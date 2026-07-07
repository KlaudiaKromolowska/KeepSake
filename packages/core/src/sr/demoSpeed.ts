/**
 * Scale a real wall-clock wait for demo playback. DEMO_SPEED compresses ONLY the wait at the
 * orchestration boundary — persisted intervals/trials are always real (PLAN §8b).
 *
 * A bad env var must never break a session: any speed that is non-finite or `<= 1` behaves as 1×.
 */
export function scaleWaitMs(realWaitMs: number, demoSpeed: number): number {
  if (!Number.isFinite(demoSpeed) || demoSpeed <= 1) return realWaitMs;
  return realWaitMs / demoSpeed;
}
