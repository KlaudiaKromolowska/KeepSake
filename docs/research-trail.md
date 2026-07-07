# Research trail — what the evidence overturned (v1 → v4)

Keepsake's design isn't the first idea we had — it's the idea evidence-tested. Across two review
passes, ~10 parallel Claude Code research agents ran the clinical-literature review (manualized SR
protocol, scheduler design, speech tech, regulatory, caregiver-delivery evidence, competitive
landscape), then a third pass of 3 agents hardened the resulting spec for engineering correctness.
This file is the trail: each row is a v2 assumption the evidence overturned, with the source and
the build consequence. Full citations: `PLAN.md` §1, §3, Appendix.

## What changed, and why

| v2 assumed | Evidence said | v3/v4 does |
|---|---|---|
| Reuse FrançaisFlow's **FSRS** scheduler as the core engine | FSRS excludes sub-minute intervals from its own training, needs hundreds of reviews to personalize (a new patient has zero), and was fit on healthy motivated learners. The only RCT-validated dementia scheduler (**USMART**) is a deterministic doubling/halving ladder. | **Drop FSRS from the core.** A deterministic ×2 expanding ladder (within-session) + a simple monotone state machine (between-session). FSRS-style ML is demoted to a *V2 population-prior* only. |
| **Interleave 1–3 targets** per session | Classic dementia SR trains **one target at a time, sequentially to mastery**. Interleaving appears only in *aphasia* work (Fridriksson 2005), and even there as N *independent* state machines, never a shared clock. | **Single-target MVP.** Multi-target (V1+) = N independent state machines, never a shared ladder. |
| On a miss, use a **cueing hierarchy** (semantic → phonemic → …) | **Bourgeois et al. 2003** compared SR vs a cueing-hierarchy approach head-to-head — **SR won** on goals attained and maintenance. Classic SR correction = give the answer immediately, patient repeats, revert one rung (errorless). | **Errorless immediate correction is the spine.** Cueing hierarchy demoted to an *optional, experimental* enhancement for hard targets only. |
| Position as **"SRT therapy for early-stage dementia"** | EU MDR reads past marketing to intended purpose; a disease-targeted "therapy" plausibly qualifies as a medical device (Class IIa once it has trend features). Live enforcement precedent exists (SeniorLife FDA warning 2025; Lumosity FTC $2M). | **Two deliberate framings.** Hackathon/demo: name dementia, cite the neuroscience (a research prototype for judges, not a marketed product). Commercial: wellness/caregiver-support positioning, never name the disease, "show the data, never the diagnosis." |
| Sell on **"protocol fidelity enforcement"** for the caregiver | The best analog RCT (**iCST, n=356**) was null on patient cognition and failed on *adherence* (22% did zero sessions), not fidelity. The tester/corrector dynamic **harms the relationship**. | **Adherence-first, device-as-therapist.** The app delivers the recall prompt and the correction — the patient reads the answer off the screen, not off their spouse's face. Caregiver's job is presence and the outcome tap, not enforcement. |

## What the v4 engineering pass hardened

The science held across all three passes; the *spec* needed pinning down before it was testable:
- **`unclear` outcome semantics** — a third input state the earlier machine didn't branch on. Now:
  re-probe at the same interval, no correction, no ladder movement; two consecutive unclears →
  treated as a confirmed miss.
- **End-on-win reconciled** — one rule, not two conflicting ones: 2 consecutive misses at the base
  rung → always exit via a guaranteed 0-second success, never on a failure.
- **Mastery = 3 consecutive session-start successes on *distinct calendar days*, patient timezone**
  — makes mastery ungameable (back-to-back "sessions" in one sitting can't fast-track it).
- **The engine is a pure reducer with an injected clock** — zero `Date.now()`/`setTimeout` in
  `packages/core`; `DEMO_SPEED` scales only the wall-clock wait for the demo, never persisted data.

See `PLAN.md` §1 (the full table with citations), §3 (scientific foundation), §4–§5 (protocol and
scheduler spec) for sources and the complete reasoning.
