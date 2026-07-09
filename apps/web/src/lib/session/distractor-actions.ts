"use server";

import { buildDistractorsPrompt, DISTRACTORS_SYSTEM } from "@keepsake/core/prompts/distractors";
import { z } from "zod";
import { requireUser } from "@/lib/actions";
import { assertAiQuota, generateStructured } from "@/lib/ai/core";
import { validateDistractors } from "./distractor-rules";

const distractorsSchema = z.object({ prompts: z.array(z.string()) });

/**
 * Fetches the target being practised + its patient, then asks Claude (Haiku, cheap) for 8
 * personalized wait-time conversation prompts. `targetId` pins the exact target the session opened
 * on (V2 multi-target: session entry may pick a due booster, not the acquisition target); omitted,
 * it falls back to the earliest practicable target. This is invisible plumbing: ANY failure — no
 * target, quota exceeded, AI unavailable, or a code-side validation reject — resolves to
 * `{ data: null, error: null }` so the caller silently falls back to the static prompt list. Never
 * call this without an already-authenticated request (the session page calls requireUser() first).
 */
export async function personalizedDistractorsAction(targetId?: string): Promise<{
  data: string[] | null;
  error: null;
}> {
  try {
    const { supabase } = await requireUser();

    const base = supabase.from("targets").select("answer, patient_id");
    const query = targetId
      ? base.eq("id", targetId)
      : base
          .in("status", ["active", "mastered", "maintenance"])
          .order("created_at", { ascending: true })
          .limit(1);
    const { data: target, error: targetErr } = await query.maybeSingle();
    if (targetErr || !target) return { data: null, error: null };

    const { data: patient, error: patientErr } = await supabase
      .from("patients")
      .select("display_name")
      .eq("id", target.patient_id)
      .single();
    if (patientErr || !patient) return { data: null, error: null };

    // The caregiver note now lives in its own table (patient_notes) so the read-only clinician role
    // cannot read it (GDPR minimization). A missing row / no read access degrades to no note, never
    // an error — personalization is best-effort.
    const { data: noteRow } = await supabase
      .from("patient_notes")
      .select("note")
      .eq("patient_id", target.patient_id)
      .maybeSingle();

    await assertAiQuota(supabase, "distractors");

    const result = await generateStructured({
      kind: "distractors",
      schema: distractorsSchema,
      system: DISTRACTORS_SYSTEM,
      user: buildDistractorsPrompt({
        displayName: patient.display_name,
        notes: noteRow?.note ?? null,
        locale: "en",
      }),
      model: "claude-haiku-4-5",
      maxTokens: 1024,
    });

    if (!validateDistractors(result.prompts, target.answer)) return { data: null, error: null };
    return { data: result.prompts, error: null };
  } catch {
    return { data: null, error: null };
  }
}
