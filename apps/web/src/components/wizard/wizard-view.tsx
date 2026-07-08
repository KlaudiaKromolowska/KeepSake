"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTargetAction, generateTargetAction } from "@/lib/wizard/actions";
import { WIZARD_COPY } from "@/lib/wizard/copy";
import { joinPhrase } from "@/lib/wizard/dictation";
import type { WizardProposal } from "@/lib/wizard/schema";
import { DictationControl } from "./dictation-control";
import { HandEntryForm } from "./hand-entry-form";
import { PhotoQaSection } from "./photo-qa-card";
import { ProposalCard } from "./proposal-card";

const C = WIZARD_COPY;

/**
 * Client orchestrator for the target wizard. Describe → Claude proposes (with visible self-critique)
 * → accept saves it. The hand-entry form is ALWAYS reachable so a Claude failure never blocks target
 * creation. Nothing persists until an explicit Accept/Save tap; errors are calm and never show raw
 * server text.
 */
export function WizardView({ photoOptions }: { photoOptions: string[] }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<WizardProposal | null>(null);
  const [handOpen, setHandOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const busy = generating || saving;

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setProposal(null);
    try {
      const res = await generateTargetAction({ description: description.trim() });
      if (res.error !== null) setGenError(res.error);
      else setProposal(res.data);
    } catch {
      setGenError(C.errors.generate);
    } finally {
      setGenerating(false);
    }
  }

  async function persist(input: {
    question: string;
    answer: string;
    acceptedVariants: string[];
    answerFormat: "free_recall" | "recognition";
  }) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await createTargetAction(input);
      if (res.error !== null) setSaveError(res.error);
      else setSaved(true);
    } catch {
      setSaveError(C.errors.save);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDescription("");
    setProposal(null);
    setGenError(null);
    setHandOpen(false);
    setSaveError(null);
    setSaved(false);
  }

  if (saved) {
    return (
      <section className="flex w-full max-w-2xl flex-col items-center gap-6 rounded-2xl border-2 border-zinc-300 bg-white p-8 text-center text-zinc-900">
        <h2 className="text-2xl font-semibold">{C.success.heading}</h2>
        <p className="text-lg text-zinc-700">{C.success.body}</p>
        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="min-h-[52px] rounded-xl border-2 border-zinc-900 bg-zinc-900 px-6 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {C.success.home}
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-h-[52px] rounded-xl border-2 border-zinc-400 bg-white px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {C.success.another}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col items-stretch gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-lg font-medium text-zinc-900" htmlFor="wizard-description">
          {C.page.descriptionLabel}
        </label>
        <p className="text-base text-zinc-600">{C.page.descriptionHint}</p>
        <textarea
          id="wizard-description"
          value={description}
          maxLength={500}
          placeholder={C.page.placeholder}
          onChange={(e) => {
            setDescription(e.target.value);
            setGenError(null);
          }}
          className="min-h-[120px] w-full rounded-xl border-2 border-zinc-400 p-3 text-lg text-zinc-900"
        />
        <DictationControl
          onTranscript={(text) => {
            setDescription((d) => joinPhrase(d, text).slice(0, 500));
            setGenError(null);
          }}
        />
        <button
          type="button"
          onClick={generate}
          disabled={description.trim().length < 10 || busy}
          className="min-h-[52px] self-start rounded-xl border-2 border-zinc-900 bg-zinc-900 px-6 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
        >
          {generating ? C.page.generating : C.page.generate}
        </button>
        {generating && <p className="text-base text-zinc-500">{C.page.generatingHint}</p>}
        {genError && (
          <p role="alert" className="text-base text-zinc-900">
            {genError}
          </p>
        )}
      </div>

      {proposal && (
        <ProposalCard
          proposal={proposal}
          saving={saving}
          busy={busy}
          onAccept={() =>
            persist({
              question: proposal.question,
              answer: proposal.answer,
              acceptedVariants: proposal.acceptedVariants,
              answerFormat: proposal.answerFormat,
            })
          }
          onTryAgain={generate}
        />
      )}

      {proposal && (
        <PhotoQaSection
          photoOptions={photoOptions}
          target={{ question: proposal.question, answer: proposal.answer }}
        />
      )}

      <div className="flex flex-col gap-4">
        <button
          type="button"
          aria-expanded={handOpen}
          onClick={() => setHandOpen((open) => !open)}
          className="min-h-[44px] self-start text-lg font-medium text-zinc-700 underline underline-offset-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {C.handEntry.toggle}
        </button>
        {handOpen && (
          <HandEntryForm
            saving={saving}
            error={saveError}
            onSave={(question, answer) =>
              persist({ question, answer, acceptedVariants: [], answerFormat: "free_recall" })
            }
          />
        )}
      </div>

      {saveError && !handOpen && (
        <p role="alert" className="text-base text-zinc-900">
          {saveError}
        </p>
      )}
    </div>
  );
}
