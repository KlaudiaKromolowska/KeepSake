import type { Outcome } from "@keepsake/core/sr";
import Image from "next/image";
import { useState } from "react";
import { SESSION_COPY } from "@/lib/session/copy";
import { OutcomeButtons } from "./outcome-buttons";

export function ProbeScreen({
  question,
  answer,
  imageUrl,
  onOutcome,
}: {
  question: string;
  answer: string;
  imageUrl: string | null;
  onOutcome: (outcome: Outcome) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

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
      <OutcomeButtons onOutcome={onOutcome} />
    </section>
  );
}
