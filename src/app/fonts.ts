import localFont from "next/font/local";

/**
 * Geist for all text; Geist Mono for every figure, code and ID. Loaded from the vendored TTFs (OFL, the same files the
 * PDF export uses), not from Google Fonts: a build must not depend on downloading fonts (a failed fetch fails the
 * whole Vercel build).
 */
export const geist = localFont({
  src: [
    { path: "../lib/case-view/fonts/Geist-Regular.ttf", weight: "400", style: "normal" },
    { path: "../lib/case-view/fonts/Geist-Medium.ttf", weight: "500", style: "normal" },
    { path: "../lib/case-view/fonts/Geist-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../lib/case-view/fonts/Geist-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-geist",
  display: "swap",
});

export const geistMono = localFont({
  src: [
    { path: "../lib/case-view/fonts/GeistMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "../lib/case-view/fonts/GeistMono-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});
