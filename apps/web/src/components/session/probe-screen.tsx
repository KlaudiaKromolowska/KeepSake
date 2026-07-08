import type { Outcome } from "@keepsake/core/sr";
import Image from "next/image";
import { useState } from "react";
import { SESSION_COPY } from "@/lib/session/copy";
import { useSpeechProbe } from "@/lib/session/use-speech-probe";
import { OutcomeButtons } from "./outcome-buttons";

/** When set, the speech assist listens during this probe and suggests an outcome. */
export interface SpeechProbeConfig {
  targetId: string;
  aliases: readonly string[];
}

export function ProbeScreen({
  question,
  answer,
  imageUrl,
  onOutcome,
  speech,
}: {
  question: string;
  answer: string;
  imageUrl: string | null;
  onOutcome: (outcome: Outcome) => void;
  speech?: SpeechProbeConfig;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const assist = useSpeechProbe({
    enabled: speech !== undefined,
    targetId: speech?.targetId ?? "",
    answer,
    aliases: speech?.aliases ?? [],
  });
  const suggestion = assist.status === "done" ? assist.suggestion : null;

  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-white px-6 text-center text-zinc-900">
      <h1 tabIndex={-1} className="text-3xl font-semibold">
        {SESSION_COPY.probe.heading}
      </h1>
      <p className="max-w-3xl text-5xl font-semibold leading-tight">{question}</p>
      {imageUrl && !imageFailed && (
        <Image
          src={imageUrl}
          alt={question}
          width={480}
          height={480}
          className="max-h-[40vh] w-auto rounded-3xl object-contain"
          onError={() => setImageFailed(true)}
        />
      )}
      <p className="text-2xl text-zinc-700">{SESSION_COPY.probe.caregiverPrompt}</p>
      <p className="text-xl text-zinc-700">
        {SESSION_COPY.probe.answerHint} <strong className="text-zinc-900">{answer}</strong>
      </p>
      {assist.status !== "off" && (
        <p role="status" className="min-h-[1.75rem] text-xl text-zinc-700">
          {assist.status === "listening" && SESSION_COPY.speech.listening}
          {assist.status === "checking" && SESSION_COPY.speech.checking}
          {suggestion === "recall" && SESSION_COPY.speech.heardRecall}
          {suggestion === "miss" && SESSION_COPY.speech.heardMiss}
        </p>
      )}
      <OutcomeButtons onOutcome={onOutcome} suggested={suggestion} />
    </section>
  );
}
