import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so a stray lockfile in a parent folder
  // doesn't make Next.js guess the wrong workspace root.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async rewrites() {
    // Pretty URL for the static quick-tour page in /public.
    // beforeFiles so /tour wins over the (app)/[module] dynamic route —
    // with afterFiles, the client router matched [module] first and its
    // auth layout bounced logged-out visitors to /login.
    return {
      beforeFiles: [{ source: "/tour", destination: "/tour.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
