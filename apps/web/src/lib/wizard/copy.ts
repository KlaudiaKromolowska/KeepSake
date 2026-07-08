// Every user-facing string the target wizard shows. Caregiver-facing (not the patient), so ≥16px
// text is acceptable, but wording stays wellness-safe: no disease naming, no "wrong"/"fail", no red
// X. Zero string literals in the wizard components — they all read from here (see session/copy.ts).

export const WIZARD_COPY = {
  page: {
    title: "Create a memory target",
    heading: "Create a memory to practise",
    intro:
      "Describe a small, everyday memory you'd like to help hold onto — a name, a place, a routine. Claude will shape it into one clear question, and you can adjust anything before saving.",
    cardHint: "Shape a name, place, or routine into a practice question.",
    descriptionLabel: "Tell us about the memory",
    descriptionHint:
      "For example: “My daughter Sarah visits every Sunday. She keeps forgetting her name.”",
    placeholder: "Describe the memory in your own words…",
    generate: "Ask Claude to shape it",
    generating: "Claude is thinking this through…",
    generatingHint: "Drafting a question, then checking it against the practice rules.",
  },
  dictation: {
    start: "Speak it instead",
    stop: "Stop speaking",
    listening: "Listening — take your time…",
    liveLabel: "What we're hearing",
    unavailable: "Speaking isn't available on this device — you can type it instead.",
  },
  proposal: {
    heading: "Here's a memory target",
    questionLabel: "The question to ask",
    answerLabel: "The answer to practise",
    variantsLabel: "Also accept",
    rationaleLabel: "Why this shape",
    accept: "Use this memory",
    tryAgain: "Ask for another",
    saving: "Saving…",
  },
  critique: {
    heading: "Claude checked its own work",
    firstDraft: "First draft",
    rejectedBecause: "Set aside because",
  },
  redFlags: {
    heading: "A couple of things to keep in mind",
  },
  candidacy: {
    note: "A quick suitability check comes before the first practice session.",
  },
  photoQa: {
    heading: "Check the photo",
    intro: "Ask Claude whether a photo works well as a picture cue for this memory.",
    checking: "Checking…",
    noPhotos: "No example photos are set up yet — upload your own below.",
    verdictGood: "This photo works well",
    verdictNeedsWork: "This photo could work better",
    reasonsHeading: "What Claude noticed",
    cropAdviceLabel: "Suggested crop",
    upload: {
      heading: "Upload your own photo",
      intro: "Choose a photo from this device and Claude will check how well it works as a cue.",
      button: "Choose a photo",
      uploading: "Uploading and checking…",
      // Wellness-safe consent microcopy (PLAN §10): honest, no condition named, data-minimal.
      consent:
        "Your photo stays private to your account and is stored securely in the EU. It's used only to help with this memory practice, and you can remove it at any time. Please upload only a photo you have permission to use.",
      exampleHeading: "Or try an example photo",
    },
    errors: {
      missing: "That photo couldn't be found just now.",
      quota: "Claude's help has paused for a little while. Please try again later.",
      unavailable: "Claude couldn't check that photo just now. Please try again.",
      tooLarge: "That photo is a bit too large — please choose one under 5 MB.",
      badType: "Please choose a JPG, PNG, or WebP photo.",
      uploadFailed: "That photo couldn't be uploaded just now. Please try again.",
    },
  },
  handEntry: {
    toggle: "Enter a memory by hand",
    heading: "Enter a memory by hand",
    intro: "Prefer to write it yourself? Add the question and answer directly.",
    questionLabel: "The question to ask",
    questionPlaceholder: "What is your daughter's name?",
    answerLabel: "The answer",
    answerPlaceholder: "Sarah",
    save: "Save this memory",
    saving: "Saving…",
  },
  success: {
    heading: "Saved",
    body: "This memory is ready. You'll find it on your home screen.",
    home: "Back to home",
    another: "Create another",
  },
  errors: {
    generate: "Claude couldn't shape that just now. You can try again, or enter a memory by hand.",
    refine:
      "Claude's suggestion didn't quite fit the practice rules. You can try again, or enter a memory by hand.",
    quota: "Claude's help has paused for a little while. You can still enter a memory by hand.",
    save: "That couldn't be saved just now. Please try again.",
    noPatient: "Add the person you're caring for first, then create a memory to practise.",
  },
} as const;
