import Link from "next/link";
import { CareTeamManager } from "@/components/clinicians/care-team-manager";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { CLINICIAN_COPY as C } from "@/lib/clinicians/copy";
import { listCareTeam } from "@/lib/clinicians/load";
import { resolveActivePatient } from "@/lib/patients/active";

export const metadata = { title: "Share with a clinician — Keepsake" };

/**
 * Caregiver-facing sharing management for the ACTIVE patient: grant/revoke a clinician's read-only
 * trend access. The active patient is the multi-patient switcher's current selection.
 */
export default async function CliniciansPage() {
  const { user, supabase } = await requireUser();
  const patient = await resolveActivePatient(supabase, user.id);

  return (
    <>
      <main className="flex flex-1 flex-col items-center gap-8 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-xl flex-col gap-3">
          <h1 className="text-3xl font-semibold">{C.manage.title}</h1>
          <p className="text-lg text-zinc-700">{C.manage.intro}</p>
        </div>

        {patient ? (
          <>
            <p className="w-full max-w-xl text-lg font-medium text-zinc-800">
              {C.manage.forPatient(patient.displayName)}
            </p>
            <CareTeamManager
              patientId={patient.id}
              members={await listCareTeam(supabase, patient.id)}
            />
          </>
        ) : (
          <p className="w-full max-w-xl text-xl text-zinc-700">{C.manage.noActivePatient}</p>
        )}

        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {C.manage.backToHome}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
