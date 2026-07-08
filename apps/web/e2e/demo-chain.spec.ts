import { expect, type Page, test } from "@playwright/test";

/**
 * Smoke E2E of the never-cut demo chain (Revised_plan.md Day-3 Track A): demo-login → target
 * wizard (typed path) → session (recall, miss + errorless correction, unclear) → debrief → RCT
 * report. Asserts headings/state transitions render, not pixels. Requires:
 *  - the local Supabase stack seeded (`pnpm seed`) — provides the demo caregiver + an already
 *    active "Lena" target with 5 days of prior trial history (scripts/seed.ts),
 *  - DEMO_MODE=1 + DEMO_CAREGIVER_PASSWORD set (enables the one-tap demo login), and
 *  - CLAUDE_FIXTURES=1 so every AI call (wizard/debrief/rct) replays a recorded fixture
 *    (packages/core/prompts/fixtures/*.json) instead of hitting the real Claude API.
 *
 * Distractor waits: the seeded target's last successful interval is already at the 960s ceiling,
 * so a fresh distractor gap opens huge. Rather than patching the engine or waiting it out, this
 * test uses the same "Adjust wait" control a caregiver has in the real kiosk (DistractorCard) to
 * collapse the gap to its floor rung (15s — DEFAULT_SR_CONFIG.baseIntervalSec; the seeded demo
 * patient is "alzheimers", whose etiology tuning only overrides growthFactor, not baseIntervalSec —
 * packages/core/src/sr/etiology.ts) — the smallest legitimate mechanism already in the app. Waits
 * at or under 60s always play in real time (REALTIME_MAX_SEC, wait-policy.ts) regardless of
 * DEMO_SPEED.
 */
test("demo login → wizard → session → debrief → RCT report", async ({ page }) => {
  // 1. Demo login
  await page.goto("/login");
  await page.getByRole("button", { name: "Enter demo" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /signed in as/ })).toBeVisible();

  // 2. Target wizard — typed path (not voice)
  await page.getByRole("link", { name: /Create a memory to practise/ }).click();
  await expect(page).toHaveURL(/\/targets\/new$/);
  await page
    .getByLabel("Tell us about the memory")
    .fill("My son David calls every Wednesday evening and I want to remember his name.");
  await page.getByRole("button", { name: "Ask Claude to shape it" }).click();
  await expect(page.getByRole("heading", { name: "Here's a memory target" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Use this memory" }).click();
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // 3. Session — the seeded target is the oldest active one, so it's the one the kiosk picks up
  await page.getByRole("link", { name: /Start today's session/ }).click();
  await expect(page).toHaveURL(/\/session$/);
  await page
    .getByRole("button", { name: /Begin today's session|Resume this morning's session/ })
    .click();

  // Pre-session affect check-in — skip it, it's optional
  await page.getByRole("button", { name: "Skip this" }).click();

  // Session-start probe: recall
  await expect(page.getByRole("heading", { name: "Time to ask" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Remembered" }).click();
  await collapseDistractorWait(page);

  // Trial probe: miss → device-delivered errorless correction (never the caregiver)
  await expect(page.getByRole("heading", { name: "Time to ask" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Not this time" }).click();
  await expect(page.getByRole("heading", { name: "Here's the answer" })).toBeVisible();
  await page.getByRole("button", { name: "We said it together" }).click();
  await collapseDistractorWait(page);

  // Trial probe: unclear — never moves the ladder, just re-probes
  await expect(page.getByRole("heading", { name: "Time to ask" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Couldn't tell" }).click();

  // Sessions always end on a win: closing mid-gap after a non-recall routes through one more
  // guaranteed success rather than ending cold.
  await expect(page.getByRole("heading", { name: "While we wait" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: "One more time — together" })).toBeVisible();
  await page.getByRole("button", { name: "We said it" }).click();
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();

  // 4. Debrief — private caregiver note, streamed from the fixture, never shown to the patient.
  // endSessionAction (persisting sessions.ended_at) fires fire-and-forget from the client's
  // onChange handler, so it can still be in flight the instant "Session complete" renders — the
  // debrief route 400s until it lands. Use the panel's own Retry affordance rather than a fixed
  // sleep, since there's no UI signal for that in-flight save completing.
  await page.getByRole("button", { name: "A private note for you" }).click();
  const copyNoteButton = page.getByRole("button", { name: "Copy note" });
  const retryButton = page.getByRole("button", { name: "Retry" });
  await expect(copyNoteButton.or(retryButton)).toBeVisible({ timeout: 15_000 });
  if (await retryButton.isVisible()) await retryButton.click();
  await expect(copyNoteButton).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // 5. RCT report — Claude's agentic single-subject analysis over the trial logs
  await page.getByRole("link", { name: /Research view/ }).click();
  await expect(page).toHaveURL(/\/review$/);
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByRole("heading", { name: "How this report was produced" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Copy report" })).toBeVisible();
});

/** Opens the distractor "Adjust wait" panel and collapses the gap to its floor rung (15s). */
async function collapseDistractorWait(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "While we wait" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Adjust wait" }).click();
  await page.getByRole("button", { name: "15s" }).click();
}
