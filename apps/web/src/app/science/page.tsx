import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "The science — Keepsake",
  description:
    "The evidence trail behind Keepsake's spaced-retrieval engine, what it changed our minds on, how Claude is used, and what's still unproven.",
};

/**
 * Public, judge-facing "why we built it this way" page for the Built with Claude: Life Sciences
 * hackathon — also the live-final Q&A crib sheet. No auth gate (top-level route, outside the
 * (app) group's requireUser layout). Static content Server Component: every claim here traces to
 * PLAN.md §1/§3/§5 or the shipped code (apps/web/src/lib/ai/core.ts, docs/simulation/README.md) —
 * nothing here is invented. Hackathon framing (PLAN.md §1b Reframe #2): naming dementia and citing
 * the neuroscience is deliberate on THIS page, for judges — the product's own in-app copy stays
 * wellness-safe (see SiteFooter / lib/copy.ts).
 */

const TRAIL = [
  {
    tag: "Dropped",
    title: "FSRS as the core scheduler",
    assumed:
      "Reuse the FSRS scheduler — the same one that drives modern flashcard apps — as Keepsake's core memory engine.",
    evidence:
      "FSRS excludes sub-minute intervals from its own training data, needs hundreds of reviews per item to personalize (a new patient starts at zero), and was fit on healthy, motivated learners. The only RCT-validated dementia scheduler, USMART, is a deterministic doubling/halving ladder.",
    now: "Two bespoke, testable mechanisms instead: a deterministic ×2 expanding ladder within a session, plus a simple monotone state machine between sessions. FSRS-style ML is demoted to an optional, V2-only population prior — never the core.",
  },
  {
    tag: "Dropped",
    title: "The cueing hierarchy",
    assumed:
      "On a miss, walk the patient down a cueing hierarchy — a semantic hint, then a phonemic hint, then more — before giving the answer.",
    evidence:
      "Bourgeois et al. (2003) compared spaced retrieval against a cueing-hierarchy approach head-to-head. Spaced retrieval won, on both goals attained and maintenance.",
    now: "Errorless immediate correction is the spine: on a miss the device shows the answer at once, the patient repeats it, and the interval reverts. Cueing becomes an optional, experimental add-on for stubborn targets only — never the default path.",
  },
  {
    tag: "Reframed",
    title: "How we talk about it",
    assumed:
      "Market Keepsake as “spaced retrieval therapy for early-stage dementia” — name the diagnosis, lead with the clinical claim.",
    evidence:
      "EU MDR reads past marketing language to intended purpose; a disease-targeted “therapy” plausibly qualifies as a Class IIa medical device once it has trend or reporting features. Enforcement is live — a 2025 FDA warning letter to a senior-focused app, a $2M FTC settlement with Lumosity over unsupported claims.",
    now: "Two framings, kept deliberately separate. For this hackathon and these judges: we name dementia and cite the neuroscience — it's a research prototype, and that's a strength, not a risk. Any future commercial version drops the disease name for wellness/caregiver-support positioning: show the data, never the diagnosis.",
  },
] as const;

const KEPT = [
  {
    title: "A deterministic ladder, not a fitted model",
    body: "Interval math is arithmetic — ×2 on a hit, ÷2 on a miss, clamped to a floor and ceiling — not a model fit on someone else's data. Every rung is reproducible and unit-tested.",
  },
  {
    title: "One target at a time, to mastery",
    body: "Targets train sequentially, never interleaved. Interleaving only appears in aphasia research, and even there as fully independent state machines — never a shared clock.",
  },
  {
    title: "The device delivers the correction",
    body: "On a miss, the screen shows the answer — the patient reads it off the device, not off their child's face. It keeps the caregiver a companion, not a tester.",
  },
  {
    title: "Adherence over fidelity",
    body: "The best analog trial (iCST, n=356) was null on cognition and failed on adherence — 22% of caregivers ran zero sessions. Fidelity wasn't the failure mode; showing up was. Keepsake is built to bring the dyad back tomorrow, not just to grade today's session correctly.",
  },
  {
    title: "Mastery on three distinct days",
    body: "Correct at the start of three separate sessions, on three different calendar days, in the patient's own timezone — not three attempts in one sitting. That makes mastery ungameable.",
  },
  {
    title: "A candidacy screen before training",
    body: "Every target passes a Brush & Camp screen — can this person even attempt 0s/15s/30s recall — before it enters training at all.",
  },
  {
    title: "Every target is dual-coded",
    body: "Question paired with an image, always. Picture superiority is amplified in dementia, and it's cheap to build in from day one.",
  },
] as const;

