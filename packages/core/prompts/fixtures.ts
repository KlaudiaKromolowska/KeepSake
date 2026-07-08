import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/**
 * Load a recorded fixture payload for the given AI kind (used by the AI core when
 * `CLAUDE_FIXTURES=1`). Fixtures are real recorded outputs written by scripts/record-fixtures.ts:
 * the parsed object for structured kinds, a JSON string of text for streamed kinds. Throws if the
 * fixture file is missing or unparseable — a missing fixture in fixture mode is a real error.
 */
export function loadFixture(kind: string): unknown {
  const raw = readFileSync(join(FIXTURES_DIR, `${kind}.json`), "utf8");
  return JSON.parse(raw);
}
