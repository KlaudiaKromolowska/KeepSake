import { z } from "zod";

/** Share a patient's read-only trend view with a clinician, identified by their account email. */
export const linkClinicianSchema = z.object({
  patientId: z.uuid(),
  email: z.email().max(320),
});

/** Revoke a previously-granted clinician view. */
export const unlinkClinicianSchema = z.object({
  patientId: z.uuid(),
  clinicianId: z.uuid(),
});

export type LinkClinicianInput = z.infer<typeof linkClinicianSchema>;
export type UnlinkClinicianInput = z.infer<typeof unlinkClinicianSchema>;
