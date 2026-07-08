import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { signOut } from "@/lib/auth/actions";
import { REVIEW_COPY } from "@/lib/review/copy";
import { SESSION_COPY } from "@/lib/session/copy";
import { WIZARD_COPY } from "@/lib/wizard/copy";

export const metadata = { title: "Dashboard — Keepsake" };

export default async function DashboardPage() {
  const { user, supabase } = await requireUser();

  const { data: target } = await supabase
    .from("targets")
    .select("question")
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <h1 className="text-2xl font-semibold">Keepsake — signed in as {user.email}</h1>

        {target ? (
          <Link
            href="/session"
            className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-zinc-900 px-8 py-6 text-center text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            <span className="text-2xl font-semibold">{SESSION_COPY.dashboard.startTitle}</span>
            <span className="text-xl text-zinc-100">{target.question}</span>
            <span className="text-lg text-zinc-300">{SESSION_COPY.dashboard.startHint}</span>
          </Link>
        ) : (
          <p className="text-xl text-zinc-700">{SESSION_COPY.dashboard.noTarget}</p>
        )}

        <Link
          href="/targets/new"
          className="flex min-h-[64px] w-full max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white px-8 py-6 text-center text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          <span className="text-2xl font-semibold">{WIZARD_COPY.page.heading}</span>
          <span className="text-lg text-zinc-600">{WIZARD_COPY.page.cardHint}</span>
        </Link>

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
