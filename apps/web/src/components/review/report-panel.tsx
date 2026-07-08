"use client";

import { useRef, useState } from "react";
import { REVIEW_COPY } from "@/lib/review/copy";
import { parseMarkdown } from "@/lib/review/markdown";
import { MarkdownView } from "./markdown-view";

type Status = "idle" | "streaming" | "done" | "error";

/**
 * Question input + streamed study report. POSTs /api/rct-report and reads the raw text/plain body
 * with a ReadableStream reader + TextDecoder, re-parsing the markdown as chunks land. Rendering is
 * element-based (MarkdownView) — no dangerouslySetInnerHTML anywhere.
 */
export function ReportPanel() {
  const [question, setQuestion] = useState<string>(REVIEW_COPY.suggestedQuestion);
  const [report, setReport] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string>(REVIEW_COPY.errors.generic);
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  // Guards against a stale stream writing after a newer Analyze click.
  const runIdRef = useRef(0);

  const trimmed = question.trim();
  const canAnalyze = trimmed.length >= 5 && trimmed.length <= 300 && status !== "streaming";

  async function analyze() {
    if (!canAnalyze) return;
    const runId = ++runIdRef.current;
    setStatus("streaming");
    setReport("");
    setCopied("idle");

    try {
      const res = await fetch("/api/rct-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!res.ok || !res.body) {
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (runIdRef.current !== runId) return;
        setReport(text);
      }
      text += decoder.decode();
      if (runIdRef.current !== runId) return;
      setReport(text);
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
            {status === "streaming" ? REVIEW_COPY.analyzing : REVIEW_COPY.analyze}
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
          aria-busy={status === "streaming"}
          className="min-h-[160px] text-lg"
        >
          {blocks.length > 0 ? (
            <MarkdownView blocks={blocks} />
          ) : (
            <p className="text-zinc-500">
              {status === "streaming" ? REVIEW_COPY.analyzing : REVIEW_COPY.reportPlaceholder}
            </p>
          )}
        </div>
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
