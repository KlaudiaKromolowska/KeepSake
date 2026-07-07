# Keepsake

**A caregiver companion for shared memory practice** — extending Spaced Retrieval (SR), an
evidence-based clinical memory intervention, from the therapy room into the home.

Built for **Built with Claude: Life Sciences** (Anthropic × Gladstone Institutes × Cerebral Valley),
Builder Track — *"Build Beyond the Bench."*

---

## The problem

Spaced Retrieval Training (SRT) is a recognized memory intervention for people with early-stage
dementia: they relearn *functional* information — a grandchild's name, a safe-swallowing strategy,
"my walker is by the door" — by recalling it at expanding time intervals with immediate errorless
correction. It works, but it's bottlenecked by clinician time: delivered by hand, with a stopwatch
and index cards, ~1–2 sessions a week, and the acquisition data is lost to paper.

## What Keepsake does

A speech-language pathologist defines a functional target; **Claude** turns a caregiver's messy
description into a correctly phrased, dual-coded target with accepted-answer criteria and a safety
check. The app then runs SR sessions on a deterministic expanding-interval scheduler with automated
errorless correction — so the caregiver never touches the timing or correction rules, and never has
to "test" or "correct" their own family member. Every session produces the structured acquisition
data clinicians currently can't capture.

**Design principle: the device is the therapist; the caregiver is the companion.**

## Status

Hackathon build in progress (Jul 7–13 2026). See:

- **[`PLAN.md`](./PLAN.md)** — the authoritative build plan: clinical/neuroscience foundation, the
  exact protocol spec, scheduler architecture, MVP/V1/V2/V3 tiers, regulatory positioning, pilot
  design, and the full research trail with citations.
- **[`CLAUDE.md`](./CLAUDE.md)** — engineering conventions and the non-negotiable design decisions.
- **[`HANDOFF.md`](./HANDOFF.md)** — cross-environment context snapshot.

## How it was built

The design was shaped by a multi-agent literature review run with Claude Code — parallel research
agents that surfaced evidence which overturned the initial design twice (dropping an off-the-shelf
spaced-repetition scheduler for a clinically-validated deterministic ladder; replacing a cueing
hierarchy with immediate errorless correction after a head-to-head trial favored it). The reasoning
trail is documented in `PLAN.md`.

## License

MIT — see [`LICENSE`](./LICENSE).

---

*Keepsake is a caregiver-support and cognitive-engagement tool. It is not a medical device and does
not diagnose, treat, or prevent any disease.*
