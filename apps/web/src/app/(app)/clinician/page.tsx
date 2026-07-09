import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { CLINICIAN_COPY as C } from "@/lib/clinicians/copy";
import { listClinicianPatients } from "@/lib/clinicians/load";

export const metadata = { title: "Shared with you — Keepsake" };

/**
 * Read-only clinician landing (PLAN §12 V1): the patients whose practice data a caregiver has
 * shared with the signed-in user. Every card links only to the read-only trend/progress surfaces —
 * there is no session, target-editing, or any mutating control anywhere under /clinician. RLS
 * (clinician_patients) is what actually scopes the roster; this list just renders it.
 */
export default async function ClinicianHomePage() {
  const { user, supabase } = await requireUser();
  const patients = await listClinicianPatients(supabase, user.id);

  return (
    <>
      <main className="flex flex-1 flex-col items-center gap-8 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-2xl flex-col gap-3">
          <h1 className="text-3xl font-semibold">{C.view.title}</h1>
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-base text-zinc-600">
            {C.view.intro}
          </p>
        </div>

        {patients.length === 0 ? (
          <p className="w-full max-w-2xl text-xl text-zinc-700">{C.view.empty}</p>
        ) : (
          <ul className="flex w-full max-w-2xl flex-col gap-4">
            {patients.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-2xl border-2 border-zinc-300 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xl font-semibold">{p.displayName}</span>
                  <span className="rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-600">
                    {C.view.readOnlyBadge}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/clinician/${p.id}/trends`}
                    className="flex min-h-[48px] items-center rounded-xl border-2 border-zinc-900 bg-zinc-900 px-6 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                  >
                    {C.view.trendsLink}
                  </Link>
                  <Link
                    href={`/clinician/${p.id}/progress`}
                    className="flex min-h-[48px] items-center rounded-xl border-2 border-zinc-900 bg-white px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                  >
                    {C.view.progressLink}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {C.view.backToHome}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
