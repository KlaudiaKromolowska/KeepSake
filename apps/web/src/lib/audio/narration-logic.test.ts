import type { SessionPhase } from "@keepsake/core/sr";
import { describe, expect, it } from "vitest";
import { cueForTransition, cueKeyForTransition, type NarrationState } from "./narration-logic";

type Outcome = "recall" | "miss" | "unclear";

function state(
  phase: SessionPhase,
  outcomes: Outcome[] = [],
  opts: { mastered?: boolean } = {},
): NarrationState {
  return {
    phase,
    trials: outcomes.map((outcome, i) => ({
      intervalSec: 0,
      outcome,
      isScreening: false,
      corrected: outcome === "miss",
      at: i,
    })),
    progress: { mastered: opts.mastered ?? false },
  };
}

describe("cueKeyForTransition — phase entries", () => {
  it("speaks the teach line when the first session opens on teach", () => {
    expect(cueKeyForTransition(null, state("teach"))).toBe("teach");
  });

  it("speaks the question when the start probe mounts (prev = null)", () => {
    expect(cueKeyForTransition(null, state("awaiting_probe"))).toBe("probe");
  });

  it("speaks the question when a wait elapses (distractor → awaiting_probe)", () => {
    expect(cueKeyForTransition(state("distractor"), state("awaiting_probe"))).toBe("probe");
  });

  it("speaks the errorless correction on a confirmed miss", () => {
    expect(
      cueKeyForTransition(
        state("awaiting_probe", ["recall"]),
        state("correcting", ["recall", "miss"]),
      ),
    ).toBe("correction");
  });

  it("speaks the correction when two unclears convert to a confirmed miss", () => {
    expect(
      cueKeyForTransition(
        state("awaiting_probe", ["unclear"]),
        state("correcting", ["unclear", "unclear"]),
      ),
    ).toBe("correction");
  });

  it("speaks the end-on-win line when the session closes on the guaranteed win", () => {
    expect(cueKeyForTransition(state("correcting", ["miss"]), state("end_on_win", ["miss"]))).toBe(
      "end-on-win",
    );
  });

  it("speaks the closing line when the session ends", () => {
    expect(cueKeyForTransition(state("end_on_win", ["recall"]), state("ended", ["recall"]))).toBe(
      "session-end",
    );
  });

  it("speaks the mastered closing line when the session ends mastered", () => {
    expect(
      cueKeyForTransition(
        state("awaiting_probe", []),
        state("ended", ["recall"], { mastered: true }),
      ),
    ).toBe("session-end-mastered");
  });
});

describe("cueKeyForTransition — unclear re-probe (PLAN §4.2)", () => {
  it("stays silent entering the re-probe gap after an unclear (no correction framing)", () => {
    expect(
      cueKeyForTransition(state("awaiting_probe", []), state("distractor", ["unclear"])),
    ).toBeNull();
  });

  it("re-speaks the bare question when the unclear re-probe comes up", () => {
    expect(
      cueKeyForTransition(state("distractor", ["unclear"]), state("awaiting_probe", ["unclear"])),
    ).toBe("probe");
  });
});

describe("cueKeyForTransition — encouragement on recall", () => {
  it("acknowledges a recall when entering the next wait", () => {
    expect(cueKeyForTransition(state("awaiting_probe", []), state("distractor", ["recall"]))).toBe(
      "encourage-1",
    );
  });

  it("rotates through the three variants by recall count, then wraps", () => {
    const nth = (n: number) =>
      cueKeyForTransition(
        state("awaiting_probe", Array<Outcome>(n - 1).fill("recall")),
        state("distractor", Array<Outcome>(n).fill("recall")),
      );
    expect(nth(1)).toBe("encourage-1");
    expect(nth(2)).toBe("encourage-2");
    expect(nth(3)).toBe("encourage-3");
    expect(nth(4)).toBe("encourage-1");
  });

  it("counts only recalls for the rotation", () => {
    expect(
      cueKeyForTransition(
        state("awaiting_probe", ["recall", "miss", "unclear"]),
        state("distractor", ["recall", "miss", "unclear", "recall"]),
      ),
    ).toBe("encourage-2");
  });
});

describe("cueKeyForTransition — silent transitions", () => {
  it("stays silent entering the wait after teach (no trial gained)", () => {
    expect(cueKeyForTransition(state("teach"), state("distractor"))).toBeNull();
  });

  it("stays silent entering the wait after a correction repeat (last trial is the miss)", () => {
    expect(
      cueKeyForTransition(state("correcting", ["miss"]), state("distractor", ["miss"])),
    ).toBeNull();
  });

  it("stays silent on a same-phase update (e.g. interval override during the wait)", () => {
    expect(
      cueKeyForTransition(state("distractor", ["recall"]), state("distractor", ["recall"])),
    ).toBeNull();
  });

  it("stays silent on a resume-mount into the wait, even if the last trial was a recall", () => {
    expect(cueKeyForTransition(null, state("distractor", ["recall"]))).toBeNull();
  });
});

describe("cueForTransition", () => {
  const target = { question: "Where do you keep your keys?", answer: "Lena" };

  it("returns the full cue for a speaking transition", () => {
    expect(cueForTransition(state("distractor"), state("awaiting_probe"), target)).toEqual({
      slug: "probe-lena",
      text: "Where do you keep your keys?",
    });
  });

  it("returns null for a silent transition", () => {
    expect(cueForTransition(state("teach"), state("distractor"), target)).toBeNull();
  });
});
