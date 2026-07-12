// Captures the app as SEPARATE per-screen clips (one screen = one file) with a visible animated
// cursor and real typing — so the editor can time each step independently. Records each flow
// continuously (state must carry within a flow), marks the video-time at every screen transition,
// then ffmpeg-splits into named clips in ./film-captures/steps/.
//
// Usage: pnpm film:steps   (drives the live app; re-seed first for a clean session)
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "https://keepsake-nu.vercel.app";
const OUT = join(process.cwd(), "film-captures", "steps");
const SIZE = { width: 1920, height: 1080 };

// Injected before every page: a soft cursor dot that follows mousemove, so cursor motion is visible.
const CURSOR = `(() => {
  const c = document.createElement('div'); c.id='__cur__';
  c.style.cssText='position:fixed;z-index:2147483647;left:-100px;top:-100px;width:26px;height:26px;border-radius:50%;background:rgba(20,20,20,.30);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);pointer-events:none;transform:translate(-50%,-50%)';
  const add=()=>{ if(document.body && !document.getElementById('__cur__')) document.body.appendChild(c); };
  if(document.readyState!=='loading') add(); else document.addEventListener('DOMContentLoaded', add);
  addEventListener('mousemove',e=>{c.style.left=e.clientX+'px'; c.style.top=e.clientY+'px';}, true);
})()`;

const hold = (p: Page, ms: number) => p.waitForTimeout(ms);

/** Glide the cursor to an element's centre, pause, then click — a visible, human-looking click. */
async function click(page: Page, loc: ReturnType<Page["getByRole"]>): Promise<void> {
  const box = await loc.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
    await hold(page, 450);
  }
  await loc.click();
}

interface Mark {
  name: string;
  t: number;
}

/** Record a flow in its own context; `flow` pushes {name, videoMs} at each screen it wants split out. */
async function record(
  browser: Browser,
  flow: (page: Page, mark: (n: string) => void) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const video = page.video();
  const t0 = Date.now();
  const marks: Mark[] = [];
  const mark = (n: string) => marks.push({ name: n, t: Date.now() - t0 });
  try {
    await flow(page, mark);
  } finally {
    await context.close();
    if (video && marks.length) {
      const full = await video.path();
      const total = Number(
        spawnSync(
          "ffprobe",
          ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", full],
          { encoding: "utf-8" },
        ).stdout.trim(),
      );
      // Clips must butt-join: each starts PRE_ROLL before its mark, so the previous clip must END
      // at that same point — ending at the next mark itself would duplicate the boundary 0.3s and
      // play as a backwards "blink" when the clips sit consecutively on a timeline.
      const PRE_ROLL = 0.3;
      for (let i = 0; i < marks.length; i++) {
        const start = Math.max(0, marks[i].t / 1000 - PRE_ROLL);
        const end = i + 1 < marks.length ? marks[i + 1].t / 1000 - PRE_ROLL : total;
        const dur = Math.max(0.6, end - start);
        const out = join(OUT, `${marks[i].name}.mp4`);
        spawnSync("ffmpeg", [
          "-y",
          "-loglevel",
          "error",
          "-ss",
          String(start),
          "-i",
          full,
          "-t",
          String(dur),
          "-c:v",
          "libx264",
          "-crf",
          "18",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
          "-an",
          out,
        ]);
        console.error(`  ✓ ${marks[i].name}.mp4 (${dur.toFixed(1)}s)`);
      }
    }
    await video?.delete();
  }
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await click(page, page.getByRole("button", { name: "Enter demo" }));
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
}

/** The session, as separate screens: probe → miss+correction → distractor → win → complete. */
async function sessionFlow(page: Page, mark: (n: string) => void): Promise<void> {
  await login(page);
  await page.goto(`${BASE_URL}/session`);
  await click(page, page.getByRole("button", { name: /Begin today's session|Resume/ }));
  await click(page, page.getByRole("button", { name: "Skip this" }));

  await page.getByRole("heading", { name: "Time to ask" }).waitFor({ timeout: 25_000 });
  mark("app-01-probe");
  await hold(page, 5000);
  await click(page, page.getByRole("button", { name: "Not this time" }));

  await page.getByRole("heading", { name: "Here's the answer" }).waitFor({ timeout: 10_000 });
  mark("app-02-correction");
  await hold(page, 5000);
  await click(page, page.getByRole("button", { name: "We said it together" }));

  await page.getByRole("heading", { name: "While we wait" }).waitFor({ timeout: 12_000 });
  mark("app-03-distractor");
  await hold(page, 4500);
  await click(page, page.getByRole("button", { name: "End session" }));

  const oneMore = page.getByRole("heading", { name: "One more time — together" });
  const complete = page.getByRole("heading", { name: "Session complete" });
  await oneMore.or(complete).waitFor({ timeout: 20_000 });
  if (await oneMore.isVisible()) {
    mark("app-04-win");
    await hold(page, 4500);
    await click(page, page.getByRole("button", { name: "We said it" }));
  }
  await complete.waitFor({ timeout: 15_000 });
  mark("app-05-complete");
  await hold(page, 5000);
}

/** The wizard, with TYPING: type a two-fact memory → Claude shapes it (+ self-critique) → save. */
async function wizardFlow(page: Page, mark: (n: string) => void): Promise<void> {
  await login(page);
  await click(page, page.getByRole("link", { name: /Create a memory to practise/ }));
  await page.waitForURL(/\/targets\/new$/, { timeout: 15_000 });
  const box = page.getByLabel(/Tell us about the memory/);
  await moveType(
    page,
    box,
    "My son David calls every Wednesday evening, and I want to remember his name.",
  );
  mark("app-06-wizard-typing");
  await hold(page, 1200);
  await click(page, page.getByRole("button", { name: "Ask Claude to shape it" }));
  await page.getByRole("heading", { name: "Here's a memory target" }).waitFor({ timeout: 25_000 });
  mark("app-07-wizard-result");
  await hold(page, 6000); // the shaped target + any self-critique note
  await click(page, page.getByRole("button", { name: "Use this memory" }));
  await page.getByRole("heading", { name: "Saved" }).waitFor({ timeout: 15_000 });
  mark("app-08-wizard-saved");
  await hold(page, 3500);
}

/** The coach, with TYPING: type a worried question → warm streamed reply. */
async function coachFlow(page: Page, mark: (n: string) => void): Promise<void> {
  await login(page);
  await page.goto(`${BASE_URL}/coach`);
  const box = page.getByRole("textbox", { name: /Your message/ });
  await moveType(page, box, "She got frustrated today — should we stop for now?");
  mark("app-09-coach-typing");
  await hold(page, 1000);
  await click(page, page.getByRole("button", { name: "Send" }));
  await page.getByText("Coach").waitFor({ timeout: 40_000 });
  await hold(page, 6000); // let the warm reply render
  mark("app-10-coach-reply");
  await hold(page, 6000);
}

/** Glide to a field, click it, then type character-by-character so the typing is visible. */
async function moveType(
  page: Page,
  loc: ReturnType<Page["getByRole"]>,
  text: string,
): Promise<void> {
  await click(page, loc);
  await loc.pressSequentially(text, { delay: 55 });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  console.error(`Capturing per-screen app clips → ${OUT}`);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, flow] of [
      ["session", sessionFlow],
      ["wizard", wizardFlow],
      ["coach", coachFlow],
    ] as const) {
      try {
        await record(browser, flow);
      } catch (e) {
        console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.error("Done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
