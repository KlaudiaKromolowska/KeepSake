import { describe, expect, it } from "vitest";
import {
  addOrgMemberSchema,
  createOrgPatientSchema,
  createOrgSchema,
  removeOrgMemberSchema,
} from "./schema";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

describe("createOrgSchema", () => {
  it("accepts a non-empty name and trims it", () => {
    const parsed = createOrgSchema.safeParse({ name: "  Sunrise  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("Sunrise");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(createOrgSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createOrgSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(createOrgSchema.safeParse({ name: "a".repeat(201) }).success).toBe(false);
  });
});

describe("addOrgMemberSchema", () => {
  const valid = { orgId: ORG, email: "colleague@example.com", role: "staff" };

  it("accepts a valid org uuid + email + role", () => {
    expect(addOrgMemberSchema.safeParse(valid).success).toBe(true);
    expect(addOrgMemberSchema.safeParse({ ...valid, role: "admin" }).success).toBe(true);
  });

  it("rejects an unknown role", () => {
    expect(addOrgMemberSchema.safeParse({ ...valid, role: "owner" }).success).toBe(false);
  });

  it("rejects a non-uuid orgId and a malformed email", () => {
    expect(addOrgMemberSchema.safeParse({ ...valid, orgId: "x" }).success).toBe(false);
    expect(addOrgMemberSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
});

describe("removeOrgMemberSchema", () => {
  it("accepts two valid uuids", () => {
    expect(removeOrgMemberSchema.safeParse({ orgId: ORG, userId: USER }).success).toBe(true);
  });

  it("rejects a non-uuid userId", () => {
    expect(removeOrgMemberSchema.safeParse({ orgId: ORG, userId: "x" }).success).toBe(false);
  });
});

describe("createOrgPatientSchema", () => {
  const valid = {
    orgId: ORG,
    displayName: "Margaret W.",
    timezone: "Europe/Warsaw",
    etiology: "unspecified",
  };

  it("accepts valid input", () => {
    expect(createOrgPatientSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid timezone", () => {
    expect(createOrgPatientSchema.safeParse({ ...valid, timezone: "Mars/Base" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown etiology and an empty name", () => {
    expect(createOrgPatientSchema.safeParse({ ...valid, etiology: "nope" }).success).toBe(false);
    expect(createOrgPatientSchema.safeParse({ ...valid, displayName: "  " }).success).toBe(false);
  });
});
