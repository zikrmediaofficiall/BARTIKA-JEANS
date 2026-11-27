import { describe, expect, it } from "vitest";
import { agingBucket, buildLedger } from "./ledger";

describe("buildLedger", () => {
  it("keeps a running balance that ends at the remaining due", () => {
    const l = buildLedger(
      [{ id: "a", invoice_number: 1, total: 1000, created_at: "2026-01-01T10:00:00Z" }],
      [
        { sale_id: "a", method: "cash", amount: 400, created_at: "2026-01-01T10:00:00Z" },
        { sale_id: "a", method: "visa", amount: 100, created_at: "2026-01-09T10:00:00Z" },
      ],
      { cash: "كاش", visa: "فيزا" },
    );
    expect(l.map((e) => e.balance)).toEqual([1000, 600, 500]);
    expect(l[0].kind).toBe("invoice");
  });
});

describe("agingBucket", () => {
  it("buckets by age", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    expect(agingBucket("2026-02-20T00:00:00Z", now)).toBe("0-30");
    expect(agingBucket("2026-01-20T00:00:00Z", now)).toBe("31-60");
    expect(agingBucket("2025-12-01T00:00:00Z", now)).toBe("61+");
  });
});
