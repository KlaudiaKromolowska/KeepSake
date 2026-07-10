import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SESSION_COPY } from "@/lib/session/copy";
import { ProbeScreen } from "./probe-screen";

// Static-markup only (no DOM in this env).
const render = (imageUrl: string | null) =>
  renderToStaticMarkup(
    createElement(ProbeScreen, {
      question: "Who visits on Sundays?",
      answer: "Anna",
      imageUrl,
      onOutcome: () => {},
    }),
  );

describe("ProbeScreen accessibility", () => {
  it("gives the picture honest alt text, not the on-screen question", () => {
    const html = render("https://img.example/x.jpg");
    expect(html).toContain(`alt="${SESSION_COPY.shared.imageAlt}"`);
    expect(html).not.toContain('alt="Who visits on Sundays?"');
  });

  it("associates the outcome-button group with the caregiver instruction", () => {
    const html = render(null);
    // A <fieldset> is an implicit ARIA group (semantic element, per biome useSemanticElements);
    // display:contents keeps the button layout unchanged.
    expect(html).toContain("<fieldset");
    expect(html).toContain('aria-describedby="outcome-instruction"');
    expect(html).toContain('id="outcome-instruction"');
  });
});