const CLAUDE_USAGE = [
  {
    kind: "Target wizard",
    model: "claude-sonnet-5",
    what: "Turns a messy caregiver description into one candidate target, then checks its own draft against the SR fidelity rules and re-asks itself once on a violation — the rejected draft and the reason are visible, not hidden retry plumbing.",
    where: "lib/wizard/actions.ts",
  },
  {
    kind: "Photo QA",
    model: "claude-sonnet-5 (vision)",
    what: "One native vision call judges whether a photo works as a dual-coding cue — clear face, single subject, no distracting clutter — and suggests a crop or rejects a cluttered group shot.",
    where: "lib/wizard/vision-actions.ts",
  },
  {
    kind: "Session debrief",
    model: "claude-sonnet-5",
    what: "Streams a short, warm narrative summary of how a practice session went, written for the caregiver.",
    where: "app/api/debrief/route.ts",
  },
  {
    kind: "Etiology reasoning",
    model: "claude-sonnet-5 (extended thinking)",
    what: "Streams its own visible reasoning on how a patient's etiology — Alzheimer's, vascular, Lewy body … — should tune interval and cue-format defaults, before a deterministic mapping reconciles the final recommendation.",
    where: "app/api/etiology/route.ts",
  },
  {
    kind: "RCT-in-a-box report",
    model: "claude-sonnet-5 (agentic tool use)",
    what: "Runs its own analysis tools over one dyad's trial logs — acquisition rate, reset resilience, interval band — and writes a mini study report, n=1 caveats stated plainly.",
    where: "lib/ai/rct-report.ts",
  },
  {
    kind: "Real-time grading",
    model: "claude-haiku-4-5",
    what: "Fuzzy-matches a caregiver's typed answer against accepted variants for live pass/fail grading. Fast and cheap by design — it runs on every trial.",
    where: "lib/session/grade-actions.ts",
  },
  {
    kind: "Distractor prompts",
    model: "claude-haiku-4-5",
    what: "Generates a dyad-specific filler-conversation prompt for the wait between intervals — prevents rehearsal and keeps the pause connective rather than dead air.",
    where: "lib/session/distractor-actions.ts",
  },
] as const;

const LIMITATIONS = [
  "Research prototype, not a medical device. Built for a one-week hackathon; not submitted for any regulatory clearance and not clinically validated.",
  "MVP outcome input is a caregiver tap, not speech. Three states — recall / miss / unclear. “Unclear” never moves the ladder; two consecutive unclears count as a confirmed miss.",
  "Scheduling precision is day-level. Mastery and boosters are tracked to the calendar day in the patient's timezone, not to the second between sessions.",
  "In-silico validation is not a clinical trial. The engine has been driven through 1,000 synthetic patients (median 23.3 days to mastery; seed 42, 90-day horizon) to sanity-check its dynamics, against a deliberately illustrative, uncalibrated memory model — not fit to any real patient data. It shows the engine behaves sensibly. It is not evidence about real recall.",
  "English copy is QA'd for this build. Polish is scaffolded but not yet reviewed by a native speaker — clinical-adjacent copy needs that pass before it ships.",
  "GDPR Art. 9 handling is designed-for, not pilot-audited. Row-level security on every table, server-only secrets, auth-gated and rate-limited AI routes — but dual consent and a DPIA are still required before any real patient data touches this system.",
] as const;

