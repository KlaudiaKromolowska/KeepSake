import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { ACTIVE_PATIENT_COOKIE, listOwnedPatients, resolveActivePatient } from "./active";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const P1 = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  display_name: "One",
  timezone: "UTC",
  etiology: "unspecified",
};
const P2 = {
  id: "aaaaaaaa-0000-0000-0000-000000000002",
  display_name: "Two",
  timezone: "UTC",
  etiology: "vascular",
};

function mockSupabase(rows: unknown[] | null, error: unknown = null): SupabaseClient<Database> {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: rows, error }),
  };
  return { from: () => builder } as unknown as SupabaseClient<Database>;
}

function mockCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: () => (value ? { name: ACTIVE_PATIENT_COOKIE, value } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => vi.clearAllMocks());

describe("listOwnedPatients", () => {
  it("maps rows to camelCase ActivePatient shape", async () => {
    const result = await listOwnedPatients(mockSupabase([P1, P2]), "u1");
    expect(result).toEqual([
      { id: P1.id, displayName: "One", timezone: "UTC", etiology: "unspecified" },
      { id: P2.id, displayName: "Two", timezone: "UTC", etiology: "vascular" },
    ]);
  });

  it("returns [] on a read error", async () => {
    expect(await listOwnedPatients(mockSupabase(null, { message: "boom" }), "u1")).toEqual([]);
  });
});

describe("resolveActivePatient", () => {
  it("returns the cookie-named patient when it is owned", async () => {
    mockCookie(P2.id);
    const active = await resolveActivePatient(mockSupabase([P1, P2]), "u1");
    expect(active?.id).toBe(P2.id);
  });

  it("falls back to the oldest owned patient when the cookie names a non-owned id", async () => {
    mockCookie("ffffffff-0000-0000-0000-000000000000");
    const active = await resolveActivePatient(mockSupabase([P1, P2]), "u1");
    expect(active?.id).toBe(P1.id);
  });

  it("falls back to the oldest owned patient when there is no cookie", async () => {
    mockCookie(undefined);
    const active = await resolveActivePatient(mockSupabase([P1, P2]), "u1");
    expect(active?.id).toBe(P1.id);
  });

  it("returns null when the caregiver owns no patients", async () => {
    mockCookie(P2.id);
    expect(await resolveActivePatient(mockSupabase([]), "u1")).toBeNull();
  });
});
