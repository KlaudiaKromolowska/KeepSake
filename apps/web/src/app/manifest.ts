import type { MetadataRoute } from "next";

/**
 * PWA installability (V3 — PLAN.md §12: care-home Wi-Fi is bad, never lose a trial). Next.js 16
 * App Router convention: this file IS the served `/manifest.webmanifest`, no manual `<link>` tag.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Keepsake",
    short_name: "Keepsake",
    description: "Adaptive spaced-retrieval memory practice, guided by a caregiver",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
