import type { NextConfig } from "next";

// Borrower pages and APIs: the link's handle in the URL (the token only in the fragment of `/s` or in a cookie). Never
// leak either via Referer, caches or indexes.
const tokenHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "no-store" },
];

// Every page: no framing by other sites (clickjacking), no MIME sniffing, HTTPS only, no device APIs, no full URLs in
// Referer to other sites. The Content-Security-Policy (with `frame-ancestors 'none'`) is set per request by the
// middleware, with the nonce for that page's scripts (`src/lib/csp.ts`).
const baseHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

// Lender pages show case data: never cached by shared caches, never indexed.
const lenderHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // unpdf (BORME PDFs) uses import.meta, which webpack cannot bundle safely: load it from node_modules.
  serverExternalPackages: ["@react-pdf/renderer", "unpdf"],
  // The assistant reads its guide at runtime; make sure it ships with the serverless bundle.
  outputFileTracingIncludes: {
    "/api/borrower/[link]/assistant": ["./src/content/docs-guide.es.md"],
    // Geist TTFs for the PDF export (react-pdf reads them from disk).
    "/casos/[id]/exportar/[format]": ["./src/lib/case-view/fonts/*.ttf"],
  },
  async headers() {
    // Later entries override earlier ones for the same header (token pages tighten Referrer-Policy to no-referrer).
    return [
      { source: "/:path*", headers: baseHeaders },
      { source: "/casos/:path*", headers: lenderHeaders },
      { source: "/s", headers: tokenHeaders },
      { source: "/s/:path*", headers: tokenHeaders },
      { source: "/api/borrower/:path*", headers: tokenHeaders },
    ];
  },
};

export default nextConfig;
