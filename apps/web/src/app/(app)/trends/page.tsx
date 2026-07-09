import { TrendsShell, TrendsView } from "@/components/trends/trends-view";
import { requireUser } from "@/lib/actions";
import { resolveActivePatient } from "@/lib/patients/active";
import { TRENDS_COPY } from "@/lib/trends/copy";

export const metadata = { title: "Trends — Keepsake" };

/**
 * Self-referenced learning-dynamics trends for the caregiver's ACTIVE patient (multi-patient
 * switcher). All rendering lives in <TrendsView> so the read-only clinician route reuses it.
 * `showExport` is on here (the caregiver's own data) and off on the clinician route.
 */
export default async function TrendsPage() {
  const { user, supabase } = await requireUser();
  const patient = await resolveActivePatient(supabase, user.id);
  if (!patient) {
    return (
      <TrendsShell
        body={TRENDS_COPY.noTarget}
        backHref="/dashboard"
        backLabel={TRENDS_COPY.backToHome}
      />
    );
  }
  // Awaited (called as a function, not rendered as an async child element) so the page resolves to
  // a fully-rendered sync tree — matches the repo's server-component testing pattern.
  return TrendsView({
    patient,
    supabase,
    backHref: "/dashboard",
    backLabel: TRENDS_COPY.backToHome,
    showExport: true,
  });
}
