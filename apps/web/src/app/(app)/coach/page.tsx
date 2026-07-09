import Link from "next/link";
import { CoachChat } from "@/components/coach/coach-chat";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { COACH_COPY } from "@/lib/coach/copy";

export const metadata = { title: "Talk it through — Keepsake" };

/**
 * Off-kiosk caregiver coaching route (PLAN §11). Auth is enforced by the (app) group layout
 * (requireUser); re-asserted here so the page is never a public shell. Light theme is forced on the
 * container so an OS dark scheme never flips this caregiver-facing page.
 */
export default async function CoachPage() {
  await requireUser();

  return (
    <>
      <main className="flex min-h-dvh flex-col items-center gap-8 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-2xl flex-col gap-3">
          <h1 className="text-3xl font-semibold">{COACH_COPY.title}</h1>
          <p className="text-lg text-zinc-700">{COACH_COPY.intro}</p>
        </div>

        <CoachChat />

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
