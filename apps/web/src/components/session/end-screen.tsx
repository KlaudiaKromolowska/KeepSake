"use client";

import { useState } from "react";
import { SESSION_COPY } from "@/lib/session/copy";
import type { Affect } from "@/lib/session/schema";
import { AffectButtons } from "./affect-prompt";
import { DebriefPanel } from "./debrief-panel";

export function EndScreen({
  sessionId,
  recalls,
  trials,
  mastered,
  rescopeRequired,
  onSaveNote,
  onAffect,
  onHome,
}: {
  sessionId: string;
  recalls: number;
  trials: number;
  mastered: boolean;
  rescopeRequired: boolean;
  onSaveNote: (note: string) => Promise<boolean>;
  onAffect: (affect: Affect) => void;
  onHome: () => void;
}) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [affectGiven, setAffectGiven] = useState(false);

  async function handleSave() {
    setStatus("saving");
    const ok = await onSaveNote(note);
    setStatus(ok ? "saved" : "error");
  }

  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-white px-6 text-center text-zinc-900">
      <h1 tabIndex={-1} className="text-3xl font-semibold">
        {SESSION_COPY.ended.heading}
      </h1>
      <p className="tabular-nums text-2xl text-zinc-700">
        {SESSION_COPY.ended.stats(trials, recalls)}
      </p>

      <p className="flex items-center gap-3 text-2xl text-zinc-700">
        {mastered && <LaurelIcon />}
        {mastered ? SESSION_COPY.ended.masteredLine : SESSION_COPY.ended.closeLine}
      </p>

      {/* Post-affect (5.4): inline and optional — ignoring it and heading home is the skip. */}
      {affectGiven ? (
        <p role="status" className="text-2xl text-zinc-700">
          {SESSION_COPY.affect.thanks}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-2xl text-zinc-700">{SESSION_COPY.affect.postQuestion}</p>
          <AffectButtons
            onPick={(affect) => {
              setAffectGiven(true);
              onAffect(affect);
            }}
          />
        </div>
      )}

      {rescopeRequired && (
        <p className="flex max-w-xl items-center gap-3 border-l-4 border-amber-700 bg-amber-50 p-4 text-left text-xl text-amber-900">
          <NoticeIcon />
          {SESSION_COPY.ended.rescope}
        </p>
      )}

      <DebriefPanel sessionId={sessionId} />

      <div className="flex w-full max-w-xl flex-col items-start gap-3">
        <label htmlFor="session-note" className="text-xl text-zinc-700">
          {SESSION_COPY.ended.notesLabel}
        </label>
        <textarea
          id="session-note"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setStatus("idle");
          }}
          className="min-h-[120px] w-full max-w-xl rounded-xl border-2 border-zinc-500 p-4 text-xl"
        />
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={note.trim() === "" || status === "saving"}
            className="min-h-[64px] rounded-2xl border-2 border-zinc-900 bg-zinc-900 px-8 text-2xl font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
          >
            {SESSION_COPY.ended.notesSave}
          </button>
          {status === "saved" && (
            <span role="status" className="text-xl text-zinc-700">
              {SESSION_COPY.ended.notesSaved}
            </span>
          )}
          {status === "error" && (
            <span role="status" className="flex items-center gap-3 text-xl text-zinc-700">
              {SESSION_COPY.shared.saveError}
              <button
                type="button"
                onClick={handleSave}
                className="min-h-[64px] rounded-2xl border-2 border-zinc-500 bg-zinc-50 px-6 text-2xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                {SESSION_COPY.shared.retry}
              </button>
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onHome}
        className="min-h-[64px] rounded-2xl border-2 border-zinc-900 bg-white px-8 text-2xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {SESSION_COPY.ended.home}
      </button>
    </section>
  );
}

function LaurelIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, aria-hidden and paired with a visible text label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function NoticeIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, aria-hidden and paired with a visible text label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8.25v4.5m0 3h.008M10.29 3.86 1.82 18a1.5 1.5 0 001.29 2.25h17.78A1.5 1.5 0 0022.18 18L13.71 3.86a1.5 1.5 0 00-2.42 0z"
      />
    </svg>
  );
}
