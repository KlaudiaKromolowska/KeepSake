import type { requireUser } from "@/lib/actions";
import { CAPSULE_BUCKET, type CapsuleKind, isOwnedCapsulePath } from "./capsule-file";
import type { Capsule } from "./reward";

type ActionSupabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Signed-URL lifetime for a capsule. One hour comfortably covers a single kiosk session and the
 *  manage screen's thumbnails; short enough that a family-media link is never long-lived. Re-minted
 *  on each session entry / page load. Mirrors the target-photo TTL. */
const CAPSULE_URL_TTL_SEC = 60 * 60;

/**
 * List a patient's capsules with a freshly-signed, short-lived URL for each. The SELECT runs on the
 * RLS user client (own patient only); signing also goes through that client, so storage RLS confines
 * every URL to the caller's own folder — we shape-check the key against the caller's uid first
 * (defense in depth). A capsule whose object can't be signed (bad shape / storage error) is dropped
 * silently rather than breaking the list. Returns [] on any read error — graceful absence everywhere
 * (the kiosk then simply shows no reward; the manage screen shows the empty state).
 */
export async function resolvePatientCapsules(
  supabase: ActionSupabase,
  caregiverId: string,
  patientId: string,
): Promise<Capsule[]> {
  const { data, error } = await supabase
    .from("memory_capsules")
    .select("id, kind, caption, storage_path")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  const out: Capsule[] = [];
  for (const row of data) {
    if (!isOwnedCapsulePath(row.storage_path, caregiverId)) continue;
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from(CAPSULE_BUCKET)
        .createSignedUrl(row.storage_path, CAPSULE_URL_TTL_SEC);
      if (signErr || !signed?.signedUrl) continue;
      out.push({
        id: row.id,
        kind: row.kind as CapsuleKind,
        caption: row.caption,
        url: signed.signedUrl,
      });
    } catch {
      // A thrown storage client never breaks the list — skip this capsule.
    }
  }
  return out;
}
