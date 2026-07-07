import { describe, expect, it } from "vitest";
import type { CandidacyState } from "./candidacy";
import { candidacyReduce, currentLevelSec, initialCandidacyState } from "./candidacy";
import { DEFAULT_SR_CONFIG } from "./config";

const config = DEFAULT_SR_CONFIG;

/** Freezes state + nested arrays so any accidental mutation throws in strict mode. */
function frozen(state: CandidacyState): CandidacyState {
  Object.freeze(state.trials);
  return Object.freeze(state);
}

describe("initialCandidacyState", () => {
  it("starts in_progress at level 0 with nothing consumed", () => {
    const state = initialCandidacyState();
    expect(state).toEqual({
      levelIndex: 0,
      attemptsUsed: 0,
      unclearRun: 0,
      status: "in_progress",
      correctionRequired: false,
      trials: [],
    });
  });
});

describe("currentLevelSec", () => {
  it("returns the seconds for the current level while in progress", () => {
    expect(currentLevelSec(initialCandidacyState(), config)).toBe(0);
  });

  it("returns null once the screen has passed", () => {
    let state = frozen(initialCandidacyState());
    for (let i = 0; i < config.candidacyLevelsSec.length; i++) {
      state = frozen(
        candidacyReduce(state, { type: "probe_result", outcome: "recall", at: i }, config),
      );
    }
    expect(state.status).toBe("passed");
    expect(currentLevelSec(state, config)).toBeNull();
  });

  it("returns null once the screen has failed", () => {
    let state = frozen(initialCandidacyState());
    for (let i = 0; i < config.candidacyAttemptsPerLevel; i++) {
      state = frozen(
        candidacyReduce(state, { type: "probe_result", outcome: "miss", at: i }, config),
      );
      state = frozen(candidacyReduce(state, { type: "correction_done", at: i }, config));
    }
    expect(state.status).toBe("failed");
    expect(currentLevelSec(state, config)).toBeNull();
  });
});

describe("candidacyReduce — straight pass", () => {
  it("passes on 3 straight recalls, advancing 0 -> 15 -> 30", () => {
    let state = frozen(initialCandidacyState());

    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "recall", at: 1 }, config),
    );
    expect(state.levelIndex).toBe(1);
    expect(state.status).toBe("in_progress");

    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "recall", at: 2 }, config),
    );
    expect(state.levelIndex).toBe(2);
    expect(state.status).toBe("in_progress");

    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "recall", at: 3 }, config),
    );
    expect(state.status).toBe("passed");

    expect(state.trials).toHaveLength(3);
    expect(state.trials.map((t) => t.intervalSec)).toEqual([0, 15, 30]);
    expect(state.trials.every((t) => t.outcome === "recall")).toBe(true);
    expect(state.trials.every((t) => t.isScreening)).toBe(true);
    expect(state.trials.every((t) => t.corrected === false)).toBe(true);
  });
});

describe("candidacyReduce — fail at level 0", () => {
  it("fails after 3 misses, owing a correction after each one including the last", () => {
    let state = frozen(initialCandidacyState());

    for (let miss = 1; miss <= 2; miss++) {
      const before = state;
      state = frozen(
        candidacyReduce(state, { type: "probe_result", outcome: "miss", at: miss }, config),
      );
      expect(state.attemptsUsed).toBe(miss);
      expect(state.correctionRequired).toBe(true);
      expect(state.status).toBe("in_progress");
      expect(state.levelIndex).toBe(0);

      // A stray probe while correction is owed is a no-op.
      const strayProbe = candidacyReduce(
        state,
        { type: "probe_result", outcome: "recall", at: miss },
        config,
      );
      expect(strayProbe).toBe(state);
      expect(before).not.toBe(state);

      state = frozen(candidacyReduce(state, { type: "correction_done", at: miss }, config));
      expect(state.correctionRequired).toBe(false);
    }

    // Third miss fails the screen but the correction is still owed.
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "miss", at: 3 }, config),
    );
    expect(state.attemptsUsed).toBe(3);
    expect(state.status).toBe("failed");
    expect(state.correctionRequired).toBe(true);

    // Further probes no-op once failed.
    const strayAfterFail = candidacyReduce(
      state,
      { type: "probe_result", outcome: "recall", at: 4 },
      config,
    );
    expect(strayAfterFail).toBe(state);

    // The owed correction can still be delivered after failure.
    state = frozen(candidacyReduce(state, { type: "correction_done", at: 4 }, config));
    expect(state.correctionRequired).toBe(false);
    expect(state.status).toBe("failed");

    // A second correction_done with nothing pending is a no-op.
    const strayCorrection = candidacyReduce(state, { type: "correction_done", at: 5 }, config);
    expect(strayCorrection).toBe(state);

    expect(state.trials).toHaveLength(3);
    expect(state.trials.every((t) => t.intervalSec === 0)).toBe(true);
    expect(state.trials.every((t) => t.outcome === "miss")).toBe(true);
    expect(state.trials.every((t) => t.corrected === true)).toBe(true);
  });
});

