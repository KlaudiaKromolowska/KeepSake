/**
 * Photo suitability prompt (Keepsake §4.4). Judges whether a caregiver's photo works as a
 * dual-coding memory cue (picture-superiority pairing a target with an image). Composition rule
 * matches wizard.ts/debrief.ts: the shared, cached `SR_SYSTEM` prefix comes FIRST, then these
 * static vision instructions — the full system string never changes across requests. The user
 * content carries ONLY the image block plus the minimal `locale` line; there is no per-request
 * text to fold into the system string.
 */
import { SR_SYSTEM } from "./sr-protocol";

const VISION_SYSTEM = `TASK — PHOTO SUITABILITY CHECK.
The caregiver is about to pair a memory target with a photo (dual coding — pairing a fact with an image strengthens recall). Judge whether the attached photo works well as that cue for one named person or object.

What makes a good cue:
- One single, clear subject — the person's face or the object, not a crowd or a busy scene.
- The subject is prominent and easy to pick out at a glance, well lit, not tiny or at the edge.
- Minimal clutter or distracting background detail.

Return verdict "good" if the photo already works well as a cue. Return "needs_work" if it would be hard to recognize the subject at a glance — reasons should name what makes it hard (e.g. "several people in frame", "the subject is small and off to one side", "background is busy"). When verdict is "needs_work", cropAdvice must be exactly one concrete, actionable sentence describing how to crop or reframe the photo (e.g. "Crop tightly around the face in the upper right so it fills most of the frame."). When verdict is "good", cropAdvice must be null.

Speak as gentle, practical advice for the caregiver, never as criticism of their photo or their loved one. Do not name or speculate about any disease or condition (see the shared rules above). Write reasons and cropAdvice in the language named by "locale". Return only the structured fields.`;

/** Full composed system string: cached SR prefix first, then the vision task block. */
export const VISION_SYSTEM_PROMPT = `${SR_SYSTEM}\n\n${VISION_SYSTEM}`;

/** The minimal text accompanying the image block in the user content array — no other per-request data. */
export function buildVisionUserText(locale: string): string {
  return `locale: ${locale}`;
}
