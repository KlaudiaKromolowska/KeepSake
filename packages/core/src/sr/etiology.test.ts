import { describe, expect, it } from "vitest";
import { DEFAULT_SR_CONFIG } from "./config";
import { defaultsForEtiology } from "./etiology";
import type { Etiology } from "./types";

const ETIOLOGIES: Etiology[] = [
  "alzheimers",
  "vascular",
  "lewy",
  "parkinsons",
  "mixed",
  "unspecified",
];

describe("defaultsForEtiology — pinned values", () => {
  it("alzheimers: gentler growth, free recall", () => {
    const d = defaultsForEtiology("alzheimers");
    expect(d.answerFormat).toBe("free_recall");
    expect(d.config.growthFactor).toBe(1.5);
    expect(d.config.baseIntervalSec).toBe(DEFAULT_SR_CONFIG.baseIntervalSec);
    expect(d.rationale.length).toBeGreaterThan(0);
  });

  it("vascular: unchanged intervals, free recall", () => {
    const d = defaultsForEtiology("vascular");
    expect(d.answerFormat).toBe("free_recall");
    expect(d.config).toEqual(DEFAULT_SR_CONFIG);
    expect(d.rationale.length).toBeGreaterThan(0);
  });

  it("lewy: recognition format, tighter early intervals", () => {
    const d = defaultsForEtiology("lewy");
    expect(d.answerFormat).toBe("recognition");
    expect(d.config.baseIntervalSec).toBe(10);
    expect(d.config.growthFactor).toBe(1.5);
    expect(d.rationale.length).toBeGreaterThan(0);
  });

  it("parkinsons: recognition format, tighter early intervals", () => {
    const d = defaultsForEtiology("parkinsons");
    expect(d.answerFormat).toBe("recognition");
    expect(d.config.baseIntervalSec).toBe(10);
    expect(d.config.growthFactor).toBe(1.5);
    expect(d.rationale.length).toBeGreaterThan(0);
  });

  it("mixed: unchanged defaults, free recall", () => {
    const d = defaultsForEtiology("mixed");
    expect(d.answerFormat).toBe("free_recall");
    expect(d.config).toEqual(DEFAULT_SR_CONFIG);
    expect(d.rationale.length).toBeGreaterThan(0);
  });

  it("unspecified: unchanged defaults, free recall", () => {
    const d = defaultsForEtiology("unspecified");
    expect(d.answerFormat).toBe("free_recall");
    expect(d.config).toEqual(DEFAULT_SR_CONFIG);
    expect(d.rationale.length).toBeGreaterThan(0);
  });
});

describe("defaultsForEtiology — frozen-input purity", () => {
  it("never mutates DEFAULT_SR_CONFIG, and returns a fresh copy each call", () => {
    const frozenDefault = Object.freeze({ ...DEFAULT_SR_CONFIG });
    for (const etiology of ETIOLOGIES) {
      const d = defaultsForEtiology(etiology);
      expect(frozenDefault).toEqual(DEFAULT_SR_CONFIG);
      expect(d.config).not.toBe(DEFAULT_SR_CONFIG);
    }
  });
});

describe("defaultsForEtiology — invariants", () => {
  it("every returned config keeps base < max and growth > 1", () => {
    for (const etiology of ETIOLOGIES) {
      const { config } = defaultsForEtiology(etiology);
      expect(config.baseIntervalSec).toBeLessThan(config.maxIntervalSec);
      expect(config.growthFactor).toBeGreaterThan(1);
    }
  });
});
