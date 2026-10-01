import { describe, expect, it } from "vitest";
import { place } from "./Tooltip.tsx";

const rect = (left: number, top: number, w = 40, h = 40) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
const panel = { width: 200, height: 60 };

describe("tooltip placement", () => {
  it("centres above the trigger when there is room", () => {
    expect(place(rect(400, 300), panel, "top", 1024, 768)).toEqual({ side: "top", left: 320, top: 232 });
  });
  it("flips below when the top would overflow", () => {
    expect(place(rect(400, 20), panel, "top", 1024, 768)).toMatchObject({ side: "bottom", top: 68 });
  });
  it("stays inside the viewport horizontally", () => {
    expect(place(rect(0, 300), panel, "top", 1024, 768).left).toBe(8);
    expect(place(rect(1000, 300, 24), panel, "top", 1024, 768).left).toBe(1024 - 200 - 8);
  });
  it("goes to the right of a rail item, or below when there is no room", () => {
    expect(place(rect(14, 300), panel, "right", 1024, 768)).toEqual({ side: "right", left: 62, top: 290 });
    expect(place(rect(900, 10), panel, "right", 1024, 768).side).toBe("bottom");
  });
});
