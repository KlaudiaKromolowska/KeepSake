import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Node builtin types come from ./node-builtins.d.ts (tsconfig omits @types/node — no new dep).

// The SR engine SOURCE must stay pure: time and randomness enter only as injected data
// (event `at`, the Clock interface), never read from a global (PLAN.md §8b / global constraint 1).
// fs/glob is allowed HERE because this is a test, not engine source.

const FORBIDDEN: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "Date.now", pattern: /\bDate\.now\b/ },
  { label: "new Date() with no argument", pattern: /\bnew Date\(\s*\)/ },
  { label: "setTimeout", pattern: /\bsetTimeout\b/ },
  { label: "setInterval", pattern: /\bsetInterval\b/ },
  { label: "Math.random", pattern: /\bMath\.random\b/ },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("engine source purity guard", () => {
  it("no source file reads a clock or randomness from a global", () => {
    // import.meta.dirname is a Node 20.11+ runtime global; type it locally (tsconfig lib omits it).
    const here = (import.meta as unknown as { dirname: string }).dirname;
    const files = sourceFiles(here);
    expect(files.length).toBeGreaterThan(0); // guard against silently scanning nothing

    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line: string, i: number) => {
        for (const { label, pattern } of FORBIDDEN) {
          if (pattern.test(line)) violations.push(`${file}:${i + 1} — ${label}: ${line.trim()}`);
        }
      });
    }

    expect(violations, `impure engine source:\n${violations.join("\n")}`).toEqual([]);
  });
});
