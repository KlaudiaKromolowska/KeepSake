import Link from "next/link";
import { CapsuleManager } from "@/components/capsules/capsule-manager";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { CAPSULE_COPY } from "@/lib/capsules/copy";
import { resolvePatientCapsules } from "@/lib/capsules/resolve";
import { resolveActivePatient } from "@/lib/patients/active";

const C = CAPSULE_COPY.manage;

export const metadata = { title: "Memory capsules — Keepsake" };

/**
 * Caregiver curation of the ACTIVE patient's memory capsules (PLAN §12 V2) — the photos/short videos
 * shown as an in-session reward on a genuine recall. Server component: reads the caller's own patient
 * and their capsules through the RLS user client (signed thumbnails), then hands them to the client
 * manager which drives the auth/ownership-gated upload/remove actions. Not shown to the clinician
 * role — this route lives under the caregiver `(app)` group and only ever resolves owned patients.
 */
export default async function CapsulesPage() {
  const { user, supabase } = await requireUser();
  const patient = await resolveActivePatient(supabase, user.id);
  const capsules = patient ? await resolvePatientCapsules(supabase, user.id, patient.id) : [];

  return (
    <>
      <main className="flex flex-1 flex-col items-center gap-8 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-2xl flex-col gap-3">
          <h1 className="text-3xl font-semibold">{C.title}</h1>
          <p className="text-lg text-zinc-700">{C.intro}</p>
        </div>

        {patient ? (
          <>
            <p className="w-full max-w-2xl text-lg font-medium text-zinc-800">
              {C.forPatient(patient.displayName)}
            </p>
            <CapsuleManager patientId={patient.id} capsules={capsules} />
          </>
        ) : (
          <p className="w-full max-w-2xl text-xl text-zinc-700">{C.noActivePatient}</p>
        )}

        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {C.backToHome}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
