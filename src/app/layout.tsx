import type { Metadata } from "next";
import { connection } from "next/server";
import { geist, geistMono } from "./fonts";
import "./globals.css";
import { ConfigProblem } from "@/components/states/ConfigProblem";
import { mayShowConfigProblems, missingRequiredConfig } from "@/lib/env";

export const metadata: Metadata = {
  title: "credIA",
  description: "Paquete de datos de crédito para prestamistas de pymes",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page is rendered per request: its scripts need that request's CSP nonce (see middleware.ts), which a page
  // prerendered at build time cannot carry.
  await connection();
  // Outside production, a missing required setting is named on the page instead of the generic error.
  const missing = mayShowConfigProblems() ? missingRequiredConfig() : [];
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen antialiased">{missing.length ? <ConfigProblem missing={missing} /> : children}</body>
    </html>
  );
}
