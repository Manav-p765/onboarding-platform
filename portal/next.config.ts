import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Private, data-driven app: every page renders per request (no static prerendering / caching).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone", // small Docker image: only the files the server needs
  experimental: {
    serverActions: { bodySizeLimit: "3mb" }, // agency logo upload (2 MB max) + form overhead
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
