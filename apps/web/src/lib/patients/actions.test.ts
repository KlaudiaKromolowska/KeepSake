import { describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/actions";
import { createPatient } from "./actions";

vi.mock("@/lib/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions")>();
  return { ...actual, requireUser: vi.fn() };
});

type RequireUserResult = Awaited<ReturnType<typeof requireUser>>;

const validInput = {
  displayName: "Maria K.",
  timezone: "Europe/Warsaw",
  etiology: "alzheimers",
} as const;

function mockSupabase(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

describe("createPatient", () => {
  it("returns a generic message and logs the raw error on a DB failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbError = { message: 'duplicate key value violates unique constraint "patients_pkey"' };
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "user-1" },
      supabase: mockSupabase({ data: null, error: dbError }),
    } as unknown as RequireUserResult);

    const result = await createPatient(validInput);

    expect(result).toEqual({ data: null, error: "Could not save. Please try again." });
    expect(consoleError).toHaveBeenCalledWith("createPatient failed", dbError);

    consoleError.mockRestore();
  });
});
