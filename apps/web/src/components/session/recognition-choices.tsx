/**
 * Recognition-probe choices (V2 maintenance/booster format). Large, calm, well-spaced, stacked
 * choice buttons for a dementia patient/caregiver to pick from — big targets, no time pressure, no
 * colour coding that hints at right/wrong. The picked string is passed up verbatim; the caller maps
 * it to the engine's existing recall/miss outcome (`outcomeForPick`) — the reducer is untouched.
 */
export function RecognitionChoices({
  options,
  onPick,
}: {
  options: readonly string[];
  onPick: (option: string) => void;
}) {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className="min-h-[88px] rounded-3xl border-2 border-zinc-400 bg-white px-8 py-4 text-4xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
