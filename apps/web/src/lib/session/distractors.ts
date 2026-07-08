// Calm, concrete conversation prompts to fill the between-trial wait. No quiz-like memory
// demands — these are for chatting, not practising. Rotation is deterministic (no RNG) so a
// demo run is reproducible.

export const DISTRACTOR_PROMPTS: readonly string[] = [
  "Ask what they'd like for lunch today.",
  "Look out the window together — what's the weather doing?",
  "Ask about a favourite song and hum a little of it.",
  "Talk about a nice smell — coffee, fresh bread, flowers.",
  "Ask what they did for fun as a child.",
  "Point out something colourful nearby and name the colour.",
  "Ask who they'd like to call for a chat this week.",
  "Stretch your arms together and take a slow breath.",
];

export function distractorForTrial(trialCount: number): string {
  return DISTRACTOR_PROMPTS[trialCount % DISTRACTOR_PROMPTS.length];
}
