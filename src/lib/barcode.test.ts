import { describe, expect, it } from "vitest";
import { normalizeBarcodeValue, normalizeVariantBarcodes } from "./barcode";

describe("BARTIKA barcode values", () => {
  it("trims whitespace and normalizes letters to uppercase", () => {
    expect(normalizeBarcodeValue("  bjk-ab12  ")).toBe("BJK-AB12");
  });

  it("keeps an empty value for database-generated barcode", () => {
    expect(normalizeBarcodeValue("   ")).toBe("");
  });

  it("rejects non-printable or non-ASCII values that Code 128 cannot safely encode", () => {
    expect(() => normalizeBarcodeValue("جينز-٣٢")).toThrow();
    expect(() => normalizeBarcodeValue("BJK\n123")).toThrow();
  });

  it("rejects values longer than the database barcode limit", () => {
    expect(() => normalizeBarcodeValue("A".repeat(65))).toThrow();
  });

  it("normalizes variants and rejects duplicate manual barcodes case-insensitively", () => {
    expect(() => normalizeVariantBarcodes([
      { size: "32", barcode: "bjk-32" },
      { size: "34", barcode: "BJK-32" },
    ])).toThrow("لا يمكن تكرار نفس الباركود داخل المنتج");
  });

  it("allows multiple empty values for automatic database generation", () => {
    const result = normalizeVariantBarcodes([
      { size: "32", barcode: "" },
      { size: "34", barcode: " " },
    ]);
    expect(result.map((item) => item.barcode)).toEqual(["", ""]);
  });
});
