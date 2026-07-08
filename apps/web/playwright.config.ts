import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Smoke E2E of the never-cut demo chain (Revised_plan.md Day-3 Track A): demo-login → target
 * wizard → session (recall/miss/unclear) → debrief → RCT report. Runs against a built `next start`
 * server with CLAUDE_FIXTURES=1 (see apps/web/e2e/demo-chain.spec.ts) so it never calls the real
 * Claude API. Requires the local Supabase stack (`supabase start` + `pnpm seed`) — see the `e2e` CI
 * job in .github/workflows/ci.yml for the exact setup this mirrors.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
