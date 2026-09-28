import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

export const newsreader = Newsreader({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-newsreader" });
export const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
export const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