describe("candidacyReduce — pass after misses at a middle level", () => {
  it("passes level 1 (15s) after 2 misses then a recall", () => {
    let state = frozen(initialCandidacyState());
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "recall", at: 1 }, config),
    );
    expect(state.levelIndex).toBe(1);

    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "miss", at: 2 }, config),
    );
    state = frozen(candidacyReduce(state, { type: "correction_done", at: 2 }, config));
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "miss", at: 3 }, config),
    );
    expect(state.attemptsUsed).toBe(2);
    expect(state.status).toBe("in_progress");
    state = frozen(candidacyReduce(state, { type: "correction_done", at: 3 }, config));

    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "recall", at: 4 }, config),
    );
    expect(state.levelIndex).toBe(2);
    expect(state.attemptsUsed).toBe(0);
    expect(state.unclearRun).toBe(0);
    expect(state.correctionRequired).toBe(false);
    expect(state.status).toBe("in_progress");

    expect(state.trials).toHaveLength(4);
    expect(state.trials.map((t) => t.intervalSec)).toEqual([0, 15, 15, 15]);
  });
});

describe("candidacyReduce — unclear handling", () => {
  it("a single unclear consumes no attempt and re-probes the same level", () => {
    const state = frozen(
      candidacyReduce(
        frozen(initialCandidacyState()),
        { type: "probe_result", outcome: "unclear", at: 1 },
        config,
      ),
    );
    expect(state.unclearRun).toBe(1);
    expect(state.attemptsUsed).toBe(0);
    expect(state.correctionRequired).toBe(false);
    expect(state.levelIndex).toBe(0);
    expect(state.status).toBe("in_progress");
    expect(state.trials).toHaveLength(1);
    expect(state.trials[0]).toMatchObject({
      intervalSec: 0,
      outcome: "unclear",
      isScreening: true,
      corrected: false,
    });
  });

  it("2 consecutive unclears (the configured cap) become a confirmed miss", () => {
    let state = frozen(initialCandidacyState());
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "unclear", at: 1 }, config),
    );
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "unclear", at: 2 }, config),
    );

    expect(state.unclearRun).toBe(0);
    expect(state.attemptsUsed).toBe(1);
    expect(state.correctionRequired).toBe(true);
    expect(state.status).toBe("in_progress");
    expect(state.trials).toHaveLength(2);
    expect(state.trials[1]).toMatchObject({
      intervalSec: 0,
      outcome: "unclear",
      corrected: true,
    });
  });

  it("a recall breaks the unclear run", () => {
    let state = frozen(initialCandidacyState());
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "unclear", at: 1 }, config),
    );
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "recall", at: 2 }, config),
    );
    expect(state.levelIndex).toBe(1);
    expect(state.unclearRun).toBe(0);

    // The next unclear at the new level starts a fresh run, not a continuation.
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "unclear", at: 3 }, config),
    );
    expect(state.unclearRun).toBe(1);
    expect(state.attemptsUsed).toBe(0);
    expect(state.correctionRequired).toBe(false);
  });

  it("a miss breaks the unclear run and is itself a confirmed miss immediately", () => {
    let state = frozen(initialCandidacyState());
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "unclear", at: 1 }, config),
    );
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "miss", at: 2 }, config),
    );

    expect(state.unclearRun).toBe(0);
    expect(state.attemptsUsed).toBe(1);
    expect(state.correctionRequired).toBe(true);
    expect(state.trials).toHaveLength(2);
    expect(state.trials[1]).toMatchObject({ outcome: "miss", corrected: true });

    state = frozen(candidacyReduce(state, { type: "correction_done", at: 3 }, config));
    // A fresh unclear after the correction starts a new run (not counted with the earlier one).
    state = frozen(
      candidacyReduce(state, { type: "probe_result", outcome: "unclear", at: 4 }, config),
    );
    expect(state.unclearRun).toBe(1);
    expect(state.correctionRequired).toBe(false);
  });
});

describe("candidacyReduce — invalid events are no-ops", () => {
  it("correction_done with nothing pending returns the same state", () => {
    const state = frozen(initialCandidacyState());
    const result = candidacyReduce(state, { type: "correction_done", at: 1 }, config);
    expect(result).toBe(state);
  });

  it("a probe while a correction is owed returns the same state", () => {
    const state = frozen(
      candidacyReduce(
        frozen(initialCandidacyState()),
        { type: "probe_result", outcome: "miss", at: 1 },
        config,
      ),
    );
    const result = candidacyReduce(
      state,
      { type: "probe_result", outcome: "recall", at: 2 },
      config,
    );
    expect(result).toBe(state);
  });
});
