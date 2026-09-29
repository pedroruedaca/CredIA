import { describe, expect, it } from "vitest";
import { defaultStep, nextStep, resolveStep, stepNumber } from "./steps.ts";

const items = [
  { kind: "trial_balance", state: "done" },
  { kind: "norma43", state: "pending" },
  { kind: "cirbe", state: "pending" },
  { kind: "modelo200", state: "done" },
  { kind: "tgss_cert", state: "attention" },
] as const;

describe("borrower steps", () => {
  it("lands on a step needing attention before a pending one", () => {
    expect(defaultStep([...items])).toBe("tgss_cert");
    expect(defaultStep(items.filter((i) => i.state !== "attention"))).toBe("norma43");
    expect(defaultStep(items.filter((i) => i.state === "done"))).toBe("enviar");
  });
  it("honours ?paso when it names a step of this case", () => {
    expect(resolveStep("cirbe", [...items])).toBe("cirbe");
    expect(resolveStep("enviar", [...items])).toBe("enviar");
    expect(resolveStep("aeat_cert", [...items])).toBe("tgss_cert"); // not requested here
    expect(resolveStep(undefined, [...items])).toBe("tgss_cert");
  });
  it("Continuar goes to the next step not done, looping round, then to review", () => {
    expect(nextStep("norma43", [...items])).toBe("cirbe");
    expect(nextStep("cirbe", [...items])).toBe("tgss_cert");
    expect(nextStep("tgss_cert", [...items])).toBe("norma43");
    expect(nextStep("trial_balance", items.map((i) => ({ ...i, state: "done" as const })))).toBe("enviar");
  });
  it("numbers steps with review last", () => {
    expect(stepNumber("norma43", [...items])).toEqual({ n: 2, of: 6 });
    expect(stepNumber("enviar", [...items])).toEqual({ n: 6, of: 6 });
  });
});
