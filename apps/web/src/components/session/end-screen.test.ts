import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SESSION_COPY } from "@/lib/session/copy";
import { EndScreen } from "./end-screen";

// Static-markup only (no DOM in this env). Asserts the errorless-design copy rule: the patient sees
// a warm line, and the raw practice/recall counts live only in the caregiver-only debrief.
const render = (props: Partial<Parameters<typeof EndScreen>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(EndScreen, {
      sessionId: "s1",
      trials: 6,
      recalls: 4,
      mastered: false,
      rescopeRequired: false,
      onSaveNote: async () => true,
      onAffect: () => {},
      onHome: () => {},
      ...props,
    }),
  );

describe("EndScreen — no patient-facing scorecard", () => {
  it("shows a warm, non-scorecard summary line to the patient", () => {
    const html = render();
    expect(html).toContain(SESSION_COPY.ended.togetherLine);
    // The old scorecard phrasing must be gone.
    expect(html).not.toContain("times ·");
  });

  it("keeps the raw counts in the caregiver-only debrief tally", () => {
    const html = render();
    expect(html).toContain(SESSION_COPY.debrief.tally(6, 4));
  });
});
