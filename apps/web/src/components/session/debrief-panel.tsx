"use client";

import { useCallback, useState } from "react";
import { SESSION_COPY } from "@/lib/session/copy";

type Status = "idle" | "streaming" | "done" | "error";

const OPEN_BUTTON =
  "min-h-[64px] rounded-2xl border-2 border-zinc-500 bg-zinc-50 px-8 text-2xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";
const PRIMARY_BUTTON =
  "min-h-[64px] rounded-2xl border-2 border-zinc-900 bg-zinc-900 px-8 text-2xl font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";
const SECONDARY_BUTTON =
  "min-h-[64px] rounded-2xl border-2 border-zinc-500 bg-white px-6 text-xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

/**
 * "A private note for you" — a caregiver-only, never-cut demo beat. Streams the debrief text
 * progressively from POST /api/debrief (plain UTF-8 chunks, not SSE — see the route's doc
 * comment) via a ReadableStream reader, so the note appears word-by-word rather than as one
 * blocking wait. Never shown to the patient.
 */
export function DebriefPanel({
  sessionId,
  trials,
  recalls,
}: {
  sessionId: string;
  trials: number;
  recalls: number;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  // Raw counts belong here, in the caregiver-only debrief — never on the patient-facing summary.
  const tally = (
    <p className="tabular-nums text-lg text-zinc-600">
      {SESSION_COPY.debrief.tally(trials, recalls)}
    </p>
  );

  const start = useCallback(async () => {
    setStatus("streaming");
    setText("");
    setCopied(false);
    try {
      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok || !res.body) throw new Error("debrief request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setText((prev) => prev + chunk);
      }
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, [sessionId]);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  if (status === "idle") {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-3">
        {tally}
        <button type="button" onClick={start} className={OPEN_BUTTON}>
          {SESSION_COPY.debrief.open}
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xl flex-col items-start gap-3">
      {tally}
      <h2 className="text-xl font-medium text-zinc-900">{SESSION_COPY.debrief.heading}</h2>
      <div
        role="log"
        aria-busy={status === "streaming"}
        className="min-h-[80px] w-full whitespace-pre-wrap rounded-xl border-2 border-zinc-300 bg-zinc-50 p-4 text-lg text-zinc-900"
      >
        {text || (status === "streaming" ? SESSION_COPY.debrief.loading : "")}
      </div>

      {status === "error" && (
        <p role="alert" className="flex flex-wrap items-center gap-3 text-xl text-zinc-900">
          {SESSION_COPY.debrief.error}
          <button type="button" onClick={start} className={SECONDARY_BUTTON}>
            {SESSION_COPY.shared.retry}
          </button>
        </p>
      )}

      {status === "done" && (
        <button type="button" onClick={copyToClipboard} className={PRIMARY_BUTTON}>
          {copied ? SESSION_COPY.debrief.copied : SESSION_COPY.debrief.copy}
        </button>
      )}
    </div>
  );
}
