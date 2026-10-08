import { describe, expect, it } from "vitest";
import { addMonths, closeUpdate, inactiveCases, isCloseReason, parseRetentionInput, reopenUpdate, retentionEndsOn } from "./closing.ts";

describe("addMonths / retentionEndsOn", () => {
  it("adds calendar months", () => {
    expect(addMonths("2026-10-08T09:30:00Z", 12)).toBe("2027-10-08");
    expect(addMonths("2026-10-08T09:30:00Z", 6)).toBe("2027-04-08");
  });
  it("clamps to the last day of a shorter month", () => {
    expect(addMonths("2026-01-31T12:00:00Z", 1)).toBe("2026-02-28");
    expect(addMonths("2027-01-31T12:00:00Z", 13)).toBe("2028-02-29");
    expect(addMonths("2026-08-31T00:00:00Z", 1)).toBe("2026-09-30");
  });
  it("is the closing date plus the lender's period", () => expect(retentionEndsOn("2026-10-08T09:30:00Z", 24)).toBe("2028-10-08"));
});

describe("closing and reopening", () => {
  const now = new Date("2026-10-08T10:00:00Z");
  it("closes as archived with the date and reason", () => {
    expect(closeUpdate("declined", now)).toEqual({ status: "archived", closed_at: "2026-10-08T10:00:00.000Z", closed_reason: "declined" });
  });
  it("only the analyst's three reasons can be chosen", () => {
    expect(["decided", "declined", "withdrawn"].every(isCloseReason)).toBe(true);
    expect(isCloseReason("inactive")).toBe(false);
    expect(isCloseReason("approved")).toBe(false);
  });
  it("a submitted case is processed again; otherwise it waits for documents", () => {
    expect(reopenUpdate("2026-09-01T00:00:00Z")).toEqual({ status: "processing", closed_at: null, closed_reason: null });
    expect(reopenUpdate(null)).toEqual({ status: "awaiting_documents", closed_at: null, closed_reason: null });
  });
});

describe("inactiveCases", () => {
  const now = new Date("2026-10-08T10:00:00Z");
  const row = (last: string, months: number | null) => ({ case_id: last, lender_id: "l", auto_close_months: months, last_activity: last });
  it("closes cases idle for the lender's months, counting from the last activity", () => {
    const rows = [row("2026-04-08T08:00:00Z", 6), row("2026-04-09T08:00:00Z", 6), row("2026-07-01T00:00:00Z", 3), row("2026-08-01T00:00:00Z", 3)];
    expect(inactiveCases(rows, now).map((r) => r.case_id)).toEqual(["2026-04-08T08:00:00Z", "2026-07-01T00:00:00Z"]);
  });
  it("never closes cases of a lender that turned it off", () => expect(inactiveCases([row("2020-01-01T00:00:00Z", null)], now)).toEqual([]));
});

describe("parseRetentionInput", () => {
  it("accepts the offered choices", () => {
    expect(parseRetentionInput({ retentionMonths: "24", autoCloseMonths: "6" })).toEqual({ ok: true, retention_months: 24, auto_close_months: 6 });
    expect(parseRetentionInput({ retentionMonths: 12, autoCloseMonths: "never" })).toEqual({ ok: true, retention_months: 12, auto_close_months: null });
  });
  it("refuses anything else", () => {
    expect(parseRetentionInput({ retentionMonths: "0", autoCloseMonths: "6" }).ok).toBe(false);
    expect(parseRetentionInput({ retentionMonths: "12", autoCloseMonths: "2" }).ok).toBe(false);
    expect(parseRetentionInput({ retentionMonths: "abc", autoCloseMonths: null }).ok).toBe(false);
  });
});
