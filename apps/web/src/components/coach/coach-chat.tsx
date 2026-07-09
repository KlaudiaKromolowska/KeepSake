"use client";

import { useRef, useState } from "react";
import { COACH_COPY } from "@/lib/coach/copy";
import { COACH_MAX_CONTENT } from "@/lib/coach/schema";
import { FOOTER_COPY } from "@/lib/copy";

type Status = "idle" | "loading" | "error";
type Msg = { role: "user" | "assistant"; content: string; escalate?: boolean };

/**
 * Private caregiver coaching chat. POSTs the whole conversation to /api/coach, which runs the
 * boundaried copilot server-side and returns zod-validated `{ reply, escalate }`. When `escalate`
 * is set, we elevate a crisis pointer (the app-wide crisis line) above the reply — a deterministic,
 * code-controlled safety surface that does not depend on the model's exact wording. Text is rendered
 * as plain strings (no markdown, no dangerouslySetInnerHTML).
 */
export function CoachChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string>(COACH_COPY.errors.generic);
  const runIdRef = useRef(0);

  const trimmed = input.trim();
  const tooLong = trimmed.length > COACH_MAX_CONTENT;
  const canSend = trimmed.length > 0 && !tooLong && status !== "loading";

  async function sendHistory(history: Msg[]) {
    const runId = ++runIdRef.current;
    setStatus("loading");
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const fallback =
          res.status === 401
            ? COACH_COPY.errors.signedOut
            : res.status === 429
              ? COACH_COPY.errors.quota
              : COACH_COPY.errors.generic;
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

      const body = (await res.json()) as { reply?: unknown; escalate?: unknown };
      if (runIdRef.current !== runId) return;
      if (typeof body.reply !== "string" || typeof body.escalate !== "boolean") {
        setErrorText(COACH_COPY.errors.generic);
        setStatus("error");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: body.reply as string, escalate: body.escalate as boolean },
      ]);
      setStatus("idle");
    } catch {
      if (runIdRef.current !== runId) return;
      setErrorText(COACH_COPY.errors.generic);
      setStatus("error");
    }
  }

  function send(text: string) {
    const value = text.trim();
    if (value.length === 0 || value.length > COACH_MAX_CONTENT || status === "loading") return;
    const history: Msg[] = [...messages, { role: "user", content: value }];
    setMessages(history);
    setInput("");
    void sendHistory(history);
  }

  // Retry resends the existing history (its last turn is the caregiver's unanswered message).
  function retry() {
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") return;
    void sendHistory(messages);
  }

  const items = messages.map((m, i) => ({ m, key: `${m.role}-${i}` }));

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <section
        aria-label="Conversation"
        role="log"
        aria-live="polite"
        aria-busy={status === "loading"}
        className="flex min-h-[200px] flex-col gap-4 rounded-2xl border-2 border-zinc-300 bg-white p-5"
      >
        {items.length === 0 && <p className="text-zinc-500">{COACH_COPY.emptyHint}</p>}

        {items.map(({ m, key }) =>
          m.role === "user" ? (
            <div key={key} className="flex flex-col items-end gap-1">
              <span className="text-sm font-medium text-zinc-500">{COACH_COPY.youLabel}</span>
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-3 text-lg text-white">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={key} className="flex flex-col items-start gap-1">
              <span className="text-sm font-medium text-zinc-500">{COACH_COPY.coachLabel}</span>
              {m.escalate && (
                <div
                  role="alert"
                  className="max-w-[95%] rounded-2xl border-l-4 border-amber-700 bg-amber-50 px-4 py-3 text-lg text-amber-900"
                >
                  <p className="font-semibold">{COACH_COPY.escalateHeading}</p>
                  <p className="mt-1">{FOOTER_COPY.crisis}</p>
                </div>
              )}
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-100 px-4 py-3 text-lg text-zinc-900">
                {m.content}
              </p>
            </div>
          ),
        )}

        {status === "loading" && (
          <p role="status" className="text-lg text-zinc-500">
            {COACH_COPY.sending}
          </p>
        )}
      </section>

      {status === "error" && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-4 rounded-xl border-l-4 border-amber-700 bg-amber-50 p-4 text-lg text-amber-900"
        >
          {errorText}
          <button
            type="button"
            onClick={retry}
            className="min-h-[48px] rounded-xl border-2 border-zinc-500 bg-white px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {COACH_COPY.retry}
          </button>
        </p>
      )}

      {messages.length === 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-base font-medium text-zinc-600">{COACH_COPY.starterHeading}</span>
          <div className="flex flex-col gap-2">
            {COACH_COPY.starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={status === "loading"}
                className="min-h-[48px] rounded-xl border-2 border-zinc-300 bg-white px-4 py-2 text-left text-lg text-zinc-800 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="coach-input" className="text-lg font-medium text-zinc-800">
          {COACH_COPY.inputLabel}
        </label>
        <textarea
          id="coach-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={COACH_MAX_CONTENT}
          placeholder={COACH_COPY.placeholder}
          className="min-h-[88px] w-full rounded-xl border-2 border-zinc-400 bg-white p-4 text-lg text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        />
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={!canSend}
            className="min-h-[48px] rounded-xl border-2 border-zinc-900 bg-zinc-900 px-8 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
          >
            {status === "loading" ? COACH_COPY.sending : COACH_COPY.send}
          </button>
          {tooLong && (
            <span role="status" className="text-base text-amber-800">
              {COACH_COPY.errors.tooLong}
            </span>
          )}
        </div>
      </form>

      <p className="text-base text-zinc-600">{COACH_COPY.disclaimer}</p>
    </div>
  );
}
