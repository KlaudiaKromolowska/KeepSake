import { notFound } from "next/navigation";
import { TrendsView } from "@/components/trends/trends-view";
import { requireUser } from "@/lib/actions";
import { CLINICIAN_COPY as C } from "@/lib/clinicians/copy";
import { loadClinicianPatient } from "@/lib/clinicians/load";

export const metadata = { title: "Trends — Keepsake" };

/**
 * Read-only clinician trends for ONE shared patient. `loadClinicianPatient` returns the patient
 * only when RLS (clinician_patients) grants this caller access — an unlinked patient id yields
 * null, which becomes a 404. No mutating control is rendered; the view is identical to the
 * caregiver's own /trends.
 */
export default async function ClinicianTrendsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { supabase } = await requireUser();
  const patient = await loadClinicianPatient(supabase, patientId);
  if (!patient) notFound();

  return TrendsView({ patient, supabase, backHref: "/clinician", backLabel: C.view.backToList });
}
