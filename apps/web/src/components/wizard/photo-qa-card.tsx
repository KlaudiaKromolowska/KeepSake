"use client";

import { useState } from "react";
import { WIZARD_COPY } from "@/lib/wizard/copy";
import { qaPhotoAction } from "@/lib/wizard/vision-actions";
import type { PhotoQaResult } from "@/lib/wizard/vision-schema";

const C = WIZARD_COPY.photoQa;

/**
 * "Check the photo" section on the wizard page — shown once a proposal exists. Lists one button per
 * candidate photo the page found on disk (server-checked; this component never touches the
 * filesystem). Tapping a button runs the vision QA action and shows its verdict below. An empty
 * `photoOptions` list means no seeded photo exists yet (a Phase-6 asset deliverable) — shows a calm
 * line rather than an empty section.
 */
export function PhotoQaSection({ photoOptions }: { photoOptions: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PhotoQaResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(imagePath: string) {
    setSelected(imagePath);
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await qaPhotoAction({ imagePath });
      if (res.error !== null) setError(res.error);
      else setResult(res.data);
    } catch {
      setError(C.errors.unavailable);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-4 rounded-2xl border-2 border-zinc-300 bg-white p-6 text-zinc-900">
      <h2 className="text-xl font-semibold">{C.heading}</h2>
      {photoOptions.length === 0 ? (
        <p className="text-base text-zinc-600">{C.noPhotos}</p>
      ) : (
        <>
          <p className="text-base text-zinc-600">{C.intro}</p>
          <div className="flex flex-wrap gap-4">
            {photoOptions.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => check(path)}
                disabled={checking}
                className="min-h-[44px] rounded-xl border-2 border-zinc-400 bg-white px-5 text-base font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
              >
                {checking && selected === path ? C.checking : fileName(path)}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-base text-zinc-900">
              {error}
            </p>
          )}
          {result && <PhotoQaCard result={result} />}
        </>
      )}
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
