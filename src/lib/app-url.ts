/** Public base URL for links sent to borrowers. Server-only (reads request headers). */
import "server-only";
import { headers } from "next/headers";
import { normaliseBaseUrl } from "./base-url.ts";

export async function appBaseUrl(): Promise<string> {
  const configured = normaliseBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
