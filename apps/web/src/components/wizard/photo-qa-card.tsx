"use client";

import { useRef, useState } from "react";
import { WIZARD_COPY } from "@/lib/wizard/copy";
import { qaPhotoAction, uploadTargetPhotoAction } from "@/lib/wizard/vision-actions";
import type { PhotoQaResult } from "@/lib/wizard/vision-schema";

const C = WIZARD_COPY.photoQa;
const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * "Check the photo" section on the wizard page — shown once a proposal exists. The caregiver can
 * upload their OWN photo (stored securely, scoped to them, then vision-QA'd) or, when the demo has
 * seeded example photos on disk, check one of those. Either way Claude's verdict — passing the
 * proposal's question + answer so crop advice points at the right subject — shows below. This
 * component never touches the filesystem or storage directly; both paths go through server actions.
 */
export function PhotoQaSection({
  photoOptions,
  target,
  onUploaded,
}: {
  photoOptions: string[];
  target?: { question: string; answer: string };
  /** Fired with the stored object key after a successful upload, so the target can dual-code with
   * the caregiver's own photo. Seeded example checks never fire it (those are not the patient's). */
  onUploaded?: (path: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<PhotoQaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = checking || uploading;

  function begin() {
    setError(null);
    setResult(null);
  }

  async function check(imagePath: string) {
    setSelected(imagePath);
    setChecking(true);
    begin();
    try {
      const res = await qaPhotoAction({ imagePath, ...(target ? { target } : {}) });
      if (res.error !== null) setError(res.error);
      else setResult(res.data);
    } catch {
      setError(C.errors.unavailable);
    } finally {
      setChecking(false);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    begin();
    try {
      const fd = new FormData();
      fd.append("photo", file);
      if (target) {
        fd.append("question", target.question);
        fd.append("answer", target.answer);
      }
      const res = await uploadTargetPhotoAction(fd);
      if (res.error !== null) setError(res.error);
      else {
        setResult(res.data.qa);
        onUploaded?.(res.data.path);
      }
    } catch {
      setError(C.errors.uploadFailed);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    }
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-4 rounded-2xl border-2 border-zinc-300 bg-white p-6 text-zinc-900">
      <h2 className="text-xl font-semibold">{C.heading}</h2>

      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-medium">{C.upload.heading}</h3>
        <p className="text-base text-zinc-600">{C.upload.intro}</p>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          disabled={busy}
          aria-label={C.upload.button}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          className="min-h-[44px] rounded-xl border-2 border-zinc-400 bg-white p-2 text-base text-zinc-900 file:mr-4 file:min-h-[36px] file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:text-base file:font-medium file:text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
        />
        <p className="text-sm text-zinc-500">{C.upload.consent}</p>
        {uploading && <p className="text-base text-zinc-500">{C.upload.uploading}</p>}
      </div>

      {photoOptions.length > 0 && (
        <div className="flex flex-col gap-3 border-t-2 border-zinc-200 pt-4">
          <h3 className="text-lg font-medium">{C.upload.exampleHeading}</h3>
          <div className="flex flex-wrap gap-4">
            {photoOptions.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => check(path)}
                disabled={busy}
                className="min-h-[44px] rounded-xl border-2 border-zinc-400 bg-white px-5 text-base font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
              >
                {checking && selected === path ? C.checking : fileName(path)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-base text-zinc-900">
          {error}
        </p>
      )}
      {result && <PhotoQaCard result={result} />}
    </section>
  );
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Renders one vision QA verdict — icon paired with text (never color alone), reasons, crop advice. */
export function PhotoQaCard({ result }: { result: PhotoQaResult }) {
  const good = result.verdict === "good";
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-zinc-200 bg-zinc-50 p-4">
      <p className="flex items-center gap-2 text-lg font-semibold">
        {good ? <GoodIcon /> : <NeedsWorkIcon />}
        {good ? C.verdictGood : C.verdictNeedsWork}
      </p>

      {result.reasons.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-base font-medium uppercase tracking-wide text-zinc-500">
            {C.reasonsHeading}
          </span>
          <ul className="list-disc pl-8 text-base text-zinc-700">
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {result.cropAdvice && (
        <div className="flex flex-col gap-1 rounded-lg border-l-4 border-zinc-400 bg-white p-3">
          <span className="text-base font-medium uppercase tracking-wide text-zinc-500">
            {C.cropAdviceLabel}
          </span>
          <p className="text-base text-zinc-700">{result.cropAdvice}</p>
        </div>
      )}
    </div>
  );
}

function GoodIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden, paired with a visible label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5 shrink-0 text-zinc-700"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function NeedsWorkIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden, paired with a visible label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5 shrink-0 text-zinc-700"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487 18.549 2.8a1.5 1.5 0 0 1 2.122 2.121l-1.688 1.688m-2.121-2.122L4.5 16.75V19.5h2.75L19.612 7.24m-2.75-2.753 2.75 2.75"
      />
    </svg>
  );
}
