import Link from "next/link";
import { CreateOrgForm } from "@/components/orgs/create-org-form";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { ORG_COPY as C } from "@/lib/orgs/copy";
import { listMyOrgs } from "@/lib/orgs/load";

export const metadata = { title: "Care homes — Keepsake" };

/**
 * Care-home landing (PLAN §12 V3): the organizations the signed-in user belongs to, and a form to
 * create a new one (which makes them its first admin). RLS scopes the roster; this just renders it.
 */
export default async function OrgsPage() {
  const { user, supabase } = await requireUser();
  const orgs = await listMyOrgs(supabase, user.id);

  return (
    <>
      <main className="flex flex-1 flex-col items-center gap-8 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-2xl flex-col gap-3">
          <h1 className="text-3xl font-semibold">{C.list.title}</h1>
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-base text-zinc-600">
            {C.list.intro}
          </p>
        </div>

        {orgs.length === 0 ? (
          <p className="w-full max-w-2xl text-xl text-zinc-700">{C.list.empty}</p>
        ) : (
          <ul className="flex w-full max-w-2xl flex-col gap-4">
            {orgs.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-2xl border-2 border-zinc-300 p-5"
              >
                <span className="flex items-center gap-3">
                  <span className="text-xl font-semibold">{o.name}</span>
                  <span className="rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-600">
                    {o.role === "admin" ? C.list.adminBadge : C.list.staffBadge}
                  </span>
                </span>
                <Link
                  href={`/orgs/${o.id}`}
                  className="flex min-h-[48px] items-center rounded-xl border-2 border-zinc-900 bg-zinc-900 px-6 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                >
                  {C.list.openLink}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">{C.list.createHeading}</h2>
          <CreateOrgForm />
        </div>

        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {C.list.backToHome}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
