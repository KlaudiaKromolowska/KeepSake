// User-facing copy for the care-home (organization) surfaces. Wellness-safe, show-data-never-diagnosis
// wording (PLAN §10): "practice", "people", "care home" — never a diagnosis or clinical claim.

export const ORG_COPY = {
  list: {
    title: "Care homes",
    intro:
      "A care home lets a team share the people they support. Staff can run practice with everyone in the home; only admins add people and manage the team.",
    empty: "You're not part of a care home yet. Create one to get started.",
    createHeading: "Create a care home",
    nameLabel: "Care-home name",
    namePlaceholder: "Sunrise Care Home",
    createButton: "Create",
    creating: "Creating…",
    openLink: "Open",
    adminBadge: "Admin",
    staffBadge: "Staff",
    backToHome: "Back to home",
  },
  detail: {
    membersHeading: "Team",
    addMemberLabel: "Colleague's Keepsake account email",
    addMemberPlaceholder: "colleague@example.com",
    roleLabel: "Role",
    addButton: "Add to team",
    adding: "Adding…",
    added: "Added to the team.",
    removeButton: "Remove",
    removing: "Removing…",
    leaveButton: "Leave",
    noMembers: "No team members yet.",
    patientsHeading: "People",
    addPatientHeading: "Add a person",
    nameLabel: "Name or initials",
    namePlaceholder: "e.g. Margaret W.",
    addPatientButton: "Add person",
    addingPatient: "Adding…",
    patientAdded: "Person added.",
    noPatients: "No one has been added yet.",
    adminOnlyHint: "Only an admin can add people or manage the team.",
    backToList: "Back to care homes",
    genericError: "Something went wrong. Please try again.",
  },
} as const;
