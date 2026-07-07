import { z } from "zod";

/** Mirrors the `public.etiology` Postgres enum (supabase/migrations) — keep in sync. */
export const ETIOLOGY_VALUES = [
  "alzheimers",
  "vascular",
  "lewy",
  "parkinsons",
  "mixed",
  "unspecified",
] as const;

const IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export const createPatientSchema = z.object({
  displayName: z.string().min(1).max(100),
  timezone: z.string().refine((tz) => IANA_TIMEZONES.has(tz), {
    message: "Must be a valid IANA timezone name",
  }),
  etiology: z.enum(ETIOLOGY_VALUES),
  isDemo: z.boolean().optional(),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
