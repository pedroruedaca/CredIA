import * as z from "zod/v4";
import { describe, expect, it } from "vitest";
import { BankStatementWire, WIRE_FOR } from "./schemas.ts";

/** Parameters with union types (type arrays such as ["number","null"], or anyOf), as structured outputs counts them. */
function unionParams(schema: unknown): number {
  if (Array.isArray(schema)) return schema.reduce((n: number, s) => n + unionParams(s), 0);
  if (!schema || typeof schema !== "object") return 0;
  const o = schema as Record<string, unknown>;
  const self = Array.isArray(o.type) || Array.isArray(o.anyOf) ? 1 : 0;
  return self + Object.values(o).reduce((n: number, v) => n + unionParams(v), 0);
}

describe("wire schemas and the structured-output limits", () => {
  it("each extraction schema stays under the 16 union-typed parameters a request allows, with margin", () => {
    const counts = Object.fromEntries(Object.entries(WIRE_FOR).map(([k, s]) => [k, unionParams(z.toJSONSchema(s as z.ZodType))]));
    for (const [kind, n] of Object.entries(counts)) expect(n, kind).toBeLessThanOrEqual(12);
    expect(unionParams(z.toJSONSchema(BankStatementWire)), "bank_statement").toBeLessThanOrEqual(12);
  });
});
