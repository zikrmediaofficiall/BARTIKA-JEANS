"use client";

import { useMemo, useState } from "react";

type VariantLine = {
  id: string;
  size: string;
  color: string;
  barcode: string;
  opening_quantity: string;
};

const makeLine = (id: string): VariantLine => ({
  id,
  size: "",
  color: "",
  barcode: "",
  opening_quantity: "0",
});

export function ProductVariantsEditor() {
  const [lines, setLines] = useState<VariantLine[]>([makeLine("variant-1")]);
  const [nextId, setNextId] = useState(2);

  const variants = useMemo(
    () =>
      lines.map((line) => ({
        size: line.size.trim(),
        color: line.color.trim(),
        barcode: line.barcode.trim(),
        opening_quantity: Number(line.opening_quantity),
      })),
    [lines],
  );

  const duplicateOptions = useMemo(() => {
    const keys = variants.map(
      (variant) =>
        `${variant.size.toLocaleLowerCase("ar")}::${variant.color.toLocaleLowerCase("ar")}`,
    );
    return new Set(keys).size !== keys.length;
  }, [variants]);

  const duplicateBarcodes = useMemo(() => {
    const values = variants
      .map((variant) => variant.barcode)
      .filter(Boolean)
      .map((barcode) => barcode.toLocaleLowerCase("en"));
    return new Set(values).size !== values.length;
  }, [variants]);

  const quantitiesValid = variants.every(
    (variant) =>
      Number.isInteger(variant.opening_quantity) &&
      variant.opening_quantity >= 0,
  );

  function updateLine(id: string, patch: Partial<VariantLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, makeLine(`variant-${nextId}`)]);
    setNextId((current) => current + 1);
  }

  function removeLine(id: string) {
    setLines((current) =>
      current.length > 1 ? current.filter((line) => line.id !== id) : current,
    );
  }

  return (
    <div className="sm:col-span-2 xl:col-span-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black">المقاسات والألوان والمخزون الافتتاحي</h3>
          <p className="muted mt-1 text-xs">
            كل سطر ينشئ متغيرًا مستقلًا بباركود ومخزون منفصلين. اترك الباركود فارغًا للتوليد التلقائي.
          </p>
        </div>
        <button type="button" className="btn btn-gold" onClick={addLine} disabled={lines.length >= 100}>
          ＋ إضافة مقاس / لون
        </button>
      </div>

      <input type="hidden" name="variants_json" value={JSON.stringify(variants)} />

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div
            key={line.id}
            className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 xl:grid-cols-[0.8fr_0.9fr_1.4fr_0.8fr_auto]"
          >
            <label className="block text-sm font-bold">
              المقاس
              <input
                className="field mt-1"
                value={line.size}
                maxLength={40}
                onChange={(event) => updateLine(line.id, { size: event.target.value })}
                placeholder="مثال: 32 أو XL"
              />
            </label>
            <label className="block text-sm font-bold">
              اللون
              <input
                className="field mt-1"
                value={line.color}
                maxLength={60}
                onChange={(event) => updateLine(line.id, { color: event.target.value })}
                placeholder="مثال: أزرق غامق"
              />
            </label>
            <label className="block text-sm font-bold">
              الباركود اليدوي
              <input
                className="field mt-1"
                value={line.barcode}
                maxLength={64}
                dir="ltr"
                onChange={(event) => updateLine(line.id, { barcode: event.target.value })}
                placeholder="تلقائي عند تركه فارغًا"
              />
            </label>
            <label className="block text-sm font-bold">
              الكمية الافتتاحية
              <input
                className="field mt-1"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={line.opening_quantity}
                onChange={(event) => updateLine(line.id, { opening_quantity: event.target.value })}
                required
              />
            </label>
            <div className="flex items-end justify-end">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                onClick={() => removeLine(line.id)}
                disabled={lines.length === 1}
                aria-label={`حذف المتغير ${index + 1}`}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>

      {duplicateOptions || duplicateBarcodes || !quantitiesValid ? (
        <div className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {duplicateOptions ? <p>توجد تركيبة مقاس/لون مكررة؛ اجعل كل تركيبة مختلفة.</p> : null}
          {duplicateBarcodes ? <p>يوجد باركود مكرر بين المتغيرات.</p> : null}
          {!quantitiesValid ? <p>كل كمية افتتاحية يجب أن تكون عددًا صحيحًا غير سالب.</p> : null}
        </div>
      ) : null}
      <p className="muted mt-2 text-xs">
        عدد المتغيرات: {lines.length} · إجمالي المخزون الافتتاحي:{" "}
        {quantitiesValid
          ? variants.reduce((sum, variant) => sum + variant.opening_quantity, 0)
          : "راجع الكميات"}
      </p>
    </div>
  );
}
