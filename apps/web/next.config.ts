import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @keepsake/core ships TS source, no build step (PLAN.md §8b)
  transpilePackages: ["@keepsake/core"],
};

export default nextConfig;
