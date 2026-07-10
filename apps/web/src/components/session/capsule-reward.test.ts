import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Capsule } from "@/lib/capsules/reward";
import { CapsuleReward } from "./capsule-reward";

// Static-markup only: the vitest env has no DOM, so focus-trap behaviour (Tab wrapping, focus
// restore) can't run here — these assert the accessibility scaffolding present in the initial
// render. The focus-move/trap logic itself is exercised manually in the kiosk.
const photo: Capsule = {
  id: "c1",
  kind: "photo",
  caption: "Seaside day",
  url: "https://signed.example/photo.jpg",
};

const render = (capsule: Capsule) =>
  renderToStaticMarkup(createElement(CapsuleReward, { capsule, onDismiss: () => {} }));

describe("CapsuleReward accessibility", () => {
  it("is a modal dialog labelled by its visible heading", () => {
    const html = render(photo);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="capsule-reward-heading"');
    expect(html).toContain('id="capsule-reward-heading"');
    // The old duplicated aria-label is gone in favour of aria-labelledby.
    expect(html).not.toContain('aria-label="A moment for you"');
  });
});
