import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { AcquisitionChart } from "@/components/progress/acquisition-chart";
import type { ActivePatient } from "@/lib/patients/active";
import { PROGRESS_COPY } from "@/lib/progress/copy";
import { describeAcquisition, toAcquisitionSeries } from "@/lib/progress/series";
import { srDefaultsForPatient } from "@/lib/sr/config";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Per-target acquisition view, decoupled from whose patient it is: the caregiver route renders it
 * for their ACTIVE patient, the read-only clinician route for a patient shared with them. Identical
 * output either way — RLS decides which rows come back; this component never widens access. The
 * caller threads its own RLS user client. Light theme forced (bg-white) — a filmed page must not flip.
 */
export async function ProgressView({
  patient,
  supabase,
  backHref,
  backLabel,
}: {
  patient: ActivePatient;
  supabase: SupabaseClient<Database>;
  backHref: string;
  backLabel: string;
}) {
  const { data: target, error: targetErr } = await supabase
    .from("targets")
    .select("id, question")
    .eq("patient_id", patient.id)
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (targetErr)
    return (
      <ProgressShell body={PROGRESS_COPY.unavailable} backHref={backHref} backLabel={backLabel} />
    );
  if (!target)
    return (
      <ProgressShell body={PROGRESS_COPY.noTarget} backHref={backHref} backLabel={backLabel} />
    );

  const [sessionsRes, trialsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, started_at")
      .eq("patient_id", patient.id)
      .order("started_at", { ascending: true }),
    supabase
      .from("trials")
      .select("session_id, interval_sec, outcome, is_screening, at")
      .eq("target_id", target.id)
      .order("at", { ascending: true }),
  ]);
  if (sessionsRes.error || trialsRes.error) {
    return (
      <ProgressShell
        heading={target.question}
        body={PROGRESS_COPY.unavailable}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }

  const points = toAcquisitionSeries(
    sessionsRes.data ?? [],
    trialsRes.data ?? [],
    patient.timezone,
  );
  const { config } = srDefaultsForPatient(patient.etiology);
  const summary = describeAcquisition(points, config.maxIntervalSec);

  if (points.length === 0 || summary === null) {
    return (
      <ProgressShell
        heading={target.question}
        body={PROGRESS_COPY.empty}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }

  return (
    <ProgressShell heading={target.question} backHref={backHref} backLabel={backLabel}>
      <section className="flex w-full flex-col gap-4" aria-label={PROGRESS_COPY.chartHeading}>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{PROGRESS_COPY.chartHeading}</h2>
          <p className="text-base text-zinc-600">{PROGRESS_COPY.chartHint}</p>
        </div>
        <AcquisitionChart
          points={points}
          baseIntervalSec={config.baseIntervalSec}
          maxIntervalSec={config.maxIntervalSec}
          summary={summary}
        />
        <p className="text-lg text-zinc-700">{summary}</p>
      </section>
    </ProgressShell>
  );
}

/** Shared page frame so empty/error/data states stay visually identical across both routes. */
export function ProgressShell({
  heading,
  body,
  backHref,
  backLabel,
  children,
}: {
  heading?: string;
  body?: string;
  backHref: string;
  backLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-white p-6 text-zinc-900">
      <div className="flex w-full max-w-3xl flex-col gap-3">
        <h1 className="text-3xl font-semibold">{PROGRESS_COPY.title}</h1>
        {heading && <p className="text-lg text-zinc-700">{heading}</p>}
      </div>

      <div className="flex w-full max-w-3xl flex-1 flex-col gap-6">
        {body && <p className="text-xl text-zinc-700">{body}</p>}
        {children}
      </div>

      <Link
        href={backHref}
        className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {backLabel}
      </Link>
    </main>
  );
}
