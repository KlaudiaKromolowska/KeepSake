import type { Etiology } from "../sr/types";
import { batesUnit, type Rng } from "./rng";

/** The six etiologies the engine supports (etiology.ts) — sampled uniformly. This is a coverage
 *  sample across the engine's supported profiles, NOT a prevalence-weighted epidemiological
 *  sample: we have no authoritative comorbidity-adjusted incidence numbers to justify weighting
 *  one etiology over another (docs/simulation/README.md). */
export const ETIOLOGIES: readonly Etiology[] = [
  "alzheimers",
  "vascular",
  "lewy",
  "parkinsons",
  "mixed",
  "unspecified",
];

export interface SyntheticPatient {
  id: number;
  etiology: Etiology;
  /** Overall retrieval-ability parameter in [0, 1) — higher retains longer. Sampled via a Bates
   *  (mean-of-uniforms) draw for a mild central tendency; not fit to any real ability distribution. */
  ability: number;
}

/** Samples one synthetic patient, consuming draws from `rng` (etiology, then ability). */
export function samplePatient(rng: Rng, id: number): SyntheticPatient {
  const etiology = rng.pick(ETIOLOGIES);
  const ability = batesUnit(rng);
  return { id, etiology, ability };
}

/** Samples `n` synthetic patients in order, id 0..n-1. Deterministic given `rng`'s seed. */
export function samplePatients(rng: Rng, n: number): SyntheticPatient[] {
  return Array.from({ length: n }, (_, id) => samplePatient(rng, id));
}
