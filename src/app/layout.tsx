import type { Metadata } from "next";
import { newsreader, plexMono, plexSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "credIA",
  description: "Paquete de datos de crédito para prestamistas de pymes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
