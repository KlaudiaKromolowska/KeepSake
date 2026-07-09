import { ProgressShell, ProgressView } from "@/components/progress/progress-view";
import { requireUser } from "@/lib/actions";
import { resolveActivePatient } from "@/lib/patients/active";
import { PROGRESS_COPY } from "@/lib/progress/copy";

export const metadata = { title: "Progress — Keepsake" };

/**
 * Per-target acquisition view for the caregiver's ACTIVE patient (multi-patient switcher). All
 * rendering lives in <ProgressView> so the read-only clinician route reuses it verbatim.
 */
export default async function ProgressPage() {
  const { user, supabase } = await requireUser();
  const patient = await resolveActivePatient(supabase, user.id);
  if (!patient) {
    return (
      <ProgressShell
        body={PROGRESS_COPY.noTarget}
        backHref="/dashboard"
        backLabel={PROGRESS_COPY.backToHome}
      />
    );
  }
  // Awaited (called as a function, not rendered as an async child element) so the page resolves to
  // a fully-rendered sync tree — matches the repo's server-component testing pattern.
  return ProgressView({
    patient,
    supabase,
    backHref: "/dashboard",
    backLabel: PROGRESS_COPY.backToHome,
  });
}
