export type ShippingRate = {
  fee: number;
  free_shipping_threshold: number | null;
};

export function calculateShippingAmount(
  productsSubtotal: number,
  deliveryMethod: "delivery" | "pickup",
  rate: ShippingRate | null,
): number {
  if (!Number.isFinite(productsSubtotal) || productsSubtotal < 0) {
    throw new Error("قيمة المنتجات غير صحيحة");
  }
  if (deliveryMethod === "pickup") return 0;
  if (!rate) throw new Error("اختر منطقة التوصيل");
  if (!Number.isFinite(rate.fee) || rate.fee < 0) {
    throw new Error("رسوم الشحن غير صحيحة");
  }
  const threshold = rate.free_shipping_threshold;
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0)) {
    throw new Error("حد الشحن المجاني غير صحيح");
  }
  if (threshold !== null && productsSubtotal >= threshold) return 0;
  return Math.round(rate.fee * 100) / 100;
}
