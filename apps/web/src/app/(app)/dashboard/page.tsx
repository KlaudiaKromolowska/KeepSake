import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { signOut } from "@/lib/auth/actions";
import { ETIOLOGY_COPY } from "@/lib/etiology/copy";
import { PROGRESS_COPY } from "@/lib/progress/copy";
import { REVIEW_COPY } from "@/lib/review/copy";
import { SCHEDULE_PLAN_COPY } from "@/lib/schedule/copy";
import { dueStatusLine } from "@/lib/schedule/due-status";
import { SESSION_COPY } from "@/lib/session/copy";
import { TARGETS_COPY } from "@/lib/targets/copy";
import { loadQueue } from "@/lib/targets/load";
import { classifyTargets, selectSessionTarget, summarizeQueue } from "@/lib/targets/queue";
import { TRENDS_COPY } from "@/lib/trends/copy";
import { WIZARD_COPY } from "@/lib/wizard/copy";

export const metadata = { title: "Dashboard — Keepsake" };

export default async function DashboardPage() {
  const { user, supabase } = await requireUser();

  // V2 multi-target: aggregate over every practicable target, then pick the one to open on (due
  // wins; acquisition wins ties). Best-effort — a read failure just yields no CTA, never a break.
  const queue = await loadQueue(supabase);
  const now = Date.now();
  const classified = queue ? classifyTargets(queue.targets, now, queue.patient.timezone) : [];
  const selectedId = queue ? selectSessionTarget(queue.targets, now, queue.patient.timezone) : null;
  const selected = classified.find((c) => c.target.id === selectedId) ?? null;
  const target = selected?.target ?? null;

  const dueLine = selected ? dueStatusLine(selected.due) : null;
  const summaryLine =
    queue && queue.targets.length > 1 ? TARGETS_COPY.summaryLine(summarizeQueue(classified)) : "";

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

        {summaryLine && <p className="-mt-4 text-lg text-zinc-600">{summaryLine}</p>}

        {target && (
          <Link
            href="/schedule"
            className="-mt-2 flex min-h-[48px] items-center text-lg text-zinc-600 underline underline-offset-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
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
            href="/targets"
            className="-mt-4 flex min-h-[48px] items-center text-lg text-zinc-600 underline underline-offset-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {TARGETS_COPY.cardHint}
          </Link>
        )}

        {target && (
          <Link
            href="/progress"
            className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white px-8 py-6 text-center text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            <span className="text-2xl font-semibold">{PROGRESS_COPY.title}</span>
            <span className="text-lg text-zinc-600">{PROGRESS_COPY.cardHint}</span>
          </Link>
        )}

        {target && (
          <Link
            href="/trends"
            className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white px-8 py-6 text-center text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            <span className="text-2xl font-semibold">{TRENDS_COPY.title}</span>
            <span className="text-lg text-zinc-600">{TRENDS_COPY.cardHint}</span>
          </Link>
        )}

        <Link
          href="/review"
          className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white px-8 py-6 text-center text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          <span className="text-2xl font-semibold">{REVIEW_COPY.title}</span>
          <span className="text-lg text-zinc-600">{REVIEW_COPY.intro}</span>
        </Link>

        <Link
          href="/etiology"
          className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white px-8 py-6 text-center text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          <span className="text-2xl font-semibold">{ETIOLOGY_COPY.title}</span>
          <span className="text-lg text-zinc-600">{ETIOLOGY_COPY.intro}</span>
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
