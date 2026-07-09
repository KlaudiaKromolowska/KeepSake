"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import {
  CAPSULE_BUCKET,
  type CapsuleMime,
  capsuleObjectPath,
  isOwnedCapsulePath,
  validateCapsuleBytes,
} from "./capsule-file";
import { CAPSULE_COPY } from "./copy";
import { captionSchema, removeCapsuleSchema } from "./schema";

const C = CAPSULE_COPY.manage;

const REASON_COPY: Record<"empty" | "too_large" | "bad_type", string> = {
  empty: C.errors.uploadFailed,
  too_large: C.errors.tooLarge,
  bad_type: C.errors.badType,
};

const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Upload one caregiver-curated capsule (photo or short video) to the private `memory-capsules`
 * bucket, then record it against the patient. Every byte is untrusted: read the file server-side,
 * validate size + real media type by magic bytes (never the client's Content-Type), and store it
 * under `<caregiver_id>/<uuid>.<ext>` so storage RLS confines it to this caregiver. The upload and
 * the row both go through the RLS user client — the object folder and the row are scoped to the
 * caller. Ownership of the target patient is checked BEFORE anything is stored. If the metadata
 * insert fails after a successful upload we remove the just-stored object so no orphan is left.
 */
export async function uploadCapsuleAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const file = formData.get("photo");
  if (!(file instanceof File)) return { data: null, error: C.errors.uploadFailed };

  const patientId = formData.get("patientId");
  if (!isUuid(patientId)) return { data: null, error: C.errors.noPatient };

  const rawCaption = formData.get("caption");
  let caption: string | null = null;
  if (typeof rawCaption === "string" && rawCaption.trim() !== "") {
    const parsed = captionSchema.safeParse(rawCaption);
    if (!parsed.success) return { data: null, error: C.errors.generic };
    caption = parsed.data;
  }

  const { user, supabase } = await requireUser();

  // Confirm the caller OWNS this patient before storing anything under their name. RLS also gates
  // the row insert, but gating here avoids uploading bytes for a patient the caller can't attach to.
  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("caregiver_id", user.id)
    .maybeSingle();
  if (patientErr) return failAction("uploadCapsule: patient", patientErr, C.errors.generic);
  if (!patient) return { data: null, error: C.errors.noPatient };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { data: null, error: C.errors.uploadFailed };
  }

  const check = validateCapsuleBytes(bytes);
  if (!check.ok) return { data: null, error: REASON_COPY[check.reason] };
  const mime: CapsuleMime = check.mime;

  const path = capsuleObjectPath(user.id, mime, crypto.randomUUID());
  const { error: uploadErr } = await supabase.storage
    .from(CAPSULE_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadErr) return failAction("uploadCapsule: storage", uploadErr, C.errors.uploadFailed);

  const { data: row, error: insertErr } = await supabase
    .from("memory_capsules")
    .insert({
      patient_id: patientId,
      created_by: user.id,
      storage_path: path,
      kind: check.kind,
      caption,
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    // Row didn't land — drop the object so the caregiver isn't left with a silent orphan.
    await supabase.storage.from(CAPSULE_BUCKET).remove([path]);
    return failAction("uploadCapsule: insert", insertErr, C.errors.uploadFailed);
  }

  revalidatePath("/capsules");
  return { data: { id: row.id }, error: null };
}

/**
 * Remove a capsule: its storage object then its row. Both are RLS-scoped to the caller — a non-owner
 * delete simply matches zero rows. The stored path is re-gated against the caller's uid before it is
 * handed to storage (defense in depth over storage RLS). No service-role client.
 */
export async function removeCapsuleAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = removeCapsuleSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: C.errors.generic };

  const { user, supabase } = await requireUser();

  const { data: row, error: readErr } = await supabase
    .from("memory_capsules")
    .select("id, storage_path")
    .eq("id", parsed.data.capsuleId)
    .maybeSingle();
  if (readErr) return failAction("removeCapsule: read", readErr, C.errors.removeFailed);
  if (!row) return { data: null, error: null }; // already gone (or not the caller's) — idempotent no-op

  if (isOwnedCapsulePath(row.storage_path, user.id)) {
    // Best effort — a failed object removal must not block deleting the metadata row.
    await supabase.storage.from(CAPSULE_BUCKET).remove([row.storage_path]);
  }

  const { error: delErr } = await supabase
    .from("memory_capsules")
    .delete()
    .eq("id", parsed.data.capsuleId);
  if (delErr) return failAction("removeCapsule: delete", delErr, C.errors.removeFailed);

  revalidatePath("/capsules");
  return { data: null, error: null };
}
