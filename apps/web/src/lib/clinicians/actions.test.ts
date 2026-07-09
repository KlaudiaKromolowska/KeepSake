import { describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/actions";
import { linkClinician, unlinkClinician } from "./actions";

vi.mock("@/lib/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type RequireUserResult = Awaited<ReturnType<typeof requireUser>>;

const PATIENT = "11111111-1111-4111-8111-111111111111";
const CLINICIAN = "22222222-2222-4222-8222-222222222222";

function mockUser(overrides: { rpc?: ReturnType<typeof vi.fn>; del?: ReturnType<typeof vi.fn> }) {
  const rpc = overrides.rpc ?? vi.fn().mockResolvedValue({ error: null });
  const del = overrides.del ?? vi.fn().mockResolvedValue({ error: null });
  const supabase = {
    rpc,
    from: () => ({ delete: () => ({ eq: () => ({ eq: del }) }) }),
  };
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: "caregiver-1" },
    supabase,
  } as unknown as RequireUserResult);
  return { rpc, del };
}

describe("linkClinician", () => {
  it("rejects invalid input before touching the database", async () => {
    const { rpc } = mockUser({});
    const result = await linkClinician({ patientId: "bad", email: "nope" });
    expect(result.error).not.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the link_clinician RPC with the validated args on success", async () => {
    const { rpc } = mockUser({});
    const result = await linkClinician({ patientId: PATIENT, email: "Doc@Example.com" });
    expect(result).toEqual({ data: null, error: null });
    expect(rpc).toHaveBeenCalledWith("link_clinician", {
      p_patient_id: PATIENT,
      p_clinician_email: "Doc@Example.com",
    });
  });

  it("maps any RPC error to one generic message (no enumeration leak)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rpc } = mockUser({
      rpc: vi
        .fn()
        .mockResolvedValue({ error: { code: "P0002", message: "no account for that email" } }),
    });
    const result = await linkClinician({ patientId: PATIENT, email: "ghost@example.com" });
    expect(rpc).toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.error).toBe(
      "Could not share access. Check the email belongs to a Keepsake account and that it isn't your own.",
    );
    consoleError.mockRestore();
  });
});

describe("unlinkClinician", () => {
  it("rejects invalid input before touching the database", async () => {
    const { del } = mockUser({});
    const result = await unlinkClinician({ patientId: "bad", clinicianId: "bad" });
    expect(result.error).not.toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it("issues an RLS-scoped delete for valid input", async () => {
    const { del } = mockUser({});
    const result = await unlinkClinician({ patientId: PATIENT, clinicianId: CLINICIAN });
    expect(result).toEqual({ data: null, error: null });
    expect(del).toHaveBeenCalledWith("clinician_id", CLINICIAN);
  });
});
