import { describe, expect, it } from "vitest";
import { calculateShippingAmount } from "./shipping";

describe("BARTIKA shipping calculation", () => {
  it("returns the configured fee for delivery below the free threshold", () => {
    expect(calculateShippingAmount(450, "delivery", {
      fee: 50,
      free_shipping_threshold: 500,
    })).toBe(50);
  });

  it("makes delivery free at the threshold", () => {
    expect(calculateShippingAmount(500, "delivery", {
      fee: 50,
      free_shipping_threshold: 500,
    })).toBe(0);
  });

  it("returns zero for pickup", () => {
    expect(calculateShippingAmount(900, "pickup", null)).toBe(0);
  });

  it("requires an active selected zone for delivery", () => {
    expect(() => calculateShippingAmount(300, "delivery", null)).toThrow();
  });

  it("rounds shipping to two decimal places", () => {
    expect(calculateShippingAmount(10, "delivery", {
      fee: 10.236,
      free_shipping_threshold: null,
    })).toBe(10.24);
  });
});
