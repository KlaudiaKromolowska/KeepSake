// Every user-facing string the session UI shows. Wellness-safe wording only: no disease naming,
// no "wrong"/"fail"/"error", never a red X, no scheduling language. See PLAN.md §8b / task-4 brief.

export const SESSION_COPY = {
  probe: {
    heading: "Time to ask",
    caregiverPrompt: "Ask the question, then tap what happened.",
    answerHint: "The answer is",
  },
  outcomes: {
    recall: "Remembered",
    miss: "Not this time",
    unclear: "Couldn't tell",
  },
  teach: {
    heading: "Let's learn this together",
    instruction: "Read the answer out loud together.",
    done: "Done — let's begin",
  },
  correction: {
    heading: "Here's the answer",
    reassurance: "That's okay — it comes with practice.",
    instruction: "Say it together, gently.",
    done: "We said it together",
  },
  endOnWin: {
    heading: "One more time — together",
    instruction: "Say it together one last time.",
    done: "We said it",
  },
  distractor: {
    heading: "While we wait",
    clockLabel: "Next question in",
    hint: "Keep chatting — the screen will tell you when it's time.",
    adjustWait: "Adjust wait",
    adjustWaitHint: "Pick a different wait if it suits the moment.",
  },
  ended: {
    heading: "Session complete",
    stats: (trials: number, recalls: number) => `Practised ${trials} times · remembered ${recalls}`,
    closeLine: "Lovely work today. Practise again whenever suits you both.",
    masteredLine: "Wonderful — this memory has taken hold.",
    rescope: "This memory might need a different shape. We'll help you adjust it soon.",
    notesLabel: "Session notes (just for you)",
    notesSave: "Save note",
    notesSaved: "Saved",
    home: "Back to home",
  },
  annotations: {
    answerCard: "Answer card",
    answerCardPrompt: "What does the card say?",
    answerCardSave: "Log the card",
  },
  preSession: {
    begin: "Begin today's session",
    resume: "Resume this morning's session",
  },
  shared: {
    endSession: "End session",
    saveError: "Couldn't save — check connection",
    retry: "Retry",
  },
} as const;
