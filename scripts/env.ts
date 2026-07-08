// Env loading shared by the Phase-4 dev scripts (eval-wizard.ts, record-fixtures.ts). Unlike
// scripts/seed.ts — which only needs Supabase creds and gets them via `supabase status -o env` —
// these scripts need ANTHROPIC_API_KEY, which has no source but apps/web/.env.local. Node's
// built-in `loadEnvFile` (stable on Node >=22, this repo targets >=24) reads it with no new
// dependency. Mirrors seed.ts's `requireEnv` fail-fast style for a clear, actionable error.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ENV_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "web",
  ".env.local",
);

/** Loads apps/web/.env.local into process.env, if present. Existing process.env values win. */
export function loadWebEnv(): void {
  if (existsSync(WEB_ENV_PATH)) process.loadEnvFile(WEB_ENV_PATH);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required — set it in apps/web/.env.local`);
  return value;
}
