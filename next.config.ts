import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    // The codebase typechecks cleanly under `strict` (verified via `tsc --noEmit`
    // and `next build`), so build-time type errors are no longer suppressed.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
