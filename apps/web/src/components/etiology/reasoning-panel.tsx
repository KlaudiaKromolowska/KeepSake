"use client";

import { useRef, useState } from "react";
import { STREAM_JSON_SENTINEL } from "@/lib/ai/stream-sentinel";
import { ETIOLOGY_COPY } from "@/lib/etiology/copy";
import type { EtiologyRecommendation } from "@/lib/etiology/schema";

type Status = "idle" | "streaming" | "done" | "error";

const PRIMARY_BUTTON =
  "min-h-[48px] rounded-xl border-2 border-zinc-900 bg-zinc-900 px-8 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50";
const SECONDARY_BUTTON =
  "min-h-[48px] rounded-xl border-2 border-zinc-500 bg-white px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

/**
 * Streams POST /api/etiology and renders it in two parts: Claude's visible extended-thinking
 * reasoning (live, labelled as reasoning-in-progress), then the reconciled recommendation card. The
 * body is raw text — reasoning, then STREAM_JSON_SENTINEL, then a JSON line. Split on the LAST
 * sentinel occurrence (the server appends it right before the JSON), parse at stream end.
 */
export function ReasoningPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [reasoning, setReasoning] = useState("");
  const [rec, setRec] = useState<EtiologyRecommendation | null>(null);
  const [errorText, setErrorText] = useState<string>(ETIOLOGY_COPY.errors.generic);
  const runIdRef = useRef(0);

  async function run() {
    const runId = ++runIdRef.current;
    setStatus("streaming");
    setReasoning("");
    setRec(null);

    try {
      const res = await fetch("/api/etiology", { method: "POST" });
      if (!res.ok || !res.body) {
        const fallback =
          res.status === 401
            ? ETIOLOGY_COPY.errors.signedOut
            : res.status === 429
              ? ETIOLOGY_COPY.errors.quota
              : res.status === 404
                ? ETIOLOGY_COPY.errors.noData
                : ETIOLOGY_COPY.errors.generic;
        let message: string = fallback;
        try {
          const body = (await res.json()) as { error?: string };
          if (res.status !== 401 && typeof body.error === "string") message = body.error;
        } catch {
          // non-JSON error body — keep the fallback copy
        }
        if (runIdRef.current !== runId) return;
        setErrorText(message);
        setStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (runIdRef.current !== runId) return;
        const idx = buffer.lastIndexOf(STREAM_JSON_SENTINEL);
        setReasoning(idx === -1 ? buffer : buffer.slice(0, idx));
      }
      buffer += decoder.decode();
      if (runIdRef.current !== runId) return;

      const idx = buffer.lastIndexOf(STREAM_JSON_SENTINEL);
      if (idx === -1) {
        setErrorText(ETIOLOGY_COPY.errors.generic);
        setStatus("error");
        return;
      }
      setReasoning(buffer.slice(0, idx));
      try {
        setRec(
          JSON.parse(buffer.slice(idx + STREAM_JSON_SENTINEL.length)) as EtiologyRecommendation,
        );
      } catch {
        setErrorText(ETIOLOGY_COPY.errors.generic);
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      if (runIdRef.current !== runId) return;
      setErrorText(ETIOLOGY_COPY.errors.generic);
      setStatus("error");
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {status === "idle" && (
        <button type="button" onClick={run} className={PRIMARY_BUTTON}>
          {ETIOLOGY_COPY.start}
        </button>
      )}

      {status === "error" && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-4 rounded-xl border-l-4 border-amber-700 bg-amber-50 p-4 text-lg text-amber-900"
        >
          {errorText}
          <button type="button" onClick={run} className={SECONDARY_BUTTON}>
            {ETIOLOGY_COPY.retry}
          </button>
        </p>
      )}

      {status !== "idle" && status !== "error" && (
        <section
          aria-label={ETIOLOGY_COPY.reasoningHeading}
          className="rounded-2xl border-2 border-zinc-300 bg-white p-6"
        >
          <h2 className="mb-3 text-xl font-medium text-zinc-900">
            {ETIOLOGY_COPY.reasoningHeading}
          </h2>
          <div
            role="log"
            aria-live="polite"
            aria-busy={status === "streaming"}
            className="min-h-[120px] whitespace-pre-wrap text-lg text-zinc-800"
          >
            {reasoning || (status === "streaming" ? ETIOLOGY_COPY.streaming : "")}
          </div>
        </section>
      )}

      {status === "done" && rec && <RecommendationCard rec={rec} />}
    </div>
  );
}

function RecommendationCard({ rec }: { rec: EtiologyRecommendation }) {
  return (
    <section
      aria-label={ETIOLOGY_COPY.recommendationHeading}
      className="flex flex-col gap-4 rounded-2xl border-2 border-zinc-900 bg-zinc-50 p-6"
    >
      <h2 className="text-xl font-semibold text-zinc-900">{ETIOLOGY_COPY.recommendationHeading}</h2>

      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {ETIOLOGY_COPY.formatLabel}
        </p>
        <p className="text-lg text-zinc-900">{ETIOLOGY_COPY.format[rec.answerFormat]}</p>
        <p className="mt-1 text-base text-zinc-600">{ETIOLOGY_COPY.deterministicNote}</p>
        <p className="text-base text-zinc-600">{rec.deterministicRationale}</p>
      </div>

      {rec.contradicted && (
        <p className="rounded-xl border-l-4 border-amber-700 bg-amber-50 p-3 text-base text-amber-900">
          {ETIOLOGY_COPY.contradictedNote}
        </p>
      )}

      {!rec.modelAvailable && (
        <p className="text-base text-zinc-600">{ETIOLOGY_COPY.modelUnavailableNote}</p>
      )}

      {rec.responseWindow && (
        <Field label={ETIOLOGY_COPY.responseWindowLabel} value={rec.responseWindow} />
      )}
      {rec.cueModality && <Field label={ETIOLOGY_COPY.cueModalityLabel} value={rec.cueModality} />}
      {rec.why && <Field label={ETIOLOGY_COPY.whyLabel} value={rec.why} />}

      <p className="border-t border-zinc-200 pt-3 text-sm text-zinc-500">
        {ETIOLOGY_COPY.disclaimer}
      </p>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-lg text-zinc-900">{value}</p>
    </div>
  );
}
