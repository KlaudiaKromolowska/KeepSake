import { describe, expect, it } from "vitest";
import { createPatientSchema, ETIOLOGY_VALUES } from "./schema";

const valid = {
  displayName: "Maria K.",
  timezone: "Europe/Warsaw",
  etiology: "alzheimers",
} as const;

describe("createPatientSchema", () => {
  it("accepts a valid input", () => {
    const result = createPatientSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts optional isDemo", () => {
    expect(createPatientSchema.safeParse({ ...valid, isDemo: true }).success).toBe(true);
  });

  it("accepts every etiology value", () => {
    for (const etiology of ETIOLOGY_VALUES) {
      expect(createPatientSchema.safeParse({ ...valid, etiology }).success).toBe(true);
    }
  });

  describe("displayName", () => {
    it("rejects empty", () => {
      expect(createPatientSchema.safeParse({ ...valid, displayName: "" }).success).toBe(false);
    });

    it("accepts 100 chars, rejects 101", () => {
      expect(
        createPatientSchema.safeParse({ ...valid, displayName: "a".repeat(100) }).success,
      ).toBe(true);
      expect(
        createPatientSchema.safeParse({ ...valid, displayName: "a".repeat(101) }).success,
      ).toBe(false);
    });
  });

  describe("timezone", () => {
    it("accepts canonical IANA names", () => {
      for (const timezone of ["Europe/Warsaw", "America/New_York", "Asia/Tokyo"]) {
        expect(createPatientSchema.safeParse({ ...valid, timezone }).success).toBe(true);
      }
    });

    it("rejects non-IANA strings", () => {
      for (const timezone of ["CET", "GMT+2", "Mars/Olympus", "", "europe/warsaw"]) {
        expect(createPatientSchema.safeParse({ ...valid, timezone }).success).toBe(false);
      }
    });
  });

  describe("etiology", () => {
    it("rejects values outside the union", () => {
      expect(createPatientSchema.safeParse({ ...valid, etiology: "dementia" }).success).toBe(false);
      expect(createPatientSchema.safeParse({ ...valid, etiology: "" }).success).toBe(false);
    });
  });

  it("rejects missing fields and non-object input", () => {
    expect(createPatientSchema.safeParse({}).success).toBe(false);
    expect(createPatientSchema.safeParse(null).success).toBe(false);
    expect(createPatientSchema.safeParse("Maria").success).toBe(false);
  });
});
