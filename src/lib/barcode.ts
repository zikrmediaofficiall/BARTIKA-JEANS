export type BarcodeVariantInput = { barcode: string };

export function normalizeBarcodeValue(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return "";
  if (normalized.length > 64) {
    throw new Error("الباركود لا يمكن أن يتجاوز 64 حرفًا");
  }
  if (!/^[\x20-\x7E]+$/.test(normalized)) {
    throw new Error("الباركود يجب أن يحتوي على أحرف إنجليزية أو أرقام قابلة للطباعة فقط");
  }
  return normalized;
}

export function normalizeVariantBarcodes<T extends BarcodeVariantInput>(variants: T[]): T[] {
  const seen = new Set<string>();
  return variants.map((variant) => {
    const barcode = normalizeBarcodeValue(variant.barcode);
    if (barcode) {
      if (seen.has(barcode)) {
        throw new Error("لا يمكن تكرار نفس الباركود داخل المنتج");
      }
      seen.add(barcode);
    }
    return { ...variant, barcode };
  });
}
