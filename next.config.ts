import type { NextConfig } from "next";

// Borrower pages and APIs carry the magic-link token in the URL: never leak it via Referer, caches or indexes.
const tokenHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The assistant reads its guide at runtime; make sure it ships with the serverless bundle.
  outputFileTracingIncludes: {
    "/api/borrower/[token]/assistant": ["./src/content/docs-guide.es.md"],
  },
  async headers() {
    return [
      { source: "/s/:path*", headers: tokenHeaders },
      { source: "/api/borrower/:path*", headers: tokenHeaders },
    ];
  },
};

export default nextConfig;
