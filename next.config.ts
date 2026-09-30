import type { NextConfig } from "next";

// Borrower pages and APIs carry the magic-link token in the URL: never leak it via Referer, caches or indexes.
const tokenHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // unpdf (BORME PDFs) uses import.meta, which webpack cannot bundle safely: load it from node_modules.
  serverExternalPackages: ["@react-pdf/renderer", "unpdf"],
  // The assistant reads its guide at runtime; make sure it ships with the serverless bundle.
  outputFileTracingIncludes: {
    "/api/borrower/[token]/assistant": ["./src/content/docs-guide.es.md"],
    // Geist TTFs for the PDF export (react-pdf reads them from disk).
    "/casos/[id]/exportar/[format]": ["./src/lib/case-view/fonts/*.ttf"],
  },
  async headers() {
    return [
      { source: "/s/:path*", headers: tokenHeaders },
      { source: "/api/borrower/:path*", headers: tokenHeaders },
    ];
  },
};

export default nextConfig;
