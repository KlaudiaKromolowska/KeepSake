"use client";

import { useRef, useState } from "react";
import { REVIEW_COPY } from "@/lib/review/copy";
import { parseMarkdown } from "@/lib/review/markdown";
import { MarkdownView } from "./markdown-view";

type Status = "idle" | "loading" | "done" | "error";
type TrailEntry = { tool: string; description: string };

/**
 * Question input + agentic study report. POSTs /api/rct-report, which runs Claude's own analysis
 * (tool-use loop) server-side and returns JSON `{ report, trail }`. We render the markdown report
 * (element-based via MarkdownView — no dangerouslySetInnerHTML) plus the ordered "analyses run"
 * trail as the proof-of-agency section.
 */
export function ReportPanel() {
  const [question, setQuestion] = useState<string>(REVIEW_COPY.suggestedQuestion);
  const [report, setReport] = useState("");
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string>(REVIEW_COPY.errors.generic);
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  // Guards against a stale response writing after a newer Analyze click.
  const runIdRef = useRef(0);

  const trimmed = question.trim();
  const canAnalyze = trimmed.length >= 5 && trimmed.length <= 300 && status !== "loading";

  async function analyze() {
    if (!canAnalyze) return;
    const runId = ++runIdRef.current;
    setStatus("loading");
    setReport("");
    setTrail([]);
    setCopied("idle");

    try {
      const res = await fetch("/api/rct-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!res.ok) {
        const fallback =
          res.status === 401
            ? REVIEW_COPY.errors.signedOut
            : res.status === 429
              ? REVIEW_COPY.errors.quota
              : res.status === 404
                ? REVIEW_COPY.errors.noData
                : REVIEW_COPY.errors.generic;
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

      const body = (await res.json()) as { report?: string; trail?: TrailEntry[] };
      if (runIdRef.current !== runId) return;
      if (typeof body.report !== "string") {
        setErrorText(REVIEW_COPY.errors.generic);
        setStatus("error");
        return;
      }
      setReport(body.report);
      setTrail(Array.isArray(body.trail) ? body.trail : []);
      setStatus("done");
    } catch {
      if (runIdRef.current !== runId) return;
      setErrorText(REVIEW_COPY.errors.generic);
      setStatus("error");
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  }

  const blocks = parseMarkdown(report);
  // Precompute keys so no raw array index reaches a key prop (matches MarkdownView).
  const trailItems = trail.map((entry, i) => ({ entry, key: `${entry.tool}-${i}` }));

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label htmlFor="rct-question" className="text-lg font-medium text-zinc-800">
          {REVIEW_COPY.questionLabel}
        </label>
        <textarea
          id="rct-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          placeholder={REVIEW_COPY.questionPlaceholder}
          className="min-h-[88px] w-full rounded-xl border-2 border-zinc-400 bg-white p-4 text-lg text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        />
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={analyze}
            disabled={!canAnalyze}
            className="min-h-[48px] rounded-xl border-2 border-zinc-900 bg-zinc-900 px-8 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
          >
            {status === "loading" ? REVIEW_COPY.analyzing : REVIEW_COPY.analyze}
          </button>
          {trimmed.length > 0 && trimmed.length < 5 && (
            <span role="status" className="text-base text-zinc-700">
              {REVIEW_COPY.errors.tooShort}
            </span>
          )}
        </div>
      </div>

      {status === "error" && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-4 rounded-xl border-l-4 border-amber-700 bg-amber-50 p-4 text-lg text-amber-900"
        >
          {errorText}
          <button
            type="button"
            onClick={analyze}
            className="min-h-[48px] rounded-xl border-2 border-zinc-500 bg-white px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {REVIEW_COPY.retry}
          </button>
        </p>
      )}

      <section
        aria-label={REVIEW_COPY.reportLabel}
        className="rounded-2xl border-2 border-zinc-300 bg-white p-6"
      >
        <div
          role="log"
          aria-live="polite"
          aria-busy={status === "loading"}
          className="min-h-[160px] text-lg"
        >
          {blocks.length > 0 ? (
            <MarkdownView blocks={blocks} />
          ) : (
            <p className="text-zinc-500">
              {status === "loading" ? REVIEW_COPY.analyzing : REVIEW_COPY.reportPlaceholder}
            </p>
          )}
        </div>
        {status === "done" && trail.length > 0 && (
          <div className="mt-6 border-t border-zinc-200 pt-4">
            <h3 className="text-base font-semibold text-zinc-800">{REVIEW_COPY.trailLabel}</h3>
            <p className="mt-1 text-base text-zinc-600">{REVIEW_COPY.trailIntro}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-6 text-base text-zinc-700">
              {trailItems.map(({ entry, key }) => (
                <li key={key}>{entry.description}</li>
              ))}
            </ol>
          </div>
        )}
        {status === "done" && report && (
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-zinc-200 pt-4">
            <button
              type="button"
              onClick={copyReport}
              className="min-h-[48px] rounded-xl border-2 border-zinc-900 bg-white px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              {REVIEW_COPY.copy}
            </button>
            {copied === "ok" && (
              <span role="status" className="text-base text-zinc-700">
                {REVIEW_COPY.copied}
              </span>
            )}
            {copied === "failed" && (
              <span role="status" className="text-base text-zinc-700">
                {REVIEW_COPY.copyFailed}
              </span>
            )}
          </div>
        )}
      </section>

      <p className="text-base text-zinc-600">{REVIEW_COPY.disclaimer}</p>
    </div>
  );
}
