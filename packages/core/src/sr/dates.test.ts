import { describe, expect, it } from "vitest";
import { calendarDayInTz, isDistinctDay } from "./dates";

describe("calendarDayInTz", () => {
  it("rolls over to the next local day in Europe/Warsaw (UTC+2 in July)", () => {
    const epochMs = Date.parse("2026-07-07T23:30:00Z");
    expect(calendarDayInTz(epochMs, "Europe/Warsaw")).toBe("2026-07-08");
  });

  it("keeps the UTC calendar day for the same instant in UTC", () => {
    const epochMs = Date.parse("2026-07-07T23:30:00Z");
    expect(calendarDayInTz(epochMs, "UTC")).toBe("2026-07-07");
  });

  it("resolves the correct local day just before local midnight in Europe/Warsaw", () => {
    // 2026-07-07T21:59:00Z = 2026-07-07T23:59:00+02:00
    const epochMs = Date.parse("2026-07-07T21:59:00Z");
    expect(calendarDayInTz(epochMs, "Europe/Warsaw")).toBe("2026-07-07");
  });

  it("resolves the correct local day just before local midnight in America/Los_Angeles", () => {
    // 2026-07-08T06:59:00Z = 2026-07-07T23:59:00-07:00 (PDT)
    const epochMs = Date.parse("2026-07-08T06:59:00Z");
    expect(calendarDayInTz(epochMs, "America/Los_Angeles")).toBe("2026-07-07");
  });

  it("resolves the correct local day just after local midnight in America/Los_Angeles", () => {
    // 2026-07-08T07:01:00Z = 2026-07-08T00:01:00-07:00 (PDT)
    const epochMs = Date.parse("2026-07-08T07:01:00Z");
    expect(calendarDayInTz(epochMs, "America/Los_Angeles")).toBe("2026-07-08");
  });

  it("yields a valid, correct day on a Europe/Warsaw DST transition day", () => {
    // 2026-03-29 is the EU spring-forward DST transition (02:00 -> 03:00 CEST).
    // 2026-03-29T12:00:00Z is safely mid-afternoon local time regardless of the jump.
    const epochMs = Date.parse("2026-03-29T12:00:00Z");
    expect(calendarDayInTz(epochMs, "Europe/Warsaw")).toBe("2026-03-29");
  });

  it("resolves the correct local day just before the Europe/Warsaw spring-forward jump", () => {
    // 2026-03-29T00:59:00Z = 2026-03-29T01:59:00+01:00 (CET, one minute before the 02:00 jump).
    const epochMs = Date.parse("2026-03-29T00:59:00Z");
    expect(calendarDayInTz(epochMs, "Europe/Warsaw")).toBe("2026-03-29");
  });

  it("resolves the correct local day just after the Europe/Warsaw spring-forward jump", () => {
    // 2026-03-29T01:01:00Z = 2026-03-29T03:01:00+02:00 (CEST, one minute after clocks jump to 03:00).
    const epochMs = Date.parse("2026-03-29T01:01:00Z");
    expect(calendarDayInTz(epochMs, "Europe/Warsaw")).toBe("2026-03-29");
  });
});

describe("isDistinctDay", () => {
  it("is false for two instants on the same local day in Europe/Warsaw", () => {
    const a = Date.parse("2026-07-07T06:00:00Z"); // 08:00 local
    const b = Date.parse("2026-07-07T18:00:00Z"); // 20:00 local
    expect(isDistinctDay(a, b, "Europe/Warsaw")).toBe(false);
  });

  it("is true across local midnight in Europe/Warsaw even though close in wall-clock time", () => {
    const a = Date.parse("2026-07-07T21:59:00Z"); // 23:59 local (2026-07-07)
    const b = Date.parse("2026-07-07T22:01:00Z"); // 00:01 local (2026-07-08)
    expect(isDistinctDay(a, b, "Europe/Warsaw")).toBe(true);
  });

  it("is true for the same UTC day but different local days (America/Los_Angeles)", () => {
    // Both instants fall on 2026-07-08 UTC, but split across local midnight in LA.
    const a = Date.parse("2026-07-08T06:59:00Z"); // 2026-07-07 23:59 PDT
    const b = Date.parse("2026-07-08T07:01:00Z"); // 2026-07-08 00:01 PDT
    expect(isDistinctDay(a, b, "America/Los_Angeles")).toBe(true);
  });

  it("is false for instants on different UTC days but the same local day (America/Los_Angeles)", () => {
    // 2026-07-07T23:00-07:00 is 2026-07-08T06:00Z; 2026-07-07T20:00-07:00 is 2026-07-08T03:00Z.
    // Both are 2026-07-08 in UTC already spanning midnight; pick a pair straddling UTC midnight
    // instead while staying on one LA calendar day.
    const a = Date.parse("2026-07-08T06:00:00Z"); // 2026-07-07 23:00 PDT
    const b = Date.parse("2026-07-07T23:00:00Z"); // 2026-07-07 16:00 PDT
    expect(isDistinctDay(a, b, "America/Los_Angeles")).toBe(false);
  });

  it("is false when the same instant is compared to itself", () => {
    const a = Date.parse("2026-07-07T21:59:00Z");
    expect(isDistinctDay(a, a, "Europe/Warsaw")).toBe(false);
  });
});
