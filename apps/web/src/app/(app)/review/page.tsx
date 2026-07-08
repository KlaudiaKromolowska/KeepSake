import Link from "next/link";
import { ReportPanel } from "@/components/review/report-panel";
import { requireUser } from "@/lib/actions";
import { REVIEW_COPY } from "@/lib/review/copy";

export const metadata = { title: "Research view — Keepsake" };

/**
 * Caregiver/judge-facing research view: one question in, a streamed single-subject study report
 * out. Light theme is forced on the container (bg-white/text-zinc-900) so an OS dark scheme never
 * flips the filmed page (QA note 2026-07-08).
 */
export default async function ReviewPage() {
  await requireUser();

  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-white p-6 text-zinc-900">
      <div className="flex w-full max-w-3xl flex-col gap-3">
        <h1 className="text-3xl font-semibold">{REVIEW_COPY.title}</h1>
        <p className="text-lg text-zinc-700">{REVIEW_COPY.intro}</p>
      </div>

      <ReportPanel />

      <Link
        href="/dashboard"
        className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        Back to home
      </Link>
    </main>
  );
}
