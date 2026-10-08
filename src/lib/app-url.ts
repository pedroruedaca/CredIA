/** Public base URL for links sent by email. Server-only (reads request headers in development). */
import "server-only";
import { headers } from "next/headers";
import { resolveBaseUrl } from "./base-url.ts";

export async function appBaseUrl(): Promise<string> {
  const h = await headers();
  return resolveBaseUrl(process.env, () => {
    const host = h.get("host");
    return host ? `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}` : null;
  });
}
