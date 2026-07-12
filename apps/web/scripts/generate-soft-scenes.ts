// Generates the film's AI soft-scenes end-to-end via the Replicate API — the same hands-off pattern
// as the voice generator. Produces two reference stills (for face consistency), then text-to-video
// for the object beats and image-to-video for the human beats, downloading each clip to
// ./film-captures/soft/. Prompts mirror docs/film-soft-scene-prompts.md.
//
// Usage:  REPLICATE_API_TOKEN=... pnpm film:soft-scenes
//   Optional: IMAGE_MODEL (default black-forest-labs/flux-1.1-pro), VIDEO_MODEL (default
//   minimax/video-01). The video model must accept { prompt } and, for image-to-video,
//   { first_frame_image }. Swap models by env if you prefer Veo/Kling/Wan on Replicate.
// The token is read from the environment only — never written to disk or logged. Video generation
// COSTS money on Replicate; run the cost estimate (printed first) before confirming.
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const TOKEN = process.env.REPLICATE_API_TOKEN;
const IMAGE_MODEL = process.env.IMAGE_MODEL ?? "black-forest-labs/flux-1.1-pro";
const VIDEO_MODEL = process.env.VIDEO_MODEL ?? "minimax/video-01";
const OUT_DIR = join(process.cwd(), "film-captures", "soft");

const STYLE =
  "warm cinematic, high-key natural window light, shallow depth of field, soft film grain, muted " +
  "warm amber and cream palette, gentle handheld, 35mm, tender, dignified, unhurried, photoreal. " +
  "No text, no captions, no logos, no UI, no watermark. 16:9.";

/** Reference stills → generated first, then reused as the first frame of the human clips. */
const STILLS: { name: string; prompt: string }[] = [
  {
    name: "ref-marta",
    prompt: `Portrait of a gentle woman around 78, soft grey-white hair, kind lived-in face with warm eyes, soft cardigan, in a warm domestic kitchen, natural window light, photoreal, dignified. ${STYLE}`,
  },
  {
    name: "ref-daughter",
    prompt: `Portrait of a warm woman around 50, tired-but-loving expression, soft sweater, same warm kitchen, natural window light, photoreal. ${STYLE}`,
  },
];

/** Video shots. `fromStill` = image-to-video seeded by that reference still (face consistency). */
const SHOTS: { name: string; prompt: string; fromStill?: string }[] = [
  {
    name: "01-hook-a",
    prompt: `Extreme close-up: a vintage mechanical stopwatch ticking on a worn wooden kitchen table beside a small stack of hand-written index cards, soft early-morning light, slow imperceptible push-in, quiet, shallow depth of field, no people. ${STYLE}`,
  },
  {
    name: "02-hook-b",
    prompt: `Close-up of hand-written index cards on the table, handwriting soft and out-of-focus and not legible; a gentle older hand sets a stopwatch down beside them and withdraws, warm morning light, shallow focus. ${STYLE}`,
  },
  {
    name: "03-problem",
    prompt: `Slow cinematic push-in across a stack of aged index cards on a kitchen table; a mechanical stopwatch beside them winds down and is set aside, abandoned; the light cools slightly; quietly melancholic but warm, film grain, no people. ${STYLE}`,
  },
  {
    name: "04-strain",
    fromStill: "ref-daughter",
    prompt: `Warm kitchen; an elderly woman (~78, grey hair, cardigan) and her adult daughter (~50) sit close at the table; the daughter holds a small index card and hesitates, looking at her mother with quiet love and reluctance, not wanting to test her; soft window light, intimate over-the-shoulder framing favoring the daughter's face and hands; tender, no dialogue. ${STYLE}`,
  },
  {
    name: "05-close",
    fromStill: "ref-marta",
    prompt: `Same warm kitchen, later, golden light; the elderly mother looks down at a small framed photograph and softly speaks — a genuine quiet smile of recognition; beside her the daughter smiles back with relief and love, eyes bright; intimate, shallow depth of field, deeply tender. ${STYLE}`,
  },
];

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
  urls: { get: string };
}

/** POST a prediction to an official Replicate model and poll it to completion. */
async function run(model: string, input: Record<string, unknown>): Promise<string> {
  let res: Response;
  for (;;) {
    res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN as string}`,
        "Content-Type": "application/json",
        Prefer: "wait", // Replicate holds the connection up to ~60s, reducing polling.
      },
      body: JSON.stringify({ input }),
    });
    // Under $5 credit Replicate throttles creation to ~6/min (burst 1) — honor retry_after.
    if (res.status !== 429) break;
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const waitS = (body.retry_after ?? 10) + 1;
    console.error(`  … throttled (<$5 credit), waiting ${waitS}s`);
    await new Promise((r) => setTimeout(r, waitS * 1000));
  }
  if (!res.ok) throw new Error(`${model} start failed (${res.status}): ${await res.text()}`);
  let pred = (await res.json()) as Prediction;
  while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${TOKEN}` } });
    pred = (await poll.json()) as Prediction;
  }
  if (pred.status !== "succeeded") throw new Error(`${model} ${pred.status}: ${pred.error}`);
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!out) throw new Error(`${model} produced no output`);
  return out;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status}) for ${url}`);
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(dest),
  );
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error(
      "generate-soft-scenes: REPLICATE_API_TOKEN is required (env only — never commit it).",
    );
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  console.error(`Image model: ${IMAGE_MODEL} · Video model: ${VIDEO_MODEL} · → ${OUT_DIR}`);

  // 1. Reference stills — cached if already downloaded, so re-runs don't re-spend under the throttle.
  const stillPath = new Map<string, string>();
  for (const s of STILLS) {
    const path = join(OUT_DIR, `${s.name}.png`);
    if (existsSync(path)) {
      console.error(`  · still ${s.name} (cached)`);
    } else {
      const url = await run(IMAGE_MODEL, { prompt: s.prompt, aspect_ratio: "16:9" });
      await download(url, path);
      console.error(`  ✓ still ${s.name}`);
    }
    stillPath.set(s.name, path);
  }

  // 2. Video shots — text-to-video, or image-to-video seeded by a reference still (sent as a data
  // URI so a cached still still works). Skip any clip already downloaded.
  for (const shot of SHOTS) {
    const dest = join(OUT_DIR, `${shot.name}.mp4`);
    if (existsSync(dest)) {
      console.error(`  · clip ${shot.name} (cached)`);
      continue;
    }
    const input: Record<string, unknown> = { prompt: shot.prompt };
    if (shot.fromStill) {
      const b64 = readFileSync(stillPath.get(shot.fromStill) as string).toString("base64");
      input.first_frame_image = `data:image/png;base64,${b64}`;
    }
    const url = await run(VIDEO_MODEL, input);
    await download(url, dest);
    console.error(`  ✓ clip ${shot.name}${shot.fromStill ? ` (from ${shot.fromStill})` : ""}`);
  }

  console.error(`Done — ${STILLS.length} stills + ${SHOTS.length} clips in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
