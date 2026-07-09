"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { removeCapsuleAction, uploadCapsuleAction } from "@/lib/capsules/actions";
import { CAPSULE_COPY } from "@/lib/capsules/copy";
import { submitRemove, submitUpload } from "@/lib/capsules/manage-form";
import type { Capsule } from "@/lib/capsules/reward";

const C = CAPSULE_COPY.manage;
// Photos + the two video formats the reward can play. The bytes are re-sniffed server-side — this
// only filters the picker; a lying Content-Type never reaches storage (validateCapsuleBytes).
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm";

/**
 * Caregiver curation of one patient's memory capsules: add a family photo/short video (optional
 * caption) and remove any. Every read/write is a server action — auth-gated, ownership-gated, RLS'd;
 * this component only drives them and refreshes the server-rendered list. Never a service-role path,
 * never the kiosk. Removal uses an inline two-step confirm (no native `confirm()` dialog) so a stray
 * tap on a touch device can't delete a family memory.
 */
export function CapsuleManager({
  patientId,
  capsules,
}: {
  patientId: string;
  capsules: Capsule[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const res = await submitUpload(uploadCapsuleAction, patientId, file, caption);
      if (res.error !== null) {
        setError(res.error);
        return;
      }
      setFile(null);
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function remove(capsuleId: string) {
    setError(null);
    startTransition(async () => {
      const res = await submitRemove(removeCapsuleAction, capsuleId);
      setConfirmingId(null);
      if (res.error !== null) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <form
        onSubmit={add}
        className="flex flex-col gap-4 rounded-2xl border-2 border-zinc-300 bg-white p-6 text-zinc-900"
      >
        <h2 className="text-xl font-semibold">{C.uploadHeading}</h2>
        <p className="text-base text-zinc-600">{C.uploadHint}</p>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          disabled={isPending}
          aria-label={C.uploadButton}
          onChange={(e) => {
            setError(null);
            setFile(e.target.files?.[0] ?? null);
          }}
          className="min-h-[44px] rounded-xl border-2 border-zinc-400 bg-white p-2 text-base text-zinc-900 file:mr-4 file:min-h-[36px] file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:text-base file:font-medium file:text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
        />
        <label htmlFor="capsule-caption" className="text-lg font-medium">
          {C.captionLabel}
        </label>
        <input
          id="capsule-caption"
          type="text"
          maxLength={120}
          disabled={isPending}
          placeholder={C.captionPlaceholder}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="h-[56px] w-full rounded-xl border border-zinc-300 px-4 text-xl"
        />
        <button
          type="submit"
          disabled={isPending || !file}
          className="h-[56px] w-full rounded-xl bg-zinc-900 text-xl font-medium text-white disabled:opacity-50"
        >
          {isPending ? C.uploading : C.uploadButton}
        </button>
        <p className="text-sm text-zinc-500">{C.consent}</p>
        {error && (
          <p role="alert" className="text-base text-zinc-900">
            {error}
          </p>
        )}
      </form>

      {capsules.length === 0 ? (
        <p className="text-lg text-zinc-600">{C.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {capsules.map((capsule) => (
            <li
              key={capsule.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4"
            >
              {capsule.kind === "video" ? (
                // biome-ignore lint/a11y/useMediaCaption: family clip with no caption track; the optional text caption below labels it.
                <video
                  src={capsule.url}
                  controls
                  preload="metadata"
                  aria-label={capsule.caption ?? C.videoLabel}
                  className="aspect-square w-full rounded-xl bg-black object-contain"
                />
              ) : (
                // biome-ignore lint/performance/noImgElement: private family media on a short-lived signed URL — deliberately not routed through next/image's optimizer cache.
                <img
                  src={capsule.url}
                  alt={capsule.caption ?? C.photoLabel}
                  className="aspect-square w-full rounded-xl object-cover"
                />
              )}
              {capsule.caption && <p className="text-base text-zinc-700">{capsule.caption}</p>}
              {confirmingId === capsule.id ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => remove(capsule.id)}
                    className="min-h-[44px] flex-1 rounded-lg bg-zinc-900 px-4 text-base font-medium text-white disabled:opacity-50"
                  >
                    {isPending ? C.removing : C.confirmRemove}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setConfirmingId(null)}
                    className="min-h-[44px] flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium text-zinc-700 disabled:opacity-50"
                  >
                    {C.cancelRemove}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setConfirmingId(capsule.id)}
                  className="min-h-[44px] rounded-lg border border-zinc-300 px-4 text-base font-medium text-zinc-700 disabled:opacity-50"
                >
                  {C.remove}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
