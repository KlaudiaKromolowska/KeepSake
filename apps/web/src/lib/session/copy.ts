// Every user-facing string the session UI shows. Wellness-safe wording only: no disease naming,
// no "wrong"/"fail"/"error", never a red X, no scheduling language. See PLAN.md §8b / task-4 brief.

export const SESSION_COPY = {
  probe: {
    heading: "Time to ask",
    caregiverPrompt: "Ask the question, then tap what happened.",
    answerHint: "The answer is",
    // Recognition (maintenance/booster) probe: the answer sits among the choices, so no hint.
    recognitionPrompt: "Ask the question, then choose the answer together.",
  },
  outcomes: {
    recall: "Remembered",
    miss: "Not this time",
    unclear: "Couldn't tell",
  },
  speech: {
    listening: "Listening…",
    checking: "Checking what we heard…",
    heardRecall: "It sounded like they remembered — tap to confirm.",
    heardMiss: "That didn't sound quite like the answer — you know best.",
    suggested: "Suggested",
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
    waiting: "Waiting",
  },
  ended: {
    heading: "Session complete",
    // Patient-facing: warm, never a scorecard. Raw counts live in the caregiver-only debrief.
    togetherLine: "You spent some lovely time together.",
    closeLine: "Lovely work today. Practise again whenever suits you both.",
    masteredLine: "Wonderful — this memory has taken hold.",
    rescope: "This memory might need a different shape. We'll help you adjust it soon.",
    notesLabel: "Session notes (just for you)",
    notesSave: "Save note",
    notesSaved: "Saved",
    home: "Back to home",
  },
  affect: {
    preHeading: "Before we begin",
    preQuestion: "How are you feeling right now?",
    postQuestion: "And how are you feeling now?",
    content: "Feeling good",
    unsettled: "A bit unsettled",
    skip: "Skip this",
    thanks: "Thank you for sharing.",
  },
  annotations: {
    answerCard: "Answer card",
    answerCardPrompt: "What does the card say?",
    answerCardSave: "Log the card",
  },
  debrief: {
    open: "A private note for you",
    heading: "A private note for you",
    loading: "Writing your note…",
    copy: "Copy note",
    copied: "Copied",
    error: "Couldn't load your note just now.",
    // Caregiver-only tally — the raw counts, kept off the patient-facing summary.
    tally: (trials: number, recalls: number) =>
      `Just for you: remembered ${recalls} of ${trials} practised.`,
  },
  preSession: {
    heading: "Ready when you are",
    prompt: "When you're both settled, tap to begin. There's no rush.",
    begin: "Begin today's session",
    resume: "Resume this morning's session",
    noTarget: "There's nothing set up to practise just yet.",
    startError: "Couldn't start just now — please try again.",
  },
  dashboard: {
    startTitle: "Start today's session",
    startHint: "A few gentle minutes together.",
    noTarget: "No memory is ready to practise yet.",
  },
  shared: {
    endSession: "End session",
    saveError: "Couldn't save — check connection",
    retry: "Retry",
    // Honest, non-duplicative alt text: the targets model has no per-image description field, so we
    // describe the picture's purpose rather than repeating the on-screen question.
    imageAlt: "A photo chosen to help recall this memory",
  },
} as const;
