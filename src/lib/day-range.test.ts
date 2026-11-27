import { describe, expect, it } from "vitest";
import { cairoDayRange, isValidDay } from "./day-range";

describe("cairoDayRange", () => {
  it("spans 24h and starts at Cairo midnight in winter", () => {
    const r = cairoDayRange("2026-01-15");
    expect(r.from).toBe("2026-01-14T22:00:00.000Z");
    expect(r.to).toBe("2026-01-15T22:00:00.000Z");
  });
  it("validates day strings", () => {
    expect(isValidDay("2026-02-30x")).toBe(false);
    expect(isValidDay("2026-02-03")).toBe(true);
  });
});
