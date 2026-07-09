import { describe, expect, it } from "vitest";
import { linkClinicianSchema, unlinkClinicianSchema } from "./schema";

describe("linkClinicianSchema", () => {
  const valid = { patientId: "11111111-1111-4111-8111-111111111111", email: "doc@example.com" };

  it("accepts a valid patient uuid + email", () => {
    expect(linkClinicianSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-uuid patientId", () => {
    expect(linkClinicianSchema.safeParse({ ...valid, patientId: "not-a-uuid" }).success).toBe(
      false,
    );
  });

  it("rejects a malformed email", () => {
    expect(linkClinicianSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("rejects an over-long email", () => {
    expect(
      linkClinicianSchema.safeParse({ ...valid, email: `${"a".repeat(320)}@x.com` }).success,
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(linkClinicianSchema.safeParse({}).success).toBe(false);
    expect(linkClinicianSchema.safeParse(null).success).toBe(false);
  });
});

describe("unlinkClinicianSchema", () => {
  const valid = {
    patientId: "11111111-1111-4111-8111-111111111111",
    clinicianId: "22222222-2222-4222-8222-222222222222",
  };

  it("accepts two valid uuids", () => {
    expect(unlinkClinicianSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-uuid clinicianId", () => {
    expect(unlinkClinicianSchema.safeParse({ ...valid, clinicianId: "x" }).success).toBe(false);
  });
});
