/**
 * End-to-end happy path against a local Supabase (`npx supabase start`) and a dev server on port 3100.
 *   npm run test:e2e
 * Uses its own port so it never touches a dev server you have open. Set PW_CHROMIUM_PATH to use a
 * preinstalled Chromium instead of `npx playwright install chromium`. E2E_PROD=1 runs against a production build
 * (`next build && next start`) instead of the dev server, for `e2e/csp.spec.ts`: the Content-Security-Policy is stricter
 * there (no eval). The other specs are written against the dev server; some fail on a production build (on main too).
 */
import { defineConfig } from "@playwright/test";
import { localSupabase } from "./e2e/supabase";

const sb = localSupabase();
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: "e2e/.auth/lender.json",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: process.env.E2E_PROD ? `npx next build && npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 600_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: sb.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anon,
      SUPABASE_SERVICE_ROLE_KEY: sb.service,
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      CREDIA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      ANTHROPIC_API_KEY: "",
    },
  },
});
