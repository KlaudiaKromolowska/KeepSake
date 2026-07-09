import { notFound } from "next/navigation";
import { ProgressView } from "@/components/progress/progress-view";
import { requireUser } from "@/lib/actions";
import { CLINICIAN_COPY as C } from "@/lib/clinicians/copy";
import { loadClinicianPatient } from "@/lib/clinicians/load";

export const metadata = { title: "Progress — Keepsake" };

/**
 * Read-only clinician progress for ONE shared patient. Same RLS gate as the trends route: a
 * patient not shared with this caller yields null -> 404. Reuses the caregiver <ProgressView>.
 */
export default async function ClinicianProgressPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { supabase } = await requireUser();
  const patient = await loadClinicianPatient(supabase, patientId);
  if (!patient) notFound();

  return ProgressView({ patient, supabase, backHref: "/clinician", backLabel: C.view.backToList });
}
