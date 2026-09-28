import type { NextConfig } from "next";

// Borrower pages and APIs carry the magic-link token in the URL: never leak it via Referer, caches or indexes.
const tokenHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/s/:path*", headers: tokenHeaders },
      { source: "/api/borrower/:path*", headers: tokenHeaders },
    ];
  },
};

export default nextConfig;
