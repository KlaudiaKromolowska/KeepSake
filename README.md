# Keepsake

**Spaced Retrieval memory practice for early-stage dementia — the clinician's protocol, carried into
the home by a family caregiver and coached by Claude.**

Built for **Built with Claude: Life Sciences** (Anthropic × Gladstone Institutes × Cerebral Valley),
Builder Track — *"Build Beyond the Bench."*

**▶ Live demo: https://keepsake-nu.vercel.app**

---

## Why this matters

Spaced Retrieval Training has helped people with dementia relearn what matters — a grandchild's name,
"my walker is by the door," a safe-swallowing strategy — **since the 1990s**. It rides procedural
memory, which stays relatively intact into moderate dementia: the person recalls a functional fact at
**expanding time intervals**, with **immediate errorless correction** on a miss. It's ANCDS/ASHA-
recognized, and the evidence has been stable for two decades.

And yet its biggest questions are *still open* — expanding vs. uniform intervals, errorless vs.
effortful correction, caregiver vs. clinician delivery — for one mundane reason: **the practice happens
at home, and the data dies on paper.** A clinician delivers it by hand, with a stopwatch and index
cards, once or twice a week. No trial has ever had structured, trial-level logs from hundreds of home
dyads. That's the **20-year gap**.

Keepsake is one instrument aimed at both problems at once: **the device carries the protocol so the
caregiver can just be family** — and, by construction, every session it runs becomes a protocol-faithful
trial log. **Every install is a study site.**

**Design principle: the device is the therapist; the caregiver is the companion.**

---

## How we used Claude

Nine purpose-fit Claude surfaces do real clinical work — auth-gated, rate-limited, and zod-validated
before anything is persisted or rendered (model output is never trusted). The highlights:

- **RCT-in-a-box — an agentic research report.** Claude is *not* handed the trial log. It gets a
  free-text research question and a fixed menu of five analysis tools, then a multi-turn tool-use loop
  (`claude-sonnet-5`, `tool_choice: auto`) lets it **choose which analyses to run**, read the
  aggregates, and write an honest **n=1** study report. The ordered list of tools it actually called is
  shown to the user as proof of agency.
- **Caregiver coach** — a boundaried, injection-safe copilot (the entire client transcript is treated
  as untrusted DATA, so no turn can steer it into "always reassure"), with a structural `escalate`
  safety flag.
- **Real-time grader** (`claude-haiku-4-5`) — a deterministic Levenshtein matcher resolves the easy
  cases in milliseconds; Haiku is called only on the ambiguous middle band, sub-second and biased to
  accept. It only *suggests*; it never records an outcome or moves the ladder.
- **The build itself** — Keepsake's design was shaped by a Claude Code **multi-agent literature review**
  (~10 parallel research agents) that overturned the initial design *twice*. Claude Code didn't just
  write the app; it did the neuroscience review that reshaped it (see the [research trail](./docs/research-trail.md)).

Plus vision dual-coding photo QA, a visible-self-critique target wizard, extended-thinking etiology
reasoning streamed on screen, personalized distractor generation, a private post-session debrief, and
booster-gated recognition lures. Full breakdown: [`docs/submission-writeup.md`](./docs/submission-writeup.md).

---

## Tech stack

- **Next.js 16** (App Router), **TypeScript strict**, Tailwind — kiosk-grade accessible UI (≥20–24px
  type, 60px touch targets, 7:1 contrast, no color-only signaling, no UI timeouts).
- **pnpm workspaces monorepo** — a thin `apps/web` over a framework-free `packages/core`.
- **Supabase (Postgres + Auth + Storage + RLS), EU region** — cognitive scores tied to a named patient
  are **GDPR Article 9 health data**; all schema is versioned migrations in-repo.
- **Claude API** — **`claude-sonnet-5`** for generation, reasoning, and the agentic report;
  **`claude-haiku-4-5`** for real-time grading and cheap high-volume generation. One server-only AI core
  owns the single client, quota enforcement, structured output, streaming, and fixture replay.

---

## Trust signals

- **970 passing tests** across `packages/core`, `apps/web`, and the RLS suite.
- **A cross-tenant RLS denial suite** (89 tests) proves, for **every table**, that a caregiver reads
  their own data, can *never* touch another's, an anonymous client gets nothing, and `audit_log` is
  append-only.
- **The SR engine is a pure reducer with an injected clock** — zero `Date.now()` / `setTimeout` in the
  core (grep-enforced), so the whole protocol is testable as plain values. **`fast-check` property
  tests** fuzz 7 invariants (interval always ∈ `[15s, 960s]`; reset never below last-success; mastery
  needs exactly 3 distinct-day session-starts; `unclear` never moves the ladder).
- **GDPR Article 9 posture** — RLS as the security boundary on every table, secrets server-only,
  auth-gated + rate-limited AI routes, hard delete with `ON DELETE CASCADE`, a separate append-only
  audit log, and strict data minimization into every Claude prompt.
- **Practitioner-validated mid-build** — [Monika Stroińska (Centrum Montessori
  Senior)](docs/expert-feedback-2026-07-08.md), who trains the SR-for-seniors method in Poland,
  reviewed the protocol before the first session screen shipped — validating the ladder and mastery
  rule, and changing five design decisions we folded in.

---

## Quickstart

```bash
pnpm install                       # Node >=24, pnpm 11
cp .env.example .env.local         # then fill Supabase + ANTHROPIC_API_KEY (server-only)
supabase start                     # local Postgres + Auth (EU-region schema, migrations in-repo)
pnpm seed                          # seed the demo dyad (Marta → "Lena") + trial history
pnpm dev                           # http://localhost:3000
```

---

## Docs

- **[`docs/research-trail.md`](./docs/research-trail.md)** — the
  evidence-driven design *reversals*: where the literature overturned our first ideas (FSRS → a
  deterministic ladder; a cueing hierarchy → errorless correction), plus the mid-build practitioner
  iteration.
- **[`docs/submission-writeup.md`](./docs/submission-writeup.md)** — the full hackathon writeup: the
  nine Claude surfaces, the science, security, and what's next.
- **[`docs/film-script.md`](./docs/film-script.md)** — the 3-minute demo film script.
- **[`PLAN.md`](./PLAN.md)** — the authoritative build plan (science, protocol spec, scheduler, tiers,
  regulatory positioning, pilot design, citations).
- **[`CLAUDE.md`](./CLAUDE.md)** — engineering conventions and non-negotiable design decisions.

## License

MIT — see [`LICENSE`](./LICENSE).

---

*Keepsake is a caregiver-support and cognitive-engagement tool. It is a **research prototype** built for
a hackathon, is **not a medical device**, and does not diagnose, treat, or prevent any disease. The demo
uses a **fictional, consented persona** and contains **no real patient data**.*
