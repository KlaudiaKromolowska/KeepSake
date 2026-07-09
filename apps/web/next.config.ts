import type { NextConfig } from "next";

/**
 * Allow `next/image` to optimize the caregiver's uploaded target photo, which is served from a
 * short-lived Supabase Storage *signed* URL on the project's own host (`/storage/v1/object/sign/…`).
 * Seeded/placeholder images stay same-origin (`/images/*`) and never need this. Derived from
 * `NEXT_PUBLIC_SUPABASE_URL` so it tracks local (`127.0.0.1:54321`) and hosted projects alike; if the
 * env var is missing at build time we add no pattern (the kiosk still falls back to the seeded image).
 */
function supabaseImagePatterns(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const { protocol, hostname, port } = new URL(url);
    return [
      {
        protocol: protocol.replace(":", "") as "http" | "https",
        hostname,
        ...(port ? { port } : {}),
        pathname: "/storage/v1/object/sign/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  // @keepsake/core ships TS source, no build step (PLAN.md §8b)
  transpilePackages: ["@keepsake/core"],
  images: { remotePatterns: supabaseImagePatterns() },
  experimental: {
    serverActions: {
      // Memory-capsule uploads go through a Server Action, whose body parser defaults to ~1 MiB —
      // that would silently reject the 25 MiB video cap (`MAX_VIDEO_BYTES` in capsules/capsule-file.ts)
      // before our own validator ever runs. "26mb" (Next parses it as 26 × 1024² = 27,262,976 B) clears
      // the 25 MiB file with ~1 MiB of multipart/caption overhead headroom. The authoritative per-file
      // cap stays server-side in `validateCapsuleBytes`; this only widens the transport gate to reach it.
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
