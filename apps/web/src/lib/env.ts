/**
 * Fail-fast env accessor. Call sites must pass the value via a static
 * `process.env.NAME` expression so Next.js can inline NEXT_PUBLIC_ vars in client bundles.
 */
export function requiredEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
