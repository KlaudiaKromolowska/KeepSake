/**
 * The caregiver-facing schedule "plan", derived entirely from persisted target_state — nothing new
 * is stored (mirrors due-status.ts).
 *
 * Deliberately DATE-FREE (Monika's rule): the between-session scheduler keeps computing next_due_at
 * and booster cadence to SELECT/order targets and time boosters (see targets/queue.ts), but none of
 * that is surfaced here as a dated prompt or a counter. The plan shows only where the memory sits on
 * its journey; mastery is celebrated, not counted, and a growing gap is framed as a good thing.
 *
 * Journey: mastered_at → where the target sits on acquiring → mastered → maintenance.
 */

export type JourneyKey = "acquiring" | "mastered" | "maintenance";
export type StepStatus = "done" | "current" | "upcoming";
export interface JourneyStep {
  key: JourneyKey;
  status: StepStatus;
}

/**
 * The 3-stage journey. Once mastered the target is in maintenance, so both earlier milestones read
 * as reached; before that only the first stage is current. (There is no runtime "mastered but not
 * yet in maintenance" state — mastery hands straight to the booster loop.)
 */
export function journeySteps(mastered: boolean): JourneyStep[] {
  const order: JourneyKey[] = ["acquiring", "mastered", "maintenance"];
  return order.map((key) => {
    if (mastered) return { key, status: key === "maintenance" ? "current" : "done" };
    return { key, status: key === "acquiring" ? "current" : "upcoming" };
  });
}

export interface SchedulePlanInput {
  masteredAt: string | null;
}

export interface SchedulePlan {
  mastered: boolean;
  steps: JourneyStep[];
}

/** Compose the journey plan the /schedule page renders. Derived from mastered_at; nothing persisted. */
export function schedulePlan(input: SchedulePlanInput): SchedulePlan {
  const mastered = input.masteredAt !== null;
  return { mastered, steps: journeySteps(mastered) };
}
