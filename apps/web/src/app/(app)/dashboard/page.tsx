import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { signOut } from "@/lib/auth/actions";
import { PROGRESS_COPY } from "@/lib/progress/copy";
import { REVIEW_COPY } from "@/lib/review/copy";
import { SCHEDULE_PLAN_COPY } from "@/lib/schedule/copy";
import { dueStatus, dueStatusLine } from "@/lib/schedule/due-status";
import { SESSION_COPY } from "@/lib/session/copy";
import { WIZARD_COPY } from "@/lib/wizard/copy";

export const metadata = { title: "Dashboard — Keepsake" };

export default async function DashboardPage() {
  const { user, supabase } = await requireUser();

  const { data: target } = await supabase
    .from("targets")
    .select("id, question, patient_id")
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Booster-loop visibility (PLAN §5/§6): one gentle line derived from the persisted schedule.
  // Best-effort — on any read error the line is simply omitted, never a broken dashboard.
  let dueLine: string | null = null;
  if (target) {
    const [stateRes, patientRes] = await Promise.all([
      supabase
        .from("target_state")
        .select("schedule_mode, next_due_at")
        .eq("target_id", target.id)
        .maybeSingle(),
      supabase.from("patients").select("timezone").eq("id", target.patient_id).maybeSingle(),
    ]);
    if (!stateRes.error && !patientRes.error && patientRes.data) {
      dueLine = dueStatusLine(
        dueStatus(
          stateRes.data?.next_due_at ?? null,
          stateRes.data?.schedule_mode ?? null,
          Date.now(),
          patientRes.data.timezone,
        ),
      );
    }
  }

  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <h1 className="text-2xl font-semibold">Keepsake — signed in as {user.email}</h1>

        {target ? (
          <Link
            href="/session"
            className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-zinc-900 px-8 py-6 text-center text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {dueLine && <span className="text-lg text-zinc-300">{dueLine}</span>}
            <span className="text-2xl font-semibold">{SESSION_COPY.dashboard.startTitle}</span>
            <span className="text-xl text-zinc-100">{target.question}</span>
            <span className="text-lg text-zinc-300">{SESSION_COPY.dashboard.startHint}</span>
          </Link>
        ) : (
          <p className="text-xl text-zinc-700">{SESSION_COPY.dashboard.noTarget}</p>
        )}

        {target && (
          <Link
            href="/schedule"
            className="-mt-4 flex min-h-[48px] items-center text-lg text-zinc-600 underline underline-offset-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {SCHEDULE_PLAN_COPY.cardHint}
          </Link>
        )}

        <Link
          href="/targets/new"
          className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white px-8 py-6 text-center text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          <span className="text-2xl font-semibold">{WIZARD_COPY.page.heading}</span>
          <span className="text-lg text-zinc-600">{WIZARD_COPY.page.cardHint}</span>
        </Link>

        {target && (
          <Link
            href="/progress"
            className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white px-8 py-6 text-center text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            <span className="text-2xl font-semibold">{PROGRESS_COPY.title}</span>
            <span className="text-lg text-zinc-600">{PROGRESS_COPY.cardHint}</span>
          </Link>
        )}

        <Link
          href="/review"
          className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white px-8 py-6 text-center text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          <span className="text-2xl font-semibold">{REVIEW_COPY.title}</span>
          <span className="text-lg text-zinc-600">{REVIEW_COPY.intro}</span>
        </Link>

        <form action={signOut}>
          <button
            type="submit"
            className="h-[60px] rounded-lg border border-zinc-300 px-8 text-xl font-medium"
          >
            Sign out
          </button>
        </form>
      </main>
      <SiteFooter />
    </>
  );
}
