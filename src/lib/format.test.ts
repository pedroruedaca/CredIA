import { describe, expect, it } from "vitest";
import { formatFigure } from "./format.ts";

describe("formatFigure", () => {
  it("formats euros with Spanish grouping, millions as M€", () => {
    expect(formatFigure(412345.6, "EUR")).toEqual({ number: "412.346", unit: "€" });
    expect(formatFigure(1250, "EUR")).toEqual({ number: "1.250", unit: "€" });
    expect(formatFigure(-1_250_000, "EUR")).toEqual({ number: "-1,25", unit: "M€" });
  });
  it("formats ratios, percentages and days", () => {
    expect(formatFigure(1.834, "x")).toEqual({ number: "1,8", unit: "x" });
    expect(formatFigure(12.46, "%")).toEqual({ number: "12", unit: "%" });
    expect(formatFigure(45.2, "days")).toEqual({ number: "45", unit: "días" });
    expect(formatFigure(2.456, "x", 2)).toEqual({ number: "2,46", unit: "x" });
  });
  it("shows a dash for missing values", () => {
    expect(formatFigure(null, "x")).toEqual({ number: "—", unit: "" });
    expect(formatFigure(Number.NaN, "EUR")).toEqual({ number: "—", unit: "" });
  });
});
