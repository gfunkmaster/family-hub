import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared logic package is published as TypeScript source inside the workspace.
  transpilePackages: ["@family-hub/logic"],
  poweredByHeader: false,
};

export default nextConfig;
