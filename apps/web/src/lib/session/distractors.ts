// Calm, concrete conversation prompts to fill the between-trial wait. No quiz-like memory
// demands — these are for chatting, not practising. Rotation is deterministic (no RNG) so a
// demo run is reproducible.

export const DISTRACTOR_PROMPTS: readonly string[] = [
  "Ask what they'd like for lunch today.",
  "Look out the window together — what's the weather doing?",
  "Ask about a favourite song and hum a little of it.",
  "Talk about a nice smell — coffee, fresh bread, flowers.",
  "Talk about a game or pastime you both enjoy.",
  "Point out something colourful nearby and name the colour.",
  "Ask who they'd like to call for a chat this week.",
  "Stretch your arms together and take a slow breath.",
];

/**
 * Picks the wait-time prompt for a given trial. `prompts` is the caregiver's personalized set
 * (from `personalizedDistractorsAction`) when available; a missing/empty/short set silently falls
 * back to the static `DISTRACTOR_PROMPTS` list — this feature must never surface as broken.
 */
export function distractorForTrial(trialCount: number, prompts?: readonly string[]): string {
  const list = prompts && prompts.length > 0 ? prompts : DISTRACTOR_PROMPTS;
  return list[trialCount % list.length];
}
