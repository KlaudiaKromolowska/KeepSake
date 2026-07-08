"use server";

import { buildDistractorsPrompt, DISTRACTORS_SYSTEM } from "@keepsake/core/prompts/distractors";
import { z } from "zod";
import { requireUser } from "@/lib/actions";
import { assertAiQuota, generateStructured } from "@/lib/ai/core";
import { validateDistractors } from "./distractor-rules";

const distractorsSchema = z.object({ prompts: z.array(z.string()) });

/**
 * Fetches the caregiver's single active/maintenance target + patient, then asks Claude (Haiku,
 * cheap) for 8 personalized wait-time conversation prompts. This is invisible plumbing: ANY
 * failure — no target, quota exceeded, AI unavailable, or a code-side validation reject — resolves
 * to `{ data: null, error: null }` so the caller silently falls back to the static prompt list.
 * Never call this without an already-authenticated request (the session page calls requireUser()
 * first); requireUser()'s redirect branch is not expected to fire here.
 */
export async function personalizedDistractorsAction(): Promise<{
  data: string[] | null;
  error: null;
}> {
  try {
    const { supabase } = await requireUser();

    const { data: target, error: targetErr } = await supabase
      .from("targets")
      .select("answer, patient_id")
      .in("status", ["active", "maintenance"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (targetErr || !target) return { data: null, error: null };

    const { data: patient, error: patientErr } = await supabase
      .from("patients")
      .select("display_name, notes")
      .eq("id", target.patient_id)
      .single();
    if (patientErr || !patient) return { data: null, error: null };

    await assertAiQuota(supabase, "distractors");

    const result = await generateStructured({
      kind: "distractors",
      schema: distractorsSchema,
      system: DISTRACTORS_SYSTEM,
      user: buildDistractorsPrompt({
        displayName: patient.display_name,
        notes: patient.notes,
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
