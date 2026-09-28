import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { seal, open } from "./token.ts";

describe("token sealing", () => {
  beforeEach(() => { process.env.CREDIA_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });

  it("round-trips", () => {
    const s = seal("holded-key-abc", "conn-1");
    expect(s.ciphertext.toString("utf8")).not.toContain("holded-key");
    expect(open(s, "conn-1")).toBe("holded-key-abc");
  });

  it("fails if moved to another row", () => {
    const s = seal("holded-key-abc", "conn-1");
    expect(() => open(s, "conn-2")).toThrow();
  });
});
