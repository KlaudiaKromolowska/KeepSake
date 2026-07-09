// Every user-facing string for the caregiver coaching copilot (/coach). Caregiver-facing, English
// for the hackathon demo. Wellness-safe wording: no disease naming, no "wrong"/"fail", no clinical
// claims (PLAN.md §10). SESSION_COPY style — a single frozen const so copy lives in one place.

export const COACH_COPY = {
  title: "Talk it through",
  intro:
    "A private space to ask for a hand with practice — how to run the next session, or how to look after yourself on a hard day. The person you practise with never sees this.",
  inputLabel: "Your message",
  placeholder: "e.g. She got frustrated today — should we take a break?",
  send: "Send",
  sending: "Thinking…",
  starterHeading: "Not sure where to start?",
  starters: [
    "She got frustrated today — should we stop for now?",
    "How do I keep tomorrow's session calm?",
    "I'm feeling worn out. Any small things that help?",
  ],
  youLabel: "You",
  coachLabel: "Coach",
  escalateHeading: "This sounds like a moment to reach a real person",
  emptyHint: "Your conversation will appear here.",
  errors: {
    tooLong: "That message is a little long — please shorten it and try again.",
    generic: "The coach isn't available right now. Please try again.",
    signedOut: "Please sign in again to keep talking.",
    quota: "The limit for AI help has been reached for now. Please try again later.",
  },
  retry: "Try again",
  disclaimer:
    "This is caregiver support, not medical advice. It doesn't diagnose or treat anything — for anything clinical or urgent, your doctor or local emergency services are the right call.",
} as const;
