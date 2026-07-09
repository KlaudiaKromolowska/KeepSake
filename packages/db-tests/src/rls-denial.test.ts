// Cross-tenant RLS denial test — the permanent, CI-enforced version of the manual psql probe run
// during Task 6's security review. Proves, for every table in supabase/migrations, that:
//   1) a caregiver can read/write their OWN data (positive control — guards against a vacuously
//      "passing" denial test where nobody can do anything),
//   2) a caregiver can NEVER read, insert into, update, or delete another caregiver's data,
//   3) an unauthenticated (anon) client gets nothing anywhere,
//   4) audit_log is genuinely append-only, even for its own owner.
//
// Requires the local Supabase stack running (`supabase start`). Reads SUPABASE_URL /
// SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY from the environment (CI sets these from
// `supabase status -o env`); falls back to shelling out to that command once, locally.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface Graph {
  userId: string;
  email: string;
  password: string;
  patientId: string;
  targetId: string;
  sessionId: string;
  trialId: string;
  auditLogId: number;
  aiUsageId: string;
}

interface InsertResult {
  data: Record<string, unknown> | null;
  error: { code?: string; message: string } | null;
}

interface CrossInsertResult {
  error: { code?: string; message: string } | null;
  /** Exact-match column values identifying the row the attacker tried to create, so the caller
   *  can prove via service role that it was never persisted — not just that an error came back. */
  marker: Record<string, unknown>;
}

interface TableSpec {
  table: string;
  pk: string;
  ownRowId: (g: Graph) => string | number;
  /** false only for audit_log: insert-only, unreadable even by its own owner. */
  readableByOwner: boolean;
  /** false only for audit_log: append-only, immutable even by its own owner. */
  ownerCanMutate: boolean;
  /** Insert a brand-new row fully owned by `g` (creating any extra parent rows it needs). */
  insertOwn: (client: SupabaseClient, g: Graph) => Promise<InsertResult>;
  /** As `attackerClient` (belonging to `attacker`), attempt to insert into `victim`'s container.
   *  Must be a bare `.insert()` with no `.select()` chained — chaining a RETURNING clause makes
   *  the error ambiguous between "WITH CHECK blocked the insert" and "no SELECT policy exists to
   *  return the row", which is vacuous for tables like audit_log that have no SELECT policy at
   *  all. The returned `marker` lets the caller independently verify non-persistence. */
  insertCross: (
    attackerClient: SupabaseClient,
    attacker: Graph,
    victim: Graph,
  ) => Promise<CrossInsertResult>;
  /** A payload anon can attempt to insert using known-valid (graphA's) ids. */
  anonInsertPayload: (g: Graph) => Record<string, unknown>;
  /** Fields to attempt to change; used for both the positive-control and cross-tenant update. */
  updatePatch: Record<string, unknown>;
}

function resolveEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  const notRunning =
    "local Supabase stack not running — start it with `supabase start`, or set " +
    "SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.";
  let output: string;
  try {
    output = execSync("supabase status -o env", { encoding: "utf-8" });
  } catch {
    throw new Error(notRunning);
  }
  const vars = Object.fromEntries(
    [...output.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(([, key, value]) => [key, value]),
  );
  const url = vars.API_URL;
  const anonKey = vars.ANON_KEY;
  const serviceRoleKey = vars.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) throw new Error(notRunning);
  return { url, anonKey, serviceRoleKey };
}

async function assertReachable(url: string): Promise<void> {
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`health endpoint returned ${res.status}`);
  } catch {
    throw new Error(
      `local Supabase stack not reachable at ${url} — start it with \`supabase start\`.`,
    );
  }
}

let url: string;
let anonKey: string;
let admin: SupabaseClient;
let anonClient: SupabaseClient;
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let graphA: Graph;
let graphB: Graph;

