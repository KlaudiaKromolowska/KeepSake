import Image from "next/image";
import { SESSION_COPY } from "@/lib/session/copy";

export type AnswerVariant = "teach" | "correction" | "end_on_win";

const VARIANT_COPY = {
  teach: {
    heading: SESSION_COPY.teach.heading,
    instruction: SESSION_COPY.teach.instruction,
    done: SESSION_COPY.teach.done,
    reassurance: null,
  },
  correction: {
    heading: SESSION_COPY.correction.heading,
    instruction: SESSION_COPY.correction.instruction,
    done: SESSION_COPY.correction.done,
    reassurance: SESSION_COPY.correction.reassurance,
  },
  end_on_win: {
    heading: SESSION_COPY.endOnWin.heading,
    instruction: SESSION_COPY.endOnWin.instruction,
    done: SESSION_COPY.endOnWin.done,
    reassurance: null,
  },
} as const satisfies Record<AnswerVariant, unknown>;

export function AnswerScreen({
  variant,
  question,
  answer,
  imageUrl,
  onDone,
}: {
  variant: AnswerVariant;
  question: string;
  answer: string;
  imageUrl: string | null;
  onDone: () => void;
}) {
  const copy = VARIANT_COPY[variant];

  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-white px-6 text-center text-zinc-900">
      <h1 tabIndex={-1} className="text-3xl font-semibold">
        {copy.heading}
      </h1>
      {copy.reassurance && <p className="text-2xl text-zinc-700">{copy.reassurance}</p>}
      <p className="text-3xl text-zinc-700">{question}</p>
      <p className="text-7xl font-bold">{answer}</p>
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={question}
          width={480}
          height={480}
          className="max-h-[40vh] w-auto rounded-3xl object-contain"
        />
      )}
      <p className="text-2xl text-zinc-700">{copy.instruction}</p>
      <button
        type="button"
        onClick={onDone}
        className="min-h-[64px] rounded-2xl border-2 border-zinc-900 bg-zinc-900 px-8 text-2xl font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {copy.done}
      </button>
    </section>
  );
}
