import { describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/actions";
import { addOrgMember, createOrganization, createOrgPatient, removeOrgMember } from "./actions";

vi.mock("@/lib/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type RequireUserResult = Awaited<ReturnType<typeof requireUser>>;

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function mockUser(
  opts: {
    rpc?: ReturnType<typeof vi.fn>;
    insertSingle?: ReturnType<typeof vi.fn>;
    del?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const rpc = opts.rpc ?? vi.fn().mockResolvedValue({ data: null, error: null });
  const insertSingle =
    opts.insertSingle ?? vi.fn().mockResolvedValue({ data: { id: "pat-1" }, error: null });
  const del = opts.del ?? vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn((_payload: Record<string, unknown>) => ({
    select: () => ({ single: insertSingle }),
  }));
  const supabase = {
    rpc,
    from: vi.fn(() => ({
      insert,
      delete: () => ({ eq: () => ({ eq: del }) }),
    })),
  };
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: "u1" },
    supabase,
  } as unknown as RequireUserResult);
  return { rpc, insert, insertSingle, del };
}

describe("createOrganization", () => {
  it("rejects an empty name before touching the database", async () => {
    const { rpc } = mockUser();
    const result = await createOrganization({ name: "  " });
    expect(result.error).not.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls create_organization and returns the new org id", async () => {
    const { rpc } = mockUser({ rpc: vi.fn().mockResolvedValue({ data: "org-9", error: null }) });
    const result = await createOrganization({ name: "Sunrise" });
    expect(rpc).toHaveBeenCalledWith("create_organization", { p_name: "Sunrise" });
    expect(result).toEqual({ data: { orgId: "org-9" }, error: null });
  });

  it("maps an RPC error to a generic message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUser({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) });
    const result = await createOrganization({ name: "Sunrise" });
    expect(result.data).toBeNull();
    expect(result.error).toBe("Could not create the care home. Please try again.");
    spy.mockRestore();
  });
});

describe("addOrgMember", () => {
  it("rejects invalid input before touching the database", async () => {
    const { rpc } = mockUser();
    const result = await addOrgMember({ orgId: "bad", email: "nope", role: "owner" });
    expect(result.error).not.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls add_org_member with the validated args", async () => {
    const { rpc } = mockUser();
    const result = await addOrgMember({ orgId: ORG, email: "c@example.com", role: "admin" });
    expect(result).toEqual({ data: null, error: null });
    expect(rpc).toHaveBeenCalledWith("add_org_member", {
      p_org_id: ORG,
      p_email: "c@example.com",
      p_role: "admin",
    });
  });

  it("maps any RPC error to one generic message (no enumeration leak)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUser({ rpc: vi.fn().mockResolvedValue({ error: { code: "42501", message: "denied" } }) });
    const result = await addOrgMember({ orgId: ORG, email: "c@example.com", role: "staff" });
    expect(result.data).toBeNull();
    expect(result.error).toContain("Could not add that person");
    spy.mockRestore();
  });
});

describe("removeOrgMember", () => {
  it("rejects invalid input before touching the database", async () => {
    const { del } = mockUser();
    const result = await removeOrgMember({ orgId: "bad", userId: "bad" });
    expect(result.error).not.toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it("issues an RLS-scoped delete for valid input", async () => {
    const { del } = mockUser();
    const result = await removeOrgMember({ orgId: ORG, userId: USER });
    expect(result).toEqual({ data: null, error: null });
    expect(del).toHaveBeenCalledWith("user_id", USER);
  });
});

describe("createOrgPatient", () => {
  it("rejects invalid input before touching the database", async () => {
    const { insert } = mockUser();
    const result = await createOrgPatient({
      orgId: "bad",
      displayName: "",
      timezone: "x",
      etiology: "z",
    });
    expect(result.error).not.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts an org-owned patient (org_id set, caregiver_id omitted) and returns its id", async () => {
    const { insert } = mockUser();
    const result = await createOrgPatient({
      orgId: ORG,
      displayName: "Margaret W.",
      timezone: "Europe/Warsaw",
      etiology: "unspecified",
    });
    expect(result).toEqual({ data: { patientId: "pat-1" }, error: null });
    const payload = insert.mock.calls[0][0];
    expect(payload).toMatchObject({
      org_id: ORG,
      display_name: "Margaret W.",
      timezone: "Europe/Warsaw",
    });
    expect(payload).not.toHaveProperty("caregiver_id");
  });

  it("maps an insert error to a generic message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUser({
      insertSingle: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "42501", message: "no" } }),
    });
    const result = await createOrgPatient({
      orgId: ORG,
      displayName: "Margaret W.",
      timezone: "Europe/Warsaw",
      etiology: "unspecified",
    });
    expect(result.data).toBeNull();
    expect(result.error).toContain("Only an admin can add people");
    spy.mockRestore();
  });
});
