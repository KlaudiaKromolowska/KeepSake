import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/actions";
import { setActivePatient } from "./actions";
import { ACTIVE_PATIENT_COOKIE } from "./active";

vi.mock("@/lib/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type RequireUserResult = Awaited<ReturnType<typeof requireUser>>;

const PATIENT = "11111111-1111-4111-8111-111111111111";

/** supabase mock whose patients lookup resolves to `result`; captures the ownership filters. */
function mockUser(result: { data: unknown; error: unknown }) {
  const eqCalls: [string, unknown][] = [];
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  const supabase = { from: () => chain };
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: "caregiver-1" },
    supabase,
  } as unknown as RequireUserResult);
  return { eqCalls };
}

let setCookie: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  setCookie = vi.fn();
  vi.mocked(cookies).mockResolvedValue({
    set: setCookie,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
});

describe("setActivePatient", () => {
  it("rejects a non-uuid patientId without setting a cookie", async () => {
    mockUser({ data: null, error: null });
    const result = await setActivePatient({ patientId: "not-a-uuid" });
    expect(result.error).toBe("Invalid patient.");
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("refuses to switch to a patient the caregiver does not own", async () => {
    const { eqCalls } = mockUser({ data: null, error: null });
    const result = await setActivePatient({ patientId: PATIENT });
    expect(result.error).toBe("That patient is not on your list.");
    expect(setCookie).not.toHaveBeenCalled();
    // The ownership filter must include the caller's own id — never a bare id lookup.
    expect(eqCalls).toContainEqual(["caregiver_id", "caregiver-1"]);
  });

  it("sets the active-patient cookie for an owned patient", async () => {
    mockUser({ data: { id: PATIENT }, error: null });
    const result = await setActivePatient({ patientId: PATIENT });
    expect(result).toEqual({ data: { patientId: PATIENT }, error: null });
    expect(setCookie).toHaveBeenCalledWith(
      ACTIVE_PATIENT_COOKIE,
      PATIENT,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("returns a generic message and does not set a cookie on a DB error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUser({ data: null, error: { message: "boom" } });
    const result = await setActivePatient({ patientId: PATIENT });
    expect(result.error).toBe("Could not switch patient.");
    expect(setCookie).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