export default function SciencePage() {
  return (
    <>
      <main className="flex flex-1 flex-col items-center bg-white px-6 py-16 text-zinc-900 sm:py-20">
        <div className="flex w-full max-w-3xl flex-col gap-20">
          <header className="flex flex-col gap-5">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">
              The science behind Keepsake
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              We changed our minds twice. Here&rsquo;s the evidence that made us.
            </h1>
            <p className="max-w-2xl text-xl leading-relaxed text-zinc-700">
              Keepsake runs on Spaced Retrieval (SR) &mdash; a manualized memory-practice protocol
              from dementia rehabilitation research (Camp 1989; Brush &amp; Camp 1998). Two review
              passes, run by parallel Claude Code research agents combing the clinical literature,
              overturned our own first design. This page is the honest trail: what we tried, what
              the evidence said, what Claude actually does under the hood, and what we still
              don&rsquo;t know.
            </p>
          </header>

          <section aria-labelledby="trail-heading" className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h2 id="trail-heading" className="text-2xl font-semibold sm:text-3xl">
                What the evidence overturned
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-zinc-600">
                Sourced from ~10 parallel research agents across the manualized protocol, scheduler
                design, speech tech, regulatory landscape, caregiver-delivery evidence, and the
                competitive field &mdash; each row below is a design we held, and dropped or
                revised, on evidence.
              </p>
            </div>

            <ol className="flex flex-col gap-6">
              {TRAIL.map((row, i) => (
                <li
                  key={row.title}
                  className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-6 sm:flex-row sm:gap-8 sm:p-8"
                >
                  <div
                    aria-hidden="true"
                    className="text-4xl font-light leading-none text-zinc-200 sm:text-5xl"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="flex flex-1 flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        {row.tag}
                      </span>
                      <h3 className="text-xl font-semibold">{row.title}</h3>
                    </div>
                    <dl className="flex flex-col gap-3 text-base leading-relaxed">
                      <div>
                        <dt className="font-medium text-zinc-500">We assumed</dt>
                        <dd className="text-zinc-600">{row.assumed}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-zinc-500">The evidence said</dt>
                        <dd className="text-zinc-700">{row.evidence}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-zinc-500">What we do now</dt>
                        <dd className="font-medium text-zinc-900">{row.now}</dd>
                      </div>
                    </dl>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="kept-heading" className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h2 id="kept-heading" className="text-2xl font-semibold sm:text-3xl">
                What stayed, on purpose
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-zinc-600">
                Every pass since the first draft has kept these. They&rsquo;re the load-bearing
                decisions.
              </p>
            </div>

            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {KEPT.map((item) => (
                <li
                  key={item.title}
                  className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-6"
                >
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-base leading-relaxed text-zinc-600">{item.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="claude-heading" className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h2 id="claude-heading" className="text-2xl font-semibold sm:text-3xl">
                Claude usage map
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-zinc-600">
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-base">claude-sonnet-5</code>{" "}
                handles generation and reasoning;{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-base">
                  claude-haiku-4-5
                </code>{" "}
                handles cheap, real-time calls that run on every trial. The long SR-protocol system
                prompt is cached (
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-base">
                  cache_control: ephemeral
                </code>
                ) across calls, every AI route is auth-gated and rate-limited (per-user hourly +
                global daily caps), and recorded fixtures (
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-base">
                  CLAUDE_FIXTURES=1
                </code>
                ) replay real, schema-checked model output for demo takes without a live API
                round-trip.
              </p>
            </div>

            <div className="w-full overflow-x-auto rounded-2xl border border-zinc-200">
              <table className="w-full min-w-[640px] border-collapse text-left text-base">
                <caption className="sr-only">
                  Which Claude model powers each Keepsake feature, and where in the code it runs.
                </caption>
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th scope="col" className="px-4 py-3 font-semibold text-zinc-700">
                      Feature
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-zinc-700">
                      Model
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-zinc-700">
                      What it does
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-zinc-700">
                      Where
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {CLAUDE_USAGE.map((row) => (
                    <tr key={row.kind} className="align-top">
                      <th
                        scope="row"
                        className="whitespace-nowrap px-4 py-4 font-medium text-zinc-900"
                      >
                        {row.kind}
                      </th>
                      <td className="whitespace-nowrap px-4 py-4 text-zinc-600">
                        <code className="text-sm">{row.model}</code>
                      </td>
                      <td className="px-4 py-4 leading-relaxed text-zinc-600">{row.what}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-zinc-500">
                        <code>{row.where}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="limitations-heading" className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h2 id="limitations-heading" className="text-2xl font-semibold sm:text-3xl">
                Honest limitations
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-zinc-600">
                This is a research prototype built in a week. Here&rsquo;s what it doesn&rsquo;t
                claim.
              </p>
            </div>

            <ul className="flex flex-col gap-4">
              {LIMITATIONS.map((item) => (
                <li
                  key={item}
                  className="rounded-2xl border border-zinc-200 p-5 text-base leading-relaxed text-zinc-700"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <Link
            href="/"
            className="flex min-h-[48px] w-fit items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            Back to Keepsake
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
