# Practitioner feedback — 2026-07-08 (mid-build design input)

**Source:** **Monika Stroińska, Centrum Montessori Senior** — the Polish practitioner-trainer
organisation in the Camp/Brush tradition our protocol implements (named with her explicit
consent, 2026-07-12). Received by email in response to our Day-1 outreach, while Phase 3
(session kiosk UI) was being planned — folded in before a single screen was built.

This is the research trail working as designed: v1→v2→v3 were literature-driven; v4.2 is the
first **practitioner-driven** iteration.

## What the feedback VALIDATED (no change)

| Feedback | Our design |
|---|---|
| First interval 15s, then doubling | §4.2 ladder, `baseIntervalSec: 15`, `growthFactor: 2` |
| "Correct at session start? 3 consecutive sessions → remembered — regardless of the gap between sessions" | The engine's start-streak mastery rule, exactly (streak counts sessions, not elapsed time) |
| Radical simplicity, big letters, high contrast | §8b a11y floors (≥20–24px, 7:1, 60px targets) |
| Professional designs the training, family consolidates it daily | The film's SLP-named-user framing; V1 clinician view |
| Targets can be motor-behavioral ("walker reflex"), not just verbal | §4.4 already allows verbal or motor-behavioral |

## What the feedback CHANGED (applied in Phase 3, plan v2)

1. **No rigid scheduling copy, ever.** Real cadence is 1–2×/week and drifts with life; rigid
   reminders instrumentalize the person and families over-comply. → The planned
   "Next check-in: tomorrow" end-screen line was deleted before it shipped. The between-session
   scheduler (§5) remains engine-only analytic data — `next_due_at` and booster cadence are
   never surfaced as user-facing prompts in MVP. Mastery is celebrated
   ("this memory has taken hold"), not scheduled.
2. **The caregiver always sees question AND answer** during the session, so they can stay in
   the interaction instead of recalling logistics. → Discreet labeled answer hint on the probe
   screen. (Device-delivered correction is unchanged — the patient still reads the corrective
   answer off the screen.)
3. **Manual interval override mid-session** — named by the practitioner as a potential
   differentiator vs. competing tools. → New core engine event `interval_override`
   (test-first), valid during the distractor gap, clamped to `[base, max]`; an "Adjust wait"
   rung picker on the distractor card. **Every override is logged** to
   `sessions.summary.annotations` (from → to → timestamp): protocol deviations become visible
   data, which strengthens — not weakens — the instrument framing.
4. **Per-session caregiver note** (free text; voice dictation deferred to V1) on the end
   screen → `sessions.summary.note`.
5. **"Answer card introduced" annotation** — when an external memory aid (a written card)
   enters use, log it with its text, so later analysis can see the moment it started
   mediating recall → side control during the session, `sessions.summary.annotations`.

## Ruling on an apparent conflict

The practitioner's "3 consecutive sessions **regardless of gap**" vs. our **distinct calendar
days** mastery rule: not a conflict. "Regardless of gap" addresses *long* gaps (a week+ between
sessions must not break the streak — our engine already counts sessions, not days). The
distinct-days rule guards the opposite edge (three back-to-back mini-sessions in one afternoon
must not count as mastery) and stays.

## Deferred to V1+ (documented, not built this week)

- Patient picker at app open ("who are we training with today") — V1 multi-patient (§4.3).
- Per-person goal list → tap a goal to train it — V1 multi-target.
- Quick in-flight editing of the training question/answer between sessions.
- Family handoff: send a simplified ready-made script (question / answer / simple SR) via link.
- Voice-dictated session notes.
- PDF export of the full training record (paid-tier candidate).

## Follow-ups (human)

- Reply drafted: thanks + consent ask (naming the organisation in README/film, quote use) +
  offer of a test version post-hackathon (they offered team testing + recommendation at their
  trainings once approved).
