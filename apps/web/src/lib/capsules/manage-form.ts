import type { ActionResult } from "@/lib/actions";

/**
 * Imperative glue for the capsule-curation UI, kept out of the `"use client"` component so it is
 * unit-testable without a DOM: build the exact payload each server action expects, then call it.
 * The actions themselves do all validation + RLS/ownership gating — these only shape the request.
 */

/** Multipart payload the upload action reads: the file under `photo`, the owning patient, and a
 *  trimmed caption (omitted when blank — data minimization, matches the action's own handling). */
export function buildUploadForm(patientId: string, file: File, caption: string): FormData {
  const fd = new FormData();
  fd.append("photo", file);
  fd.append("patientId", patientId);
  const trimmed = caption.trim();
  if (trimmed !== "") fd.append("caption", trimmed);
  return fd;
}

/** Post an upload through the injected action (the real one in the component, a stub in tests). */
export function submitUpload(
  action: (fd: FormData) => Promise<ActionResult<{ id: string }>>,
  patientId: string,
  file: File,
  caption: string,
): Promise<ActionResult<{ id: string }>> {
  return action(buildUploadForm(patientId, file, caption));
}

/** Remove one capsule through the injected action; the action re-validates the id shape server-side. */
export function submitRemove(
  action: (input: { capsuleId: string }) => Promise<ActionResult<null>>,
  capsuleId: string,
): Promise<ActionResult<null>> {
  return action({ capsuleId });
}

/**
 * The `confirmingId` to hold after a remove attempt settles. On success it clears (the item is
 * gone). On failure it stays on the capsule that failed, so the still-open confirm UI — and the
 * error message rendered alongside it — stay associated with the item that actually failed, rather
 * than being cleared before the error is known.
 */
export function confirmingIdAfterRemove(capsuleId: string, error: string | null): string | null {
  return error === null ? null : capsuleId;
}
