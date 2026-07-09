import Link from "next/link";
import { AcquisitionChart } from "@/components/progress/acquisition-chart";
import { SiteFooter } from "@/components/site-footer";
import { AffectChart } from "@/components/trends/affect-chart";
import { BandChart, type BandRow } from "@/components/trends/band-chart";
import { requireUser } from "@/lib/actions";
import { describeAcquisition, toAcquisitionSeries } from "@/lib/progress/series";
import { srDefaultsForPatient } from "@/lib/sr/config";
import { PRACTICABLE_STATUSES } from "@/lib/targets/queue";
import { TRENDS_COPY } from "@/lib/trends/copy";
import { currentBand, toAffectSeries } from "@/lib/trends/series";

export const metadata = { title: "Trends — Keepsake" };

/**
 * Self-referenced learning-dynamics trend view (PLAN.md §3.5, §10): item retention, ladder
 * progress, and the patient-affect two-tap — every one derived from logs the app already writes,
 * no new tables. Read-only, off the kiosk/session UI. Every read runs on the RLS user client (own
 * patient only, requireUser via the (app) layout). Framed strictly as show-data-never-diagnosis —
 * "compared to this person's own earlier sessions," never a cross-person or clinical claim.
 */
export default async function TrendsPage() {
  const { supabase } = await requireUser();

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id, timezone, etiology")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (patientErr) return <Shell body={TRENDS_COPY.unavailable} />;
  if (!patient) return <Shell body={TRENDS_COPY.noTarget} />;

  const { data: targets, error: targetsErr } = await supabase
    .from("targets")
    .select("id, question")
    .eq("patient_id", patient.id)
    .in("status", [...PRACTICABLE_STATUSES])
    .order("created_at", { ascending: true });
  if (targetsErr) return <Shell body={TRENDS_COPY.unavailable} />;
  if (!targets || targets.length === 0) return <Shell body={TRENDS_COPY.noTarget} />;

  const targetIds = targets.map((t) => t.id);
  const [sessionsRes, trialsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, started_at, affect_pre, affect_post")
      .eq("patient_id", patient.id)
      .order("started_at", { ascending: true }),
    supabase
      .from("trials")
      .select("session_id, target_id, interval_sec, outcome, is_screening, at")
      .in("target_id", targetIds)
      .order("at", { ascending: true }),
  ]);
  if (sessionsRes.error || trialsRes.error) return <Shell body={TRENDS_COPY.unavailable} />;

  const sessions = sessionsRes.data ?? [];
  const trials = trialsRes.data ?? [];
  const { config } = srDefaultsForPatient(patient.etiology);

  const perTarget = targets.map((t) => {
    const points = toAcquisitionSeries(
      sessions,
      trials.filter((tr) => tr.target_id === t.id),
      patient.timezone,
    );
    return {
      target: t,
      points,
      summary: describeAcquisition(points, config.maxIntervalSec),
      band: currentBand(points, config.baseIntervalSec, config.maxIntervalSec),
    };
  });

  const retentionSections = perTarget.filter((s) => s.points.length > 0 && s.summary !== null);
  const bandRows: BandRow[] = perTarget.map((s) => ({
    targetId: s.target.id,
    question: s.target.question,
    band: s.band,
  }));

  const affectPoints = toAffectSeries(sessions, patient.timezone);

  return (
    <>
      <main className="flex flex-1 flex-col items-center gap-10 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-3xl flex-col gap-3">
          <h1 className="text-3xl font-semibold">{TRENDS_COPY.title}</h1>
          <p className="text-lg text-zinc-700">{TRENDS_COPY.intro}</p>
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-base text-zinc-600">
            {TRENDS_COPY.disclaimer}
          </p>
        </div>

        <section
          className="flex w-full max-w-3xl flex-col gap-4"
          aria-label={TRENDS_COPY.band.heading}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">{TRENDS_COPY.band.heading}</h2>
            <p className="text-base text-zinc-600">{TRENDS_COPY.band.hint}</p>
          </div>
          <BandChart rows={bandRows} />
        </section>

        <section
          className="flex w-full max-w-3xl flex-col gap-4"
          aria-label={TRENDS_COPY.affect.heading}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">{TRENDS_COPY.affect.heading}</h2>
            <p className="text-base text-zinc-600">{TRENDS_COPY.affect.hint}</p>
          </div>
          <AffectChart points={affectPoints} />
        </section>

        {retentionSections.length > 0 && (
          <section
            className="flex w-full max-w-3xl flex-col gap-6"
            aria-label={TRENDS_COPY.retention.heading}
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">{TRENDS_COPY.retention.heading}</h2>
              <p className="text-base text-zinc-600">{TRENDS_COPY.retention.hint}</p>
            </div>
            {retentionSections.map(({ target, points, summary }) => (
              <div
                key={target.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-5"
              >
                <h3 className="text-lg font-semibold">{target.question}</h3>
                <AcquisitionChart
                  points={points}
                  baseIntervalSec={config.baseIntervalSec}
                  maxIntervalSec={config.maxIntervalSec}
                  summary={summary ?? ""}
                />
                <p className="text-base text-zinc-700">{summary}</p>
              </div>
            ))}
          </section>
        )}

        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {TRENDS_COPY.backToHome}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}

/** Shared frame for the no-patient / no-target / error states. */
function Shell({ body }: { body: string }) {
  return (
    <>
      <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-3xl flex-col gap-3 text-center">
          <h1 className="text-3xl font-semibold">{TRENDS_COPY.title}</h1>
          <p className="text-xl text-zinc-700">{body}</p>
        </div>
        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {TRENDS_COPY.backToHome}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
