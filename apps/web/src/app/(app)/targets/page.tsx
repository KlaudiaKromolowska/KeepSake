import Link from "next/link";
import { requireUser } from "@/lib/actions";
import { TARGETS_COPY as C } from "@/lib/targets/copy";
import { loadQueue } from "@/lib/targets/load";
import { type ClassifiedTarget, classifyTargets, type TargetPhase } from "@/lib/targets/queue";

export const metadata = { title: "Memories — Keepsake" };

/**
 * Caregiver-facing target list/queue (/targets): every practicable memory and where each one sits —
 * the one in acquisition, the ones queued behind it, and the settled memories on their check-in
 * loops (V2 multi-target). Everything is DERIVED from the roster + persisted target_state (nothing
 * new stored). Server component; every read runs on the RLS user client (own patient only). Light
 * theme forced (bg-white) to match sibling caregiver pages.
 */

// Display grouping: what needs attention first, settled last.
const PHASE_ORDER: Record<TargetPhase, number> = {
  acquiring: 0,
  due: 1,
  queued: 2,
  maintenance: 3,
};

export default async function TargetsPage() {
  const { supabase } = await requireUser();

  const queue = await loadQueue(supabase);
  if (!queue) return <Shell body={C.empty} />;
  if (queue.targets.length === 0) return <Shell body={C.empty} />;

  const classified = classifyTargets(queue.targets, Date.now(), queue.patient.timezone).sort(
    (a, b) =>
      PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
      a.target.createdAt.localeCompare(b.target.createdAt),
  );

  return (
    <Shell>
      <ol className="flex w-full flex-col gap-3">
        {classified.map((c) => (
          <TargetRow key={c.target.id} item={c} />
        ))}
      </ol>
      <Link
        href="/targets/new"
        className="flex min-h-[48px] items-center justify-center rounded-xl border-2 border-zinc-900 px-6 text-lg font-semibold text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {C.addAnother}
      </Link>
    </Shell>
  );
}

function TargetRow({ item }: { item: ClassifiedTarget }) {
  const copy = C.phase[item.phase];
  const highlight = item.phase === "acquiring" || item.phase === "due";
  return (
    <li
      aria-current={item.isAcquisition ? "step" : undefined}
      className={`flex flex-col gap-1 rounded-xl border p-4 ${
        highlight ? "border-2 border-zinc-900 bg-zinc-50" : "border-zinc-300"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-lg font-semibold text-zinc-900">{item.target.question}</span>
        <span
          className={`rounded-full px-3 py-0.5 text-sm font-semibold ${
            highlight ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-700"
          }`}
        >
          {copy.label}
        </span>
      </div>
      <p className="text-base text-zinc-700">{copy.note}</p>
    </li>
  );
}

/** Shared page frame so empty/error/data states stay visually identical (mirrors /schedule). */
function Shell({ body, children }: { body?: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-white p-6 text-zinc-900">
      <div className="flex w-full max-w-3xl flex-col gap-3">
        <h1 className="text-3xl font-semibold">{C.title}</h1>
        <p className="text-lg text-zinc-700">{C.intro}</p>
      </div>

      <div className="flex w-full max-w-3xl flex-1 flex-col gap-6">
        {body && <p className="text-xl text-zinc-700">{body}</p>}
        {children}
      </div>

      <Link
        href="/dashboard"
        className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {C.backToHome}
      </Link>
    </main>
  );
}
