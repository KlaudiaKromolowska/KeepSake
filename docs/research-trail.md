# Research trail — what the evidence overturned (v1 → v4)

Keepsake's design isn't the first idea we had — it's the idea *evidence-tested*. Across two literature
passes, ~10 parallel Claude Code research agents ran the clinical review (manualized SR protocol,
scheduler design, speech tech, regulatory, caregiver-delivery evidence, competitive landscape); a
third pass of 3 agents hardened the spec for engineering correctness; then a **mid-build practitioner
review** added a fourth, practitioner-driven iteration on top of the three literature-driven ones.

This file is the trail. Each reversal below is a naive default we started from, what the evidence
said, what we chose instead, and **why**. Full citations live in `PLAN.md` §1, §3, and the Appendix.

---

## The reversals

### 1 · Deterministic ladder, **not** FSRS

- **Naive default:** reuse an off-the-shelf spaced-repetition ML scheduler (FSRS) as the core engine —
  it's the modern state of the art for flashcards.
- **Evidence:** FSRS **excludes sub-minute intervals** from its own training set, needs **hundreds of
  reviews** to personalize (a new patient has *zero*), and was fit on **healthy, motivated learners**.
  The only RCT-validated *dementia* scheduler (**USMART**) is a plain deterministic doubling/halving
  ladder.
- **Chose:** a deterministic ×2 expanding ladder within-session + a simple monotone state machine
  between-session. ML is demoted to a *possible V2 population-prior only*.
- **Why:** wrong interval regime, wrong population, cold-start on every new patient. The engine ships
  the ladder as real constants — **base `15s`, growth `×2`, ceiling `960s`** (`15 → 30 → 60 → 120 →
  240 → 480 → 960`) in `packages/core/src/sr/config.ts`.

### 2 · Errorless immediate correction, **not** a cueing hierarchy

- **Naive default:** on a miss, walk a cueing hierarchy (semantic → phonemic → …) to coax the answer
  out — more "therapeutic" than just handing it over.
- **Evidence:** **Bourgeois et al. 2003** ran SR against a cueing-hierarchy approach **head-to-head** —
  **SR won** on goals attained and on maintenance.
- **Chose:** on a miss, give the answer immediately, the patient repeats it, the interval reverts one
  rung (never to zero). Cueing hierarchy is demoted to an *optional, experimental* enhancement for hard
  targets only.
- **Why:** a head-to-head trial is the strongest evidence available, and it pointed the other way.

### 3 · The **device** delivers the correction, not the caregiver

- **Naive default:** the caregiver reads the prompt and supplies the correction — they're in the room
  anyway.
- **Evidence:** casting a family member as their parent's "tester/corrector" **damages the
  relationship**, and the best analog RCT (**iCST, n=356**) failed on **adherence** (22% did *zero*
  sessions), not fidelity.
- **Chose:** the app delivers the recall prompt *and* the errorless correction. The patient reads the
  answer off the **screen**, not off their daughter's face. The caregiver's job is presence and one tap.
- **Why:** *the device is the therapist; the caregiver is the companion* — the single principle
  underneath the whole product.

### 4 · Single-target, sequential-to-mastery — **not** interleaved

- **Naive default:** interleave 1–3 targets per session to cover more ground.
- **Evidence:** classic dementia SR trains **one target at a time, to mastery**. Interleaving appears
  only in *aphasia* work (Fridriksson 2005), and even there as **N independent state machines** — never
  a shared clock.
- **Chose:** single-target MVP; multi-target (V1+) = N independent state machines, never a shared
  ladder.
- **Why:** a shared clock isn't the same intervention, and the interleaving evidence doesn't transfer
  from aphasia to dementia.

### 5 · Mastery = 3 session-start recalls on **distinct calendar days**

- **Naive default:** call a target "learned" once the patient gets it right a few times in a row.
- **Evidence:** SR gains are **item-specific and decay**; back-to-back "sessions" in one sitting prove
  nothing about retention.
