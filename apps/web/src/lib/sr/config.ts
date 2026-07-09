import {
  type Etiology,
  type EtiologyDefaults,
  POPULATION_PRIOR,
  type PopulationPrior,
  warmStartDefaults,
} from "@keepsake/core/sr";

/**
 * Single source of truth for a patient's SR defaults across the app (session engine, trends,
 * schedule, progress, the RCT export). Etiology defaults with the population-prior warm-start
 * opening rung applied — a brand-new target opens a couple of ladder rungs above cold-start for
 * etiologies the in-silico cohort settled higher on (PLAN §5), falling back to the generic
 * cold-start `baseIntervalSec` for any etiology with no prior (warmStartDefaults' own contract).
 *
 * PRECISION-SAFE BY CONSTRUCTION: this recomputes the config deterministically from `etiology` +
 * the committed `POPULATION_PRIOR` literal on every call. The warm-start `baseIntervalSec` (e.g.
 * 50.625s) is NEVER persisted to / read back from a numeric column — target creation stores only
 * `etiology` (on the patient) — so the exact same float is produced everywhere and the reducer's
 * rescope float-equality (config base === reducer reset base) holds. `prior` is injectable only so
 * the fallback path can be exercised in tests; production always uses `POPULATION_PRIOR`.
 */
export function srDefaultsForPatient(
  etiology: Etiology,
  prior: PopulationPrior = POPULATION_PRIOR,
): EtiologyDefaults {
  return warmStartDefaults(etiology, prior);
}