async function seedGraph(email: string, password: string): Promise<Graph> {
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !userData.user)
    throw new Error(`createUser failed for ${email}: ${userErr?.message}`);
  const userId = userData.user.id;

  const { data: patient, error: patientErr } = await admin
    .from("patients")
    .insert({ caregiver_id: userId, display_name: `Patient ${email}`, timezone: "UTC" })
    .select("id")
    .single();
  if (patientErr || !patient) throw new Error(`seed patient failed: ${patientErr?.message}`);

  const { data: target, error: targetErr } = await admin
    .from("targets")
    .insert({ patient_id: patient.id, question: "seed question", answer: "seed answer" })
    .select("id")
    .single();
  if (targetErr || !target) throw new Error(`seed target failed: ${targetErr?.message}`);

  const { data: session, error: sessionErr } = await admin
    .from("sessions")
    .insert({ patient_id: patient.id, started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (sessionErr || !session) throw new Error(`seed session failed: ${sessionErr?.message}`);

  const { data: trial, error: trialErr } = await admin
    .from("trials")
    .insert({
      session_id: session.id,
      target_id: target.id,
      interval_sec: 30,
      outcome: "recall",
      at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (trialErr || !trial) throw new Error(`seed trial failed: ${trialErr?.message}`);

  const { error: targetStateErr } = await admin
    .from("target_state")
    .insert({ target_id: target.id });
  if (targetStateErr) throw new Error(`seed target_state failed: ${targetStateErr.message}`);

  const { error: consentErr } = await admin
    .from("consent")
    .insert({ patient_id: patient.id, patient_consent: true, caregiver_role_ack: true });
  if (consentErr) throw new Error(`seed consent failed: ${consentErr.message}`);

  const { data: auditLog, error: auditErr } = await admin
    .from("audit_log")
    .insert({ caregiver_id: userId, action: "consent_granted", detail: {} })
    .select("id")
    .single();
  if (auditErr || !auditLog) throw new Error(`seed audit_log failed: ${auditErr?.message}`);

  const { data: aiUsage, error: aiUsageErr } = await admin
    .from("ai_usage")
    .insert({ caregiver_id: userId, kind: "wizard" })
    .select("id")
    .single();
  if (aiUsageErr || !aiUsage) throw new Error(`seed ai_usage failed: ${aiUsageErr?.message}`);

  return {
    userId,
    email,
    password,
    patientId: patient.id,
    targetId: target.id,
    sessionId: session.id,
    trialId: trial.id,
    auditLogId: auditLog.id,
    aiUsageId: aiUsage.id,
  };
}

async function signInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

beforeAll(async () => {
  const env = resolveEnv();
  url = env.url;
  anonKey = env.anonKey;
  await assertReachable(url);

  admin = createClient(url, env.serviceRoleKey);
  anonClient = createClient(url, anonKey);

  const password = () => `Aa1-${randomUUID()}`;
  graphA = await seedGraph(`a-${randomUUID()}@keepsake.test`, password());
  graphB = await seedGraph(`b-${randomUUID()}@keepsake.test`, password());

  clientA = await signInClient(graphA.email, graphA.password);
  clientB = await signInClient(graphB.email, graphB.password);

  // Sanity-check auth actually took: a silently-anon client (bad password plumbing, wrong
  // project, stale key) must fail the suite loudly here, not incidentally via passing "denial"
  // tests further down that would be vacuous against an anon session.
  const [userA, userB] = await Promise.all([clientA.auth.getUser(), clientB.auth.getUser()]);
  if (userA.data.user?.id !== graphA.userId) {
    throw new Error(
      `clientA did not authenticate as graphA: expected ${graphA.userId}, got ${userA.data.user?.id ?? "anon"}`,
    );
  }
  if (userB.data.user?.id !== graphB.userId) {
    throw new Error(
      `clientB did not authenticate as graphB: expected ${graphB.userId}, got ${userB.data.user?.id ?? "anon"}`,
    );
  }
}, 30000);

afterAll(async () => {
  // beforeAll may have thrown before `admin` was even created (e.g. resolveEnv/assertReachable
  // failure) — nothing was seeded, so there is nothing to clean up.
  if (!admin) return;

  // Only include graphs that actually finished seeding — a mid-beforeAll throw can leave one of
  // graphA/graphB undefined, and this must not abort cleanup of the other.
  const graphs = [graphA, graphB].filter((g): g is Graph => Boolean(g));
  const userIds = graphs.map((g) => g.userId);

  if (userIds.length > 0) {
    // audit_log deliberately has no FK to auth.users (must survive account erasure) — delete it
    // explicitly. Everything else cascades from patients -> auth.users on user deletion.
    try {
      const { error } = await admin.from("audit_log").delete().in("caregiver_id", userIds);
      if (error) console.warn(`audit_log cleanup failed: ${error.message}`);
    } catch (err) {
      console.warn(`audit_log cleanup threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const g of graphs) {
    try {
      const { error } = await admin.auth.admin.deleteUser(g.userId);
      if (error) console.warn(`deleteUser failed for ${g.email}: ${error.message}`);
    } catch (err) {
      console.warn(
        `deleteUser threw for ${g.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // The leftover-rows assertion only makes sense when both sides of the cross-tenant graph
  // existed — with just one graph there's no cross-tenant cleanup to verify.
  if (graphA && graphB) {
    const leftoverPatients = await admin.from("patients").select("id").in("caregiver_id", userIds);
    expect(leftoverPatients.data ?? []).toHaveLength(0);

    const leftoverAudit = await admin.from("audit_log").select("id").in("caregiver_id", userIds);
    expect(leftoverAudit.data ?? []).toHaveLength(0);
  }
}, 30000);

const tableSpecs: TableSpec[] = [
  {
    table: "patients",
    pk: "id",
    ownRowId: (g) => g.patientId,
    readableByOwner: true,
    ownerCanMutate: true,
    insertOwn: async (client, g) =>
      await client
        .from("patients")
        .insert({ caregiver_id: g.userId, display_name: "extra patient", timezone: "UTC" })
        .select("id")
        .single(),
    insertCross: async (client, _attacker, victim) => {
      const marker = { caregiver_id: victim.userId, display_name: "impersonation" };
      const { error } = await client.from("patients").insert({ ...marker, timezone: "UTC" });
      return { error, marker };
    },
    anonInsertPayload: (g) => ({ caregiver_id: g.userId, display_name: "anon", timezone: "UTC" }),
    updatePatch: { display_name: "changed" },
  },
  {
    table: "targets",
    pk: "id",
    ownRowId: (g) => g.targetId,
    readableByOwner: true,
    ownerCanMutate: true,
    insertOwn: async (client, g) =>
      await client
        .from("targets")
        .insert({ patient_id: g.patientId, question: "extra q", answer: "extra a" })
        .select("id")
        .single(),
    insertCross: async (client, _attacker, victim) => {
      const marker = { patient_id: victim.patientId, question: "attack" };
      const { error } = await client.from("targets").insert({ ...marker, answer: "attack" });
      return { error, marker };
    },
    anonInsertPayload: (g) => ({ patient_id: g.patientId, question: "anon", answer: "anon" }),
    updatePatch: { question: "changed" },
  },
  {
    table: "sessions",
    pk: "id",
    ownRowId: (g) => g.sessionId,
    readableByOwner: true,
    ownerCanMutate: true,
    insertOwn: async (client, g) =>
      await client
        .from("sessions")
        .insert({ patient_id: g.patientId, started_at: new Date().toISOString() })
        .select("id")
        .single(),
    insertCross: async (client, _attacker, victim) => {
      const marker = { patient_id: victim.patientId, started_at: new Date().toISOString() };
      const { error } = await client.from("sessions").insert(marker);
      return { error, marker };
    },
    anonInsertPayload: (g) => ({ patient_id: g.patientId, started_at: new Date().toISOString() }),
    // affect_pre/affect_post (5.4) ride the same patch so the cross-tenant UPDATE denial below
    // proves B cannot write A's affect columns, and the positive control proves the owner can.
    updatePatch: {
      summary: { note: "changed" },
      affect_pre: "content",
      affect_post: "unsettled",
    },
  },
  {
    table: "trials",
    pk: "id",
    ownRowId: (g) => g.trialId,
    readableByOwner: true,
    ownerCanMutate: true,
    insertOwn: async (client, g) =>
      await client
        .from("trials")
        .insert({
          session_id: g.sessionId,
          target_id: g.targetId,
          interval_sec: 45,
          outcome: "recall",
          at: new Date().toISOString(),
        })
        .select("id")
        .single(),
    insertCross: async (client, _attacker, victim) => {
      const marker = {
        session_id: victim.sessionId,
        target_id: victim.targetId,
        at: new Date().toISOString(),
      };
      const { error } = await client
        .from("trials")
        .insert({ ...marker, interval_sec: 45, outcome: "recall" });
      return { error, marker };
    },
    anonInsertPayload: (g) => ({
      session_id: g.sessionId,
      target_id: g.targetId,
      interval_sec: 45,
      outcome: "recall",
      at: new Date().toISOString(),
    }),
    updatePatch: { outcome: "miss" },
  },
  {
    table: "target_state",
    pk: "target_id",
    ownRowId: (g) => g.targetId,
    readableByOwner: true,
    ownerCanMutate: true,
    insertOwn: async (client, g) => {
      // target_state's PK is target_id (1:1) and the seeded target already has a row, so create a
      // fresh target first — exercising the client's real targets -> target_state permission chain.
      const { data: target, error: targetErr } = await client
        .from("targets")
        .insert({ patient_id: g.patientId, question: "extra q", answer: "extra a" })
        .select("id")
        .single();
      if (targetErr || !target) return { data: null, error: targetErr };
      return client
        .from("target_state")
        .insert({ target_id: target.id })
        .select("target_id")
        .single();
    },
    insertCross: async (client, _attacker, victim) => {
      // Give the victim a target with no target_state row yet, via service role, so the attacker's
      // insert is blocked by RLS alone — not incidentally by a PK collision with the seeded row.
      const { data: extraTarget, error: scaffoldErr } = await admin
        .from("targets")
        .insert({ patient_id: victim.patientId, question: "victim extra", answer: "x" })
        .select("id")
        .single();
      if (scaffoldErr || !extraTarget) throw new Error(`scaffold failed: ${scaffoldErr?.message}`);
      const marker = { target_id: extraTarget.id };
      const { error } = await client.from("target_state").insert(marker);
      return { error, marker };
    },
    anonInsertPayload: (g) => ({ target_id: g.targetId }),
    updatePatch: { start_streak: 5 },
  },
  {
    table: "consent",
    pk: "patient_id",
    ownRowId: (g) => g.patientId,
    readableByOwner: true,
    ownerCanMutate: true,
    insertOwn: async (client, g) => {
      const { data: patient, error: patientErr } = await client
        .from("patients")
        .insert({ caregiver_id: g.userId, display_name: "extra for consent", timezone: "UTC" })
        .select("id")
        .single();
      if (patientErr || !patient) return { data: null, error: patientErr };
      return client
        .from("consent")
        .insert({ patient_id: patient.id })
        .select("patient_id")
        .single();
    },
    insertCross: async (client, _attacker, victim) => {
      const { data: extraPatient, error: scaffoldErr } = await admin
        .from("patients")
        .insert({ caregiver_id: victim.userId, display_name: "victim extra", timezone: "UTC" })
        .select("id")
        .single();
      if (scaffoldErr || !extraPatient) throw new Error(`scaffold failed: ${scaffoldErr?.message}`);
      const marker = { patient_id: extraPatient.id };
      const { error } = await client.from("consent").insert(marker);
      return { error, marker };
    },
    anonInsertPayload: (g) => ({ patient_id: g.patientId }),
    updatePatch: { granted_at: new Date().toISOString() },
  },
  {
    table: "audit_log",
    pk: "id",
    ownRowId: (g) => g.auditLogId,
    readableByOwner: false,
    ownerCanMutate: false,
    insertOwn: async (client, g) => {
      // audit_log has no SELECT policy for authenticated at all (insert-only by design), so
      // chaining `.select()` after insert would trigger a RETURNING clause that itself violates
      // RLS. Insert bare, then look the new row up via the service-role client.
      const { error } = await client
        .from("audit_log")
        .insert({ caregiver_id: g.userId, action: "data_access", detail: {} });
      if (error) return { data: null, error };
      return await admin
        .from("audit_log")
        .select("id")
        .eq("caregiver_id", g.userId)
        .eq("action", "data_access")
        .order("id", { ascending: false })
        .limit(1)
        .single();
    },
    insertCross: async (client, _attacker, victim) => {
      // Bare insert, no `.select()` — audit_log has no SELECT policy for authenticated at all,
      // so chaining `.select()` here would 42501 on the RETURNING regardless of whether
      // WITH CHECK actually held, making this vacuous against a weakened/dropped WITH CHECK.
      const marker = { caregiver_id: victim.userId, action: "data_export" };
      const { error } = await client.from("audit_log").insert({ ...marker, detail: {} });
      return { error, marker };
    },
    anonInsertPayload: (g) => ({ caregiver_id: g.userId, action: "data_access", detail: {} }),
    updatePatch: { detail: { changed: true } },
  },
  {
    // ai_usage: insert + select own only (immutable ledger — no update/delete policy).
    table: "ai_usage",
    pk: "id",
    ownRowId: (g) => g.aiUsageId,
    readableByOwner: true,
    ownerCanMutate: false,
    insertOwn: async (client, g) =>
      await client
        .from("ai_usage")
        .insert({ caregiver_id: g.userId, kind: "vision" })
        .select("id")
        .single(),
    insertCross: async (client, _attacker, victim) => {
      const marker = { caregiver_id: victim.userId, kind: "debrief" };
      const { error } = await client.from("ai_usage").insert(marker);
      return { error, marker };
    },
    anonInsertPayload: (g) => ({ caregiver_id: g.userId, kind: "wizard" }),
    updatePatch: { kind: "rct" },
  },
];

describe.each(tableSpecs)("RLS: $table", (spec) => {
  it("positive control: owner can read/write their own rows (guards against vacuous denial)", async () => {
    const select = await clientA
      .from(spec.table)
      .select(spec.pk)
      .eq(spec.pk, spec.ownRowId(graphA));
    if (spec.readableByOwner) {
      expect(select.error).toBeNull();
      expect(select.data).toHaveLength(1);
    } else {
      expect(select.data ?? []).toHaveLength(0);
    }

    const inserted = await spec.insertOwn(clientA, graphA);
    expect(inserted.error).toBeNull();
    const newId = inserted.data?.[spec.pk];
    expect(newId).toBeTruthy();
    if (newId === undefined || newId === null) return;

    const updated = await clientA
      .from(spec.table)
      .update(spec.updatePatch)
      .eq(spec.pk, newId)
      .select(spec.pk);
    const deleted = await clientA.from(spec.table).delete().eq(spec.pk, newId).select(spec.pk);
    if (spec.ownerCanMutate) {
      expect(updated.data ?? []).toHaveLength(1);
      expect(deleted.data ?? []).toHaveLength(1);
    } else {
      expect(updated.data ?? []).toHaveLength(0);
      expect(deleted.data ?? []).toHaveLength(0);
      // Not owner-deletable (audit_log is append-only) — clean up via service role.
      await admin.from(spec.table).delete().eq(spec.pk, newId);
    }
  });

  it("cross-tenant SELECT: B cannot see A's rows", async () => {
    const byId = await clientB.from(spec.table).select(spec.pk).eq(spec.pk, spec.ownRowId(graphA));
    expect(byId.error).toBeNull();
    expect(byId.data ?? []).toHaveLength(0);

    const unfiltered = await clientB.from(spec.table).select(spec.pk);
    expect(unfiltered.error).toBeNull();
    const rows = (unfiltered.data ?? []) as unknown as Record<string, unknown>[];
    const leaked = rows.some((row) => row[spec.pk] === spec.ownRowId(graphA));
    expect(leaked).toBe(false);
  });

  it("cross-tenant INSERT: B cannot insert into A's containers (42501), and nothing persists", async () => {
    const { error, marker } = await spec.insertCross(clientB, graphB, graphA);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");

    // Prove non-persistence directly via service role, not just that an error string came back —
    // a WITH CHECK that was weakened or dropped could still 42501 on the RETURNING clause for
    // tables without an authenticated SELECT policy (e.g. audit_log), while still letting the row
    // through. Bare insert above + this check closes that gap.
    const persisted = await admin.from(spec.table).select(spec.pk).match(marker);
    expect(persisted.data ?? []).toHaveLength(0);
  });

  it("cross-tenant UPDATE/DELETE: B's writes to A's rows affect 0 rows", async () => {
    const updated = await clientB
      .from(spec.table)
      .update(spec.updatePatch)
      .eq(spec.pk, spec.ownRowId(graphA))
      .select(spec.pk);
    expect(updated.data ?? []).toHaveLength(0);

    const deleted = await clientB
      .from(spec.table)
      .delete()
      .eq(spec.pk, spec.ownRowId(graphA))
      .select(spec.pk);
    expect(deleted.data ?? []).toHaveLength(0);

    // Confirm the row is untouched — not just that 0 rows were reported.
    const check = await admin
      .from(spec.table)
      .select("*")
      .eq(spec.pk, spec.ownRowId(graphA))
      .single();
    expect(check.data).not.toBeNull();
    for (const key of Object.keys(spec.updatePatch)) {
      expect(check.data?.[key]).not.toEqual(spec.updatePatch[key]);
    }
  });

  it("anon: unauthenticated client gets nothing", async () => {
    const select = await anonClient
      .from(spec.table)
      .select(spec.pk)
      .eq(spec.pk, spec.ownRowId(graphA));
    expect(select.data ?? []).toHaveLength(0);

    const { error } = await anonClient.from(spec.table).insert(spec.anonInsertPayload(graphA));
    expect(error).not.toBeNull();
  });
});

describe("re-parenting attacks", () => {
  it("B cannot re-parent their own patient to A's caregiver_id", async () => {
    const result = await clientB
      .from("patients")
      .update({ caregiver_id: graphA.userId })
      .eq("id", graphB.patientId)
      .select("id");
    if (result.error) {
      expect(result.error.code).toBe("42501");
    } else {
      expect(result.data ?? []).toHaveLength(0);
    }
    const check = await admin
      .from("patients")
      .select("caregiver_id")
      .eq("id", graphB.patientId)
      .single();
    expect(check.data?.caregiver_id).toBe(graphB.userId);
  });

  it("A cannot re-parent their own target onto B's patient", async () => {
    const result = await clientA
      .from("targets")
      .update({ patient_id: graphB.patientId })
      .eq("id", graphA.targetId)
      .select("id");
    if (result.error) {
      expect(result.error.code).toBe("42501");
    } else {
      expect(result.data ?? []).toHaveLength(0);
    }
    const check = await admin
      .from("targets")
      .select("patient_id")
      .eq("id", graphA.targetId)
      .single();
    expect(check.data?.patient_id).toBe(graphA.patientId);
  });
});

// Storage-object RLS — the same cross-tenant discipline as every table, extended to the private
// `target-photos` bucket (caregiver photo upload). Ownership is the leading path segment: an object
// is `<caregiver_id>/<uuid>.<ext>`, and the storage.objects policies scope every verb to
// `(storage.foldername(name))[1] = auth.uid()`. Proves an owner can round-trip their own object and
// that neither another caregiver nor anon can insert into, list, or download it.
describe("RLS: storage.objects (target-photos bucket)", () => {
  const BUCKET = "target-photos";
  // Content-Type (not bytes) drives the bucket's allowed_mime_types check, so any body + a png type
  // is enough to exercise the RLS policies (which are what this suite is about).
  const body = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const upload = (client: SupabaseClient, name: string) =>
    client.storage.from(BUCKET).upload(name, body, { contentType: "image/png" });
  const objectName = (g: Graph, tag: string) => `${g.userId}/${tag}-${randomUUID()}.png`;

  it("positive control: owner can upload, list, download, and delete under their own folder", async () => {
    const name = objectName(graphA, "own");
    const up = await upload(clientA, name);
    expect(up.error).toBeNull();
    expect(up.data?.path).toBe(name);

    const list = await clientA.storage.from(BUCKET).list(graphA.userId);
    expect(list.error).toBeNull();
    const listed = (list.data ?? []).map((o) => `${graphA.userId}/${o.name}`);
    expect(listed).toContain(name);

    const dl = await clientA.storage.from(BUCKET).download(name);
    expect(dl.error).toBeNull();

    const del = await clientA.storage.from(BUCKET).remove([name]);
    expect(del.error).toBeNull();
  });

  it("cross-tenant INSERT: B cannot upload into A's folder, and nothing persists", async () => {
    const name = `${graphA.userId}/attack-${randomUUID()}.png`;
    const up = await upload(clientB, name);
    expect(up.error).not.toBeNull();

    // Prove non-persistence directly via service role, not just that an error came back.
    const filename = name.slice(name.indexOf("/") + 1);
    const check = await admin.storage.from(BUCKET).list(graphA.userId, { search: filename });
    expect(check.data ?? []).toHaveLength(0);
  });

  it("cross-tenant SELECT: B cannot list or download A's objects", async () => {
    const name = objectName(graphA, "victim");
    expect((await upload(clientA, name)).error).toBeNull();

    const list = await clientB.storage.from(BUCKET).list(graphA.userId);
    expect(list.error).toBeNull();
    expect(list.data ?? []).toHaveLength(0);

    const dl = await clientB.storage.from(BUCKET).download(name);
    expect(dl.error).not.toBeNull();

    await admin.storage.from(BUCKET).remove([name]);
  });

  it("anon: unauthenticated client cannot upload", async () => {
    const name = `${graphA.userId}/anon-${randomUUID()}.png`;
    const up = await anonClient.storage.from(BUCKET).upload(name, body, {
      contentType: "image/png",
    });
    expect(up.error).not.toBeNull();
  });
});

describe("ai_calls_today() global counter", () => {
  it("returns the same global count for any caller, spanning all tenants", async () => {
    // Each graph seeded one ai_usage row (in the last day); the SECURITY DEFINER function counts
    // across tenants, bypassing the per-row SELECT policy — so both callers see the same total,
    // and it includes rows they cannot themselves SELECT.
    const fromA = await clientA.rpc("ai_calls_today");
    const fromB = await clientB.rpc("ai_calls_today");
    expect(fromA.error).toBeNull();
    expect(fromB.error).toBeNull();
    expect(Number(fromA.data)).toBeGreaterThanOrEqual(2);
    expect(fromA.data).toEqual(fromB.data);

    // Sanity: B genuinely cannot read A's ai_usage rows directly (the count above is only
    // reachable via the definer function, not via a normal SELECT).
    const bSeesA = await clientB.from("ai_usage").select("id").eq("id", graphA.aiUsageId);
    expect(bSeesA.data ?? []).toHaveLength(0);
  });
});

// Read-only clinician view (clinician_patients) — the V1 "discuss with your doctor" surface. A
// clinician is a third auth user linked to graphA's patient by caregiver A (via the link_clinician
// definer function). This block proves the whole isolation contract:
//   * a LINKED clinician can READ the shared patient's clinical rows (positive control),
//   * cannot read an UNLINKED patient's rows (clinician <-> unlinked-patient denial),
//   * cannot WRITE anything on the shared patient — read-only is structural (role gating),
//   * cannot self-serve a grant (only the owning caregiver can), and the definer function refuses
//     a non-owner caregiver and self-links,
//   * the grant is visible to the owning caregiver and the clinician, never to caregiver B, and a
//     revoke immediately removes the clinician's read access.
describe("RLS: read-only clinician view (clinician_patients)", () => {
  let clinicianId: string;
  let clinicianEmail: string;
  let clinicianClient: SupabaseClient;

  // Clinical tables reachable through a clinician grant, with the column each is keyed on.
  const sharedTables = [
    ["patients", "id", (g: Graph) => g.patientId],
    ["targets", "id", (g: Graph) => g.targetId],
    ["sessions", "id", (g: Graph) => g.sessionId],
    ["trials", "id", (g: Graph) => g.trialId],
    ["target_state", "target_id", (g: Graph) => g.targetId],
  ] as const;

  beforeAll(async () => {
    clinicianEmail = `clin-${randomUUID()}@keepsake.test`;
    const password = `Aa1-${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: clinicianEmail,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser clinician failed: ${error?.message}`);
    clinicianId = data.user.id;
    clinicianClient = await signInClient(clinicianEmail, password);

    // Caregiver A shares A's patient with the clinician via the sanctioned definer RPC.
    const { error: linkErr } = await clientA.rpc("link_clinician", {
      p_patient_id: graphA.patientId,
      p_clinician_email: clinicianEmail,
    });
    if (linkErr) throw new Error(`link_clinician failed: ${linkErr.message}`);
  }, 30000);

  afterAll(async () => {
    // Deleting the clinician user cascades their clinician_patients grants away.
    if (clinicianId) {
      try {
        await admin.auth.admin.deleteUser(clinicianId);
      } catch (err) {
        console.warn(
          `clinician cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });

  it("positive control: a linked clinician can READ the shared patient's clinical rows", async () => {
    for (const [table, col, id] of sharedTables) {
      const res = await clinicianClient.from(table).select(col).eq(col, id(graphA));
      expect(res.error).toBeNull();
      expect(res.data ?? []).toHaveLength(1);
    }
  });

  it("denial: a clinician CANNOT read an UNLINKED patient's rows (graphB)", async () => {
    for (const [table, col, id] of sharedTables) {
      const res = await clinicianClient.from(table).select(col).eq(col, id(graphB));
      expect(res.error).toBeNull();
      expect(res.data ?? []).toHaveLength(0);
    }
    // Nor via an unfiltered scan — B's patient must never appear in the clinician's result set.
    const all = await clinicianClient.from("patients").select("id");
    const ids = (all.data ?? []).map((r) => (r as { id: string }).id);
    expect(ids).toContain(graphA.patientId);
    expect(ids).not.toContain(graphB.patientId);
  });

  it("role gating: a linked clinician's writes to the shared patient affect 0 rows / are denied", async () => {
    const upd = await clinicianClient
      .from("targets")
      .update({ question: "clinician-edit" })
      .eq("id", graphA.targetId)
      .select("id");
    expect(upd.data ?? []).toHaveLength(0);

    const del = await clinicianClient
      .from("targets")
      .delete()
      .eq("id", graphA.targetId)
      .select("id");
    expect(del.data ?? []).toHaveLength(0);

    // Inserting a trial into the shared session is a WITH CHECK violation (no clinician insert
    // policy exists) — 42501, and nothing persists.
    const ins = await clinicianClient.from("trials").insert({
      session_id: graphA.sessionId,
      target_id: graphA.targetId,
      interval_sec: 10,
      outcome: "recall",
      at: new Date().toISOString(),
    });
    expect(ins.error).not.toBeNull();
    expect(ins.error?.code).toBe("42501");

    // The shared target is untouched.
    const check = await admin.from("targets").select("question").eq("id", graphA.targetId).single();
    expect(check.data?.question).not.toBe("clinician-edit");
  });

  it("a clinician cannot self-serve a grant (RLS insert requires the caregiver's ownership)", async () => {
    const marker = { clinician_id: clinicianId, patient_id: graphB.patientId };
    const { error } = await clinicianClient.from("clinician_patients").insert(marker);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    const persisted = await admin.from("clinician_patients").select("patient_id").match(marker);
    expect(persisted.data ?? []).toHaveLength(0);
  });

  it("link_clinician refuses a caregiver who does not own the patient", async () => {
    const res = await clientB.rpc("link_clinician", {
      p_patient_id: graphA.patientId,
      p_clinician_email: clinicianEmail,
    });
    expect(res.error).not.toBeNull();
    expect(res.error?.code).toBe("42501");
  });

  it("link_clinician refuses self-linking", async () => {
    const res = await clientA.rpc("link_clinician", {
      p_patient_id: graphA.patientId,
      p_clinician_email: graphA.email,
    });
    expect(res.error).not.toBeNull();
  });

  it("the grant is visible to the owning caregiver and clinician, never to caregiver B", async () => {
    const aSees = await clientA
      .from("clinician_patients")
      .select("clinician_id")
      .eq("patient_id", graphA.patientId);
    expect(aSees.data ?? []).toHaveLength(1);

    const bSees = await clientB
      .from("clinician_patients")
      .select("clinician_id")
      .eq("patient_id", graphA.patientId);
    expect(bSees.data ?? []).toHaveLength(0);

    const cSees = await clinicianClient
      .from("clinician_patients")
      .select("patient_id")
      .eq("clinician_id", clinicianId);
    expect(cSees.data ?? []).toHaveLength(1);
  });

  it("revoking the grant immediately removes the clinician's read access", async () => {
    const del = await clientA
      .from("clinician_patients")
      .delete()
      .match({ clinician_id: clinicianId, patient_id: graphA.patientId })
      .select("patient_id");
    expect(del.data ?? []).toHaveLength(1);

    const after = await clinicianClient.from("patients").select("id").eq("id", graphA.patientId);
    expect(after.data ?? []).toHaveLength(0);
  });
});
