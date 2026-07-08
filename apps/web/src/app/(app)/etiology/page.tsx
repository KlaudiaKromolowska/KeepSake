import Link from "next/link";
import { ReasoningPanel } from "@/components/etiology/reasoning-panel";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { ETIOLOGY_COPY } from "@/lib/etiology/copy";

export const metadata = { title: "Clinical reasoning — Keepsake" };

/**
 * Caregiver/judge-facing surface for PLAN §1b #8 — Claude's extended thinking on the etiology
 * format call, shown transparently. Read-only: the reasoning is a window into the clinical rules,
 * never a change to the plan (the deterministic mapping is the source of truth). Light theme forced
 * on the container so an OS dark scheme never flips the filmed page (matches the review page).
 */
export default async function EtiologyPage() {
  await requireUser();

  return (
    <>
      <main className="flex min-h-dvh flex-col items-center gap-8 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-3xl flex-col gap-3">
          <h1 className="text-3xl font-semibold">{ETIOLOGY_COPY.title}</h1>
          <p className="text-lg text-zinc-700">{ETIOLOGY_COPY.intro}</p>
        </div>

        <ReasoningPanel />

        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          Back to home
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
