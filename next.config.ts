import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so a stray lockfile in a parent folder
  // doesn't make Next.js guess the wrong workspace root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
