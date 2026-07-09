// User-facing copy for the clinician-sharing surfaces. Wellness-safe, show-data-never-diagnosis
// wording (PLAN §10): "practice data", "for discussion", never a diagnosis or clinical claim.

export const CLINICIAN_COPY = {
  // Clinician-facing (the "discuss with your doctor" audience) — read-only.
  view: {
    title: "Shared with you",
    intro:
      "These people's caregivers have shared their practice data with you, to review and discuss together. This is practice data only — not a diagnosis, and nothing here detects or tracks any medical condition.",
    empty: "No one has shared their practice data with you yet.",
    trendsLink: "View trends",
    progressLink: "View progress",
    backToHome: "Back to home",
    readOnlyBadge: "Read-only",
    backToList: "Back to shared list",
  },
  // Caregiver-facing care-team management (sharing a patient's view with a clinician).
  manage: {
    title: "Share with a clinician",
    intro:
      "Give a clinician read-only access to this person's practice trends, to review together. They can view the data but never change anything.",
    forPatient: (name: string) => `Sharing: ${name}`,
    emailLabel: "Clinician's Keepsake account email",
    emailPlaceholder: "clinician@example.com",
    shareButton: "Share access",
    sharing: "Sharing…",
    shared: "Access shared.",
    currentHeading: "People with access",
    none: "No one has access yet.",
    remove: "Remove",
    removing: "Removing…",
    noActivePatient: "Add a memory target first — then you can share this person's trends.",
    backToHome: "Back to home",
    cardTitle: "Share with a clinician",
    cardHint: "Give a clinician read-only access to the trends.",
  },
} as const;
