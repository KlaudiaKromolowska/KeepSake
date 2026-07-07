/** Tunable constants for the SR protocol engine (PLAN.md §4.1/§4.2/§5). */
export interface SrConfig {
  /** first/floor within-session interval, seconds */
  baseIntervalSec: number;
  /** 16 min ceiling; success here ends within-session work */
  maxIntervalSec: number;
  /** ×N expansion on success */
  growthFactor: number;
  /** consecutive misses at base interval → end-on-win */
  baseMissesToEnd: number;
  /** consecutive bad sessions → pause target, prompt re-scope */
  badSessionsToRescope: number;
  /** consecutive unclears on one probe → treat as confirmed miss */
  unclearCap: number;
  /** ~20 min soft cap on total session length, seconds */
  sessionSoftCapSec: number;
  /** consecutive session-start recalls (distinct calendar days) → mastered */
  masteryStreak: number;
  /** first between-session gap after reaching the ceiling, days */
  firstGapDays: number;
  /** between-session gap multiplier on session-start success */
  gapGrowth: number;
  /** pre-mastery gap ceiling, days */
  gapCapDays: number;
  /** gap multiplier on session-start failure */
  gapShrink: number;
  gapFloorDays: number;
  /** post-mastery booster ladder, days; a miss drops one step */
  readonly boosterCadenceDays: readonly number[];
  /** Brush & Camp screen levels, seconds, fixed order */
  readonly candidacyLevelsSec: readonly number[];
  candidacyAttemptsPerLevel: number;
}

export const DEFAULT_SR_CONFIG: SrConfig = {
  baseIntervalSec: 15,
  maxIntervalSec: 960,
  growthFactor: 2,
  baseMissesToEnd: 2,
  badSessionsToRescope: 3,
  unclearCap: 2,
  sessionSoftCapSec: 1200,
  masteryStreak: 3,
  firstGapDays: 1,
  gapGrowth: 1.5,
  gapCapDays: 14,
  gapShrink: 0.5,
  gapFloorDays: 1,
  boosterCadenceDays: [7, 14, 30, 90],
  candidacyLevelsSec: [0, 15, 30],
  candidacyAttemptsPerLevel: 3,
};
