"use client";

import { useState } from "react";
import { WIZARD_COPY } from "@/lib/wizard/copy";

const C = WIZARD_COPY.handEntry;

/**
 * Always-available fallback: a plain question/answer form that saves a target directly, with no
 * Claude involvement. Claude failure (or a caregiver who simply prefers to type it) must never block
 * target creation. Persistence + validation happen in `createTargetAction` on submit.
 */
export function HandEntryForm({
  onSave,
  saving,
  error,
}: {
  onSave: (question: string, answer: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const canSave = question.trim() !== "" && answer.trim() !== "" && !saving;

  return (
    <form
      className="flex w-full max-w-2xl flex-col gap-4 rounded-2xl border-2 border-zinc-300 bg-white p-6 text-zinc-900"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(question.trim(), answer.trim());
      }}
    >
      <h2 className="text-xl font-semibold">{C.heading}</h2>
      <p className="text-base text-zinc-600">{C.intro}</p>

      <label className="flex flex-col gap-1 text-base font-medium" htmlFor="hand-question">
        {C.questionLabel}
        <input
          id="hand-question"
          type="text"
          value={question}
          maxLength={120}
          placeholder={C.questionPlaceholder}
          onChange={(e) => setQuestion(e.target.value)}
          className="min-h-[52px] rounded-xl border-2 border-zinc-400 p-3 text-lg font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-base font-medium" htmlFor="hand-answer">
        {C.answerLabel}
        <input
          id="hand-answer"
          type="text"
          value={answer}
          maxLength={40}
          placeholder={C.answerPlaceholder}
          onChange={(e) => setAnswer(e.target.value)}
          className="min-h-[52px] rounded-xl border-2 border-zinc-400 p-3 text-lg font-normal"
        />
      </label>

      <p className="text-base text-zinc-500">{WIZARD_COPY.candidacy.note}</p>

      {error && (
        <p role="alert" className="text-base text-zinc-900">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSave}
        className="min-h-[52px] self-start rounded-xl border-2 border-zinc-900 bg-zinc-900 px-6 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
      >
        {saving ? C.saving : C.save}
      </button>
    </form>
  );
}
