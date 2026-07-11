// Auto-captures the REAL KeepSake app beats for the submission film — drives the live prod app and
// records each beat to a video file. No human screen-recording, no OBS: `pnpm film:capture` →
// timestamped .webm clips in ./film-captures/. Convert to mp4 with ffmpeg if your editor prefers.
//
// The app UI is the one thing an AI video model can't fake faithfully, so this captures the genuine
// article (real streaming, real typing, real transitions) that "holds up as real software" (rubric
// Demo 30%). Selectors mirror the passing e2e (apps/web/e2e/demo-chain.spec.ts).
//
// Env: BASE_URL (default prod), HEADED=1 to watch it run, SLOWMO=<ms> to slow each action.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "https://keepsake-nu.vercel.app";
const OUT_DIR = join(process.cwd(), "film-captures");
const SIZE = { width: 1920, height: 1080 }; // 1080p; the kiosk is big-type and reads well here.
const HEADED = process.env.HEADED === "1";
const SLOWMO = Number(process.env.SLOWMO ?? "0");

/** Deliberate on-screen hold so each beat reads on camera and the editor has room to cut. */
const hold = (page: Page, ms: number) => page.waitForTimeout(ms);

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.getByRole("button", { name: "Enter demo" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
}

/** Records one beat in its own context (its own video file), saving to `out`. */
async function record(
  browser: Browser,
  out: string,
  beat: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT_DIR, size: SIZE },
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await beat(page);
  } finally {
    await context.close(); // flushes + finalizes the recording
    if (video) {
      await video.saveAs(join(OUT_DIR, out));
      await video.delete(); // drop Playwright's hash-named duplicate
    }
    console.error(`  ✓ ${out}`);
  }
}

/** Clip 1 — the never-cut session: probe → miss → errorless correction → distractor → recall → win. */
async function sessionBeat(page: Page): Promise<void> {
  await login(page);
  await page.goto(`${BASE_URL}/session`);
  await page.getByRole("button", { name: /Begin today's session|Resume/ }).click();
  // Skip the mood check-in so the never-cut chain stays on the probe→correction→recall arc.
  await page.getByRole("button", { name: "Skip this" }).click();

  // Session-start probe — the warm narration plays here; hold LONG so the question + answer are
  // comfortably readable on camera (the film's app beat was rushing before).
  await page.getByRole("heading", { name: "Time to ask" }).waitFor({ timeout: 25_000 });
  await hold(page, 7000);

  // Miss → the DEVICE delivers the errorless correction (the emotional core — hold on it).
  await page.getByRole("button", { name: "Not this time" }).click();
  await page.getByRole("heading", { name: "Here's the answer" }).waitFor({ timeout: 10_000 });
  await hold(page, 7000);
  await page.getByRole("button", { name: "We said it together" }).click();

  // Distractor — hold, then close onto the guaranteed final win. Ending via "End session" (instead of
  // waiting out a full second interval, which for a booster target can be 51s+) keeps the capture
  // robust to any gap length and still shows the "she remembers" win. Mirrors the passing e2e.
  await page.getByRole("heading", { name: "While we wait" }).waitFor({ timeout: 12_000 });
  await hold(page, 5000);
  await page.getByRole("button", { name: "End session" }).click();

  const oneMore = page.getByRole("heading", { name: "One more time — together" });
  const complete = page.getByRole("heading", { name: "Session complete" });
  await oneMore.or(complete).waitFor({ timeout: 20_000 });
  if (await oneMore.isVisible()) {
    await hold(page, 6000);
    await page.getByRole("button", { name: "We said it" }).click();
  }
  await complete.waitFor({ timeout: 15_000 });
  await hold(page, 6000);
}

/** Clip 2 — the jaw-drop: the agentic /review report (real Claude) + its "how it was produced" trail. */
async function reviewBeat(page: Page): Promise<void> {
  await login(page);
  await page.goto(`${BASE_URL}/review`);
  const analyze = page.getByRole("button", { name: "Analyze" });
  await analyze.waitFor({ timeout: 15_000 });
  await hold(page, 2500); // rest on the pre-filled research question
  await analyze.click();
  // Real Claude runs its own analyses over the trial logs — the agentic loop can take 1-2 min.
  await page
    .getByRole("heading", { name: "How this report was produced" })
    .waitFor({ timeout: 180_000 });
  await hold(page, 3500);
  await page
    .getByRole("heading", { name: "How this report was produced" })
    .scrollIntoViewIfNeeded();
  await hold(page, 4000); // hold on the list of self-chosen analyses — the money shot
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  console.error(`Capturing ${BASE_URL} → ${OUT_DIR} (${HEADED ? "headed" : "headless"})`);
  const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOWMO });
  const beats: Array<[string, (page: Page) => Promise<void>]> = [
    [`${stamp}-01-session-never-cut.webm`, sessionBeat],
    [`${stamp}-02-review-agentic-report.webm`, reviewBeat],
  ];
  try {
    for (const [name, beat] of beats) {
      try {
        await record(browser, name, beat);
      } catch (err) {
        console.error(`  ✗ ${name} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.error("Done. Two clips ready for the edit.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
