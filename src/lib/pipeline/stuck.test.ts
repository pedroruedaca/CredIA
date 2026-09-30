import { describe, expect, it } from "vitest";
import { stuckReason, type CaseProcessingState } from "./stuck.ts";

const now = new Date("2026-09-30T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
const base: CaseProcessingState = { status: "processing", submitted_at: ago(30), processing_lock_until: null, processing_requested: false, processed_at: ago(20), documents: [] };

describe("stuckReason", () => {
  it("a finished case is not stuck", () => {
    expect(stuckReason({ ...base, status: "ready", documents: [{ status: "parsed", uploaded_at: ago(40), processing_started_at: null, extractions: 1 }] }, now)).toBeNull();
  });
  it("leaves a running case alone", () => {
    expect(stuckReason({ ...base, processing_requested: true, processing_lock_until: new Date(now.getTime() + 60_000).toISOString() }, now)).toBeNull();
    expect(stuckReason({ ...base, processing_requested: true, processing_lock_until: ago(1) }, now)).toBe("requested");
  });
  it("a document uploaded minutes ago and never read, or parsing for too long, is stuck", () => {
    expect(stuckReason({ ...base, documents: [{ status: "uploaded", uploaded_at: ago(1), processing_started_at: null, extractions: 0 }] }, now)).toBeNull();
    expect(stuckReason({ ...base, documents: [{ status: "uploaded", uploaded_at: ago(5), processing_started_at: null, extractions: 0 }] }, now)).toBe("waiting_documents");
    // A PDF bank statement recorded as pending is not waiting for a run.
    expect(stuckReason({ ...base, documents: [{ status: "uploaded", uploaded_at: ago(50), processing_started_at: null, extractions: 1 }] }, now)).toBeNull();
    expect(stuckReason({ ...base, documents: [{ status: "parsing", uploaded_at: ago(40), processing_started_at: ago(10), extractions: 0 }] }, now)).toBeNull();
    expect(stuckReason({ ...base, documents: [{ status: "parsing", uploaded_at: ago(40), processing_started_at: ago(20), extractions: 0 }] }, now)).toBe("stale_parsing");
  });
  it("a submission no run has finished since is stuck; archived cases never are", () => {
    expect(stuckReason({ ...base, processed_at: ago(40) }, now)).toBe("submitted_not_finalised");
    expect(stuckReason({ ...base, processed_at: null, submitted_at: ago(1) }, now)).toBeNull();
    expect(stuckReason({ ...base, status: "archived", processing_requested: true }, now)).toBeNull();
  });
});
