import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared logic package is published as TypeScript source inside the workspace.
  transpilePackages: ["@family-hub/logic"],
  poweredByHeader: false,
  // Next 16.4 writes web/AGENTS.md on every `next dev`; the repo's own AGENTS.md is the source of truth.
  agentRules: false,
};

export default nextConfig;
