import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The frontend/ directory is not the repo root (see docs/decision-ledger.md
  // for the frontend/backend/shared split), so Next's built-in ESLint
  // integration can't reliably resolve eslint.config.mjs during `next build`.
  // Linting is run separately via `npm run lint` instead.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
