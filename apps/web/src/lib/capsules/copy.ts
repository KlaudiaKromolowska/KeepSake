/**
 * EN copy for memory capsules — the curation screen + the in-session reward. Wellness-safe framing
 * (§10): warm, family-first, never names a condition. PL deferred to V1 (PLAN §8b).
 */
export const CAPSULE_COPY = {
  manage: {
    title: "Memory capsules",
    intro:
      "Add a few family photos or short videos. When your loved one remembers, we'll show one as a warm little moment — never when they don't.",
    forPatient: (name: string) => `For ${name}`,
    noActivePatient: "Choose someone to care for first, then add their capsules here.",
    uploadHeading: "Add a photo or short video",
    uploadHint: "JPG, PNG, WebP, MP4 or WebM. Keep videos short.",
    uploadButton: "Choose a file",
    captionLabel: "A few words (optional)",
    captionPlaceholder: "e.g. A day at the seaside",
    uploading: "Adding…",
    empty: "No capsules yet — add your first above.",
    remove: "Remove",
    confirmRemove: "Yes, remove",
    cancelRemove: "Keep it",
    removing: "Removing…",
    videoLabel: "Video",
    photoLabel: "Photo",
    consent: "Only you can see these. They're stored privately and never shared with a clinician.",
    backToHome: "Back to home",
    cardTitle: "Memory capsules",
    cardHint: "Curate the family photos & videos shown as recall rewards",
    errors: {
      uploadFailed: "That didn't upload. Please try again.",
      tooLarge: "That file is too large. Photos up to 5 MB, videos up to 25 MB.",
      badType: "That file type isn't supported. Use a JPG, PNG, WebP, MP4 or WebM.",
      removeFailed: "Couldn't remove that just now. Please try again.",
      noPatient: "Choose someone to care for first.",
      generic: "Something went wrong. Please try again.",
    },
  },
  reward: {
    heading: "A moment for you",
    keepGoing: "Keep going",
  },
} as const;
