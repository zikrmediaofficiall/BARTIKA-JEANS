"use client";

import { useMemo, useState } from "react";
import { receivePurchase } from "@/app/actions";

type SupplierOption = { id: string; label: string };
type VariantOption = { id: string; label: string };
type PurchaseLine = {
  id: string;
  variant_id: string;
  quantity: string;
  unit_cost: string;
};

const emptyLine = (id: string): PurchaseLine => ({
  id,
  variant_id: "",
  quantity: "1",
  unit_cost: "",
});

export function PurchaseInvoiceForm({
  suppliers,
  variants,
}: {
  suppliers: SupplierOption[];
  variants: VariantOption[];
}) {
  const [lines, setLines] = useState<PurchaseLine[]>([emptyLine("line-1")]);
  const [nextLineId, setNextLineId] = useState(2);

  const parsedLines = useMemo(
    () =>
      lines
        .filter((line) => line.variant_id && line.quantity && line.unit_cost !== "")
        .map((line) => ({
          variant_id: line.variant_id,
          quantity: Number(line.quantity),
          unit_cost: Number(line.unit_cost),
        }))
        .filter(
          (line) =>
            Number.isInteger(line.quantity) &&
            line.quantity > 0 &&
            Number.isFinite(line.unit_cost) &&
            line.unit_cost >= 0,
        ),
    [lines],
  );

  const subtotal = parsedLines.reduce(
    (sum, line) => sum + line.quantity * line.unit_cost,
    0,
  );
  const duplicateVariants =
    new Set(parsedLines.map((line) => line.variant_id)).size !== parsedLines.length;
  const ready =
    parsedLines.length === lines.length &&
    parsedLines.length > 0 &&
    !duplicateVariants;

  function updateLine(id: string, patch: Partial<PurchaseLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine(`line-${nextLineId}`)]);
    setNextLineId((current) => current + 1);
  }

  function removeLine(id: string) {
    setLines((current) =>
      current.length > 1 ? current.filter((line) => line.id !== id) : current,
    );
  }

  return (
    <form action={receivePurchase} className="panel mb-5 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black">إنشاء فاتورة شراء متعددة البنود</h3>
          <p className="muted mt-1 text-xs">
            أضف كل مقاس/لون كسطر مستقل، وسيتم تحديث مخزونه وتسجيل حركته داخل نفس المعاملة.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-gold"
          onClick={addLine}
          disabled={lines.length >= 100}
        >
          ＋ إضافة صنف
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-bold">
          المورد
          <select className="field mt-2" name="supplier_id" required defaultValue="">
            <option value="" disabled>اختر المورد</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold">
          رقم فاتورة المورد / المرجع
          <input
            className="field mt-2"
            name="reference"
            maxLength={120}
            placeholder="اختياري"
          />
        </label>
      </div>

      <input type="hidden" name="items_json" value={JSON.stringify(parsedLines)} />

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div
            key={line.id}
            className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_0.8fr_1fr_auto]"
          >
            <label className="block text-sm font-bold sm:col-span-2 xl:col-span-1">
              الصنف / المقاس / اللون
              <select
                className="field mt-2"
                value={line.variant_id}
                onChange={(event) => updateLine(line.id, { variant_id: event.target.value })}
                required
              >
                <option value="" disabled>اختر متغير المنتج</option>
                {variants.map((variant) => (
                  <option
                    key={variant.id}
                    value={variant.id}
                    disabled={lines.some(
                      (other) => other.id !== line.id && other.variant_id === variant.id,
                    )}
                  >
                    {variant.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold">
              الكمية
              <input
                className="field mt-2"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={line.quantity}
                onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                required
              />
            </label>
            <label className="block text-sm font-bold">
              تكلفة القطعة (ج.م)
              <input
                className="field mt-2"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={line.unit_cost}
                onChange={(event) => updateLine(line.id, { unit_cost: event.target.value })}
                required
              />
            </label>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="muted text-xs">إجمالي السطر</p>
                <b className="text-emerald-950">
                  {line.quantity && line.unit_cost !== "" &&
                  Number.isFinite(Number(line.quantity) * Number(line.unit_cost))
                    ? (Number(line.quantity) * Number(line.unit_cost)).toFixed(2)
                    : "0.00"}{" "}
                  ج.م
                </b>
              </div>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                onClick={() => removeLine(line.id)}
                disabled={lines.length === 1}
                aria-label={`حذف السطر ${index + 1}`}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <div>
          <p className="muted text-xs">إجمالي فاتورة الشراء</p>
          <b className="text-lg">{subtotal.toFixed(2)} ج.م</b>
        </div>
        <div>
          <p className="muted text-xs">المتبقي بعد الاستلام</p>
          <b className="text-lg">{subtotal.toFixed(2)} ج.م</b>
          <p className="muted mt-1 text-xs">يتم تسجيل أي سداد لاحق من كشف حساب المورد بشكل منفصل وموثق.</p>
        </div>
      </div>

      {duplicateVariants ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          لا تكرر نفس المقاس/اللون في أكثر من سطر؛ اجمع الكمية في سطر واحد.
        </p>
      ) : null}
      {!ready && !duplicateVariants ? (
        <p className="muted text-xs">
          أكمل بيانات جميع الأسطر، وتأكد أن المدفوع لا يتجاوز إجمالي الفاتورة.
        </p>
      ) : null}

      <button className="btn btn-primary w-full sm:w-auto" disabled={!ready}>
        اعتماد الفاتورة واستلام المخزون (السداد لاحقًا من كشف المورد)
      </button>
    </form>
  );
}
