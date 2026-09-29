import { describe, expect, it } from "vitest";
import { formatFigure, relativeTime } from "./format.ts";

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

describe("relativeTime", () => {
  const now = new Date("2026-09-29T12:00:00Z"); // 14:00 in Madrid
  it("uses minutes and hours today, then days, then the date", () => {
    expect(relativeTime("2026-09-29T11:59:40Z", now)).toBe("ahora");
    expect(relativeTime("2026-09-29T11:55:00Z", now)).toBe("hace 5 min");
    expect(relativeTime("2026-09-29T08:00:00Z", now)).toBe("hace 4 h");
    expect(relativeTime("2026-09-28T20:00:00Z", now)).toBe("ayer");
    expect(relativeTime("2026-09-25T10:00:00Z", now)).toBe("hace 4 días");
    expect(relativeTime("2026-09-01T10:00:00Z", now)).toMatch(/1 sept?\.? 2026/);
  });
});

describe("formatEurWhole", () => {
  it("groups whole euros with a true minus and no unit", async () => {
    const { formatEurWhole } = await import("./format.ts");
    expect(formatEurWhole(1_000_000)).toBe("1.000.000");
    expect(formatEurWhole(-9000.4)).toBe("−9.000");
    expect(formatEurWhole(0)).toBe("0");
    expect(formatEurWhole(null)).toBe("—");
  });
});
