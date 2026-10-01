import { describe, expect, it } from "vitest";
import { expectedQuarters, filingDeadline, periodRange, quarterCoverage, quarterLabel } from "./modelo303.ts";

describe("periodRange", () => {
  it("covers a quarter or a month", () => {
    expect(periodRange(2026, "1T")).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(periodRange(2025, "4T")).toEqual({ start: "2025-10-01", end: "2025-12-31" });
    expect(periodRange(2024, "02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });
});

describe("expectedQuarters", () => {
  const labels = (today: string) => expectedQuarters(today).map(quarterLabel);

  it("asks for the last 4 quarters already due", () => {
    // 1 Oct 2026: the third quarter is not due until 20 Oct.
    expect(labels("2026-10-01")).toEqual(["3T 25", "4T 25", "1T 26", "2T 26"]);
    expect(labels("2026-10-20")).toEqual(["3T 25", "4T 25", "1T 26", "2T 26"]);
    expect(labels("2026-10-21")).toEqual(["4T 25", "1T 26", "2T 26", "3T 26"]);
  });

  it("waits for the fourth quarter until 30 January", () => {
    expect(filingDeadline({ year: 2025, q: 4 })).toBe("2026-01-30");
    expect(labels("2026-01-30")).toEqual(["4T 24", "1T 25", "2T 25", "3T 25"]);
    expect(labels("2026-01-31")).toEqual(["1T 25", "2T 25", "3T 25", "4T 25"]);
  });
});

describe("quarterCoverage", () => {
  const expected = expectedQuarters("2026-10-01");

  it("counts quarterly and monthly returns", () => {
    const r = quarterCoverage(
      [periodRange(2025, "3T"), periodRange(2026, "01"), periodRange(2026, "02"), periodRange(2026, "03"), periodRange(2026, "2T")],
      expected,
    );
    expect(r.covered.map(quarterLabel)).toEqual(["3T 25", "1T 26", "2T 26"]);
    expect(r.missing.map(quarterLabel)).toEqual(["4T 25"]);
  });

  it("a quarter with a missing month is not covered", () => {
    const r = quarterCoverage([periodRange(2025, "10"), periodRange(2025, "12")], expected);
    expect(r.missing.map(quarterLabel)).toContain("4T 25");
  });
});