- **Chose:** mastery = correct at **session-start on 3 consecutive sessions on distinct calendar days**
  (in the *patient's* timezone) — engine constant **`masteryStreak: 3`**. Mastery then triggers a
  maintenance + booster loop (`7 → 14 → 30 → 90` days).
- **Why:** it makes mastery **ungameable** and it makes the booster loop the *product*, not an add-on.
  We never promise "better memory."

### 6 · Dual-code every target with an image

- **Naive default:** a text target (question + answer) is enough.
- **Evidence:** the **picture-superiority effect is amplified in dementia** — an image cue is retained
  far better than words alone.
- **Chose:** every target carries a photo, and **Claude vision-QAs** it (one clear subject, well-lit,
  low clutter) before it's ever used.
- **Why:** the cheapest, best-evidenced lever on retention we could add — so we made it mandatory, not
  optional.

### 7 · `unclear` never moves the ladder

- **Naive default:** a two-state outcome — recall or miss.
- **Evidence:** in the home, a lot of taps are genuinely ambiguous (mumbled, distracted, half-right).
  Forcing them into "miss" corrupts both the protocol *and* the research log, and a false "you're
  wrong" to a vulnerable patient is a harm, not a bug.
- **Chose:** a **three-state** outcome — recall / miss / **unclear**. `unclear` re-probes at the *same*
  interval with **no correction and no ladder movement**; two consecutive unclears = a confirmed miss.
- **Why:** the log stays honest and the patient is never wrongly told they failed. This is a
  code-enforced invariant (`invariants.property.test.ts`).

### 8 · Optimize for adherence, not fidelity

- **Naive default:** sell "protocol-fidelity enforcement" — make the caregiver execute SR perfectly.
- **Evidence:** the iCST RCT (n=356) was **null on cognition and failed on adherence** — 22% did zero
  sessions. The real failure mode is the tool not getting used, not getting used imperfectly.
- **Chose:** a low-friction, relationship-safe daily ritual — device carries the rules, sessions
  **always end on a win**, no red X, no stopwatch in the caregiver's hand.
- **Why:** a perfectly faithful protocol nobody runs helps no one. Adherence is the thesis worth
  building for.

### 9 · Two deliberate framings (regulatory)

- **Naive default:** market it as "SRT therapy for early-stage dementia."
- **Evidence:** EU MDR reads past marketing to *intended purpose* — a disease-targeted "therapy"
  plausibly qualifies as a medical device (Class IIa with trend features). Live enforcement precedent
  exists (SeniorLife FDA warning 2025; Lumosity FTC $2M).
- **Chose:** **hackathon/demo** — name dementia, cite the neuroscience (a research prototype for
  judges). **Commercial** — wellness/caregiver-support positioning, never name the disease, *show the
  data, never the diagnosis* (`PLAN.md §10`).
- **Why:** the science is a strength to judges and a regulatory liability in a marketed product. Don't
  conflate the two.

---

## What the v4 engineering pass hardened

The science held across all passes; the *spec* needed pinning down before it was testable:

- **`unclear` semantics** branched explicitly (reversal 7 above).
- **End-on-win reconciled** — one rule: 2 consecutive base-rung misses → always exit via a guaranteed
  0-second success, never on a failure.
- **Distinct-calendar-day mastery** in the patient's timezone (reversal 5).
- **A pure reducer with an injected clock** — zero `Date.now()` / `setTimeout` in `packages/core`
  (grep-enforced by `purity.test.ts`), so the entire protocol is testable as plain values.
  `DEMO_SPEED` scales only the wall-clock wait, **never** persisted data.

---

## The fourth iteration — practitioner-driven

While the session UI was still on paper, **Monika Stroińska of Centrum Montessori Senior — the
Polish practitioner-trainer organisation in the Camp/Brush tradition our protocol implements** —
reviewed the design by email — the first *practitioner-driven* pass on top of three
literature-driven ones. *(Named with her explicit consent, 2026-07-12.)*

**It validated:**
- the `15s`-then-doubling ladder,
- the "3 consecutive session-starts = remembered, regardless of gap" mastery rule,
- the radical-simplicity accessibility floors.

**It changed five things, folded in before a single screen shipped:**
1. no rigid scheduling copy — real cadence drifts, and rigid reminders instrumentalize the person;
2. the caregiver always sees the question *and* the answer;
3. a manual mid-session interval override, **logged as a protocol-deviation annotation** (deviations
   become data);
4. a per-session caregiver note;
5. an "answer card introduced" annotation.

---

*The reversal is the depth, not an embarrassment: our first instincts (an ML scheduler; a cueing
hierarchy) were wrong on both counts, and the literature said so plainly. See `PLAN.md` §1 (the full
citation table), §3 (scientific foundation), §4–§5 (protocol and scheduler spec).*
