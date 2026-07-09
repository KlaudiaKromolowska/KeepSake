/**
 * Pure mapping from patient-scoped DB rows to trial-level CSV rows — the structured dataset a
 * caregiver can download for their own analysis (PLAN.md §12 "CSV export" / V3 "research export").
 * One row per trial, enriched with its session's start time + affect check-ins and its target's
 * question text. No I/O here — the route reads via the RLS user client and passes rows in; this
 * only transforms them (mirrors lib/ai/rct-data.ts). Data minimization: target `answer` text and
 * `image_url` never reach this layer, and the caregiver's own id/email are not included per row.
 */

import type { CsvCell } from "./csv";

export const TRIAL_CSV_HEADER = [
  "trial_id",
  "session_id",
  "session_started_at",
  "target_id",
  "target_question",
  "outcome",
  "interval_sec",
  "is_screening",
  "corrected",
  "latency_ms",
  "affect_pre",
  "affect_post",
  "trial_at",
] as const;

export interface ExportTargetRow {
  id: string;
  question: string;
}
export interface ExportSessionRow {
  id: string;
  started_at: string;
  affect_pre: string | null;
  affect_post: string | null;
}
export interface ExportTrialRow {
  id: string;
  session_id: string;
  target_id: string;
  interval_sec: number;
  outcome: string;
  is_screening: boolean;
  corrected: boolean;
  latency_ms: number | null;
  at: string;
}

export interface ExportRawInputs {
  targets: ExportTargetRow[];
  sessions: ExportSessionRow[];
  trials: ExportTrialRow[]; // ordered by `at` ascending
}

/**
 * Builds the CSV data rows (column order matches `TRIAL_CSV_HEADER`). A trial whose session isn't
 * in `sessions` is dropped rather than emitted with blanks — under RLS + FK constraints this
 * should never happen, but the guard keeps a partial/inconsistent read from ever mixing rows across
 * patients (defensive, mirrors the flatMap join guard in lib/ai/rct-data.ts).
 */
export function buildTrialCsvRows(raw: ExportRawInputs): CsvCell[][] {
  const questionByTarget = new Map(raw.targets.map((t) => [t.id, t.question]));
  const sessionById = new Map(raw.sessions.map((s) => [s.id, s]));

  return raw.trials.flatMap((tr) => {
    const session = sessionById.get(tr.session_id);
    if (!session) return [];
    return [
      [
        tr.id,
        tr.session_id,
        session.started_at,
        tr.target_id,
        questionByTarget.get(tr.target_id) ?? "",
        tr.outcome,
        tr.interval_sec,
        tr.is_screening,
        tr.corrected,
        tr.latency_ms,
        session.affect_pre,
        session.affect_post,
        tr.at,
      ],
    ];
  });
}
