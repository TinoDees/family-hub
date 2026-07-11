import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root — a stray package-lock.json in C:\Users\Tino.Dees\dev
  // otherwise makes Next.js guess the wrong workspace root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
