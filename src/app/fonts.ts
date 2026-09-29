import { Geist, Geist_Mono } from "next/font/google";

/** Geist for all text; Geist Mono for every figure, code and ID. */
export const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-geist" });
export const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });
