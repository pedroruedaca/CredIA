import { describe, expect, it } from "vitest";
import { mayShowConfigProblems, missingRequiredConfig } from "./env.ts";

describe("required configuration", () => {
  it("names the settings that are missing, nothing else", () => {
    expect(missingRequiredConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: undefined })).toEqual([
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    expect(missingRequiredConfig({ NEXT_PUBLIC_SUPABASE_URL: "a", NEXT_PUBLIC_SUPABASE_ANON_KEY: "b", SUPABASE_SERVICE_ROLE_KEY: "c" })).toEqual([]);
  });

  it("names them on previews and locally, never in production", () => {
    expect(mayShowConfigProblems("preview")).toBe(true);
    expect(mayShowConfigProblems(undefined)).toBe(true);
    expect(mayShowConfigProblems("production")).toBe(false);
  });
});
