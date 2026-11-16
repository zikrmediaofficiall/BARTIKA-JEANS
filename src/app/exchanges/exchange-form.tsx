"use client";

import { useMemo, useState } from "react";
import { processSaleExchange } from "@/app/actions";

type SaleItemOption = {
  id: string;
  label: string;
  remaining: number;
  netUnitPrice: number;
};

type VariantOption = {
  id: string;
  label: string;
  price: number;
  stock: number;
};

type ExchangeLine = {
  id: string;
  sale_item_id: string;
  quantity: string;
  replacement_variant_id: string;
};

const newLine = (id: string): ExchangeLine => ({
  id,
  sale_item_id: "",
  quantity: "1",
  replacement_variant_id: "",
});

const money = (value: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(value);

export function ExchangeForm({
  saleId,
  invoiceNumber,
  saleItems,
  variants,
}: {
  saleId: string;
  invoiceNumber: number;
  saleItems: SaleItemOption[];
  variants: VariantOption[];
}) {
  const [lines, setLines] = useState<ExchangeLine[]>([newLine("exchange-1")]);
  const [nextId, setNextId] = useState(2);
  const [reason, setReason] = useState("");
  const [settlementMethod, setSettlementMethod] = useState("");
  const [settlementReference, setSettlementReference] = useState("");

  const selectedLines = useMemo(
    () =>
      lines.map((line) => {
        const saleItem = saleItems.find((item) => item.id === line.sale_item_id);
        const replacement = variants.find(
          (variant) => variant.id === line.replacement_variant_id,
        );
        const quantity = Number(line.quantity);
        return {
          ...line,
          quantity,
          saleItem,
          replacement,
          returnedValue:
            saleItem && Number.isInteger(quantity) && quantity > 0
              ? saleItem.netUnitPrice * quantity
              : 0,
          replacementValue:
            replacement && Number.isInteger(quantity) && quantity > 0
              ? replacement.price * quantity
              : 0,
        };
      }),
    [lines, saleItems, variants],
  );

  const returnTotal = selectedLines.reduce((sum, line) => sum + line.returnedValue, 0);
  const replacementTotal = selectedLines.reduce(
    (sum, line) => sum + line.replacementValue,
    0,
  );
  const priceDifference = Math.round((replacementTotal - returnTotal) * 100) / 100;
  const duplicateSaleItems =
    new Set(lines.map((line) => line.sale_item_id).filter(Boolean)).size !==
    lines.filter((line) => line.sale_item_id).length;

  const linesValid = selectedLines.every((line) => {
    if (!line.sale_item_id || !line.saleItem) return false;
    if (!Number.isInteger(line.quantity) || line.quantity < 1) return false;
    if (line.quantity > line.saleItem.remaining) return false;
    if (line.replacement_variant_id && !line.replacement) return false;
    return true;
  });

  const settlementValid =
    priceDifference === 0
      ? settlementMethod === ""
      : Boolean(
          settlementMethod &&
            (settlementMethod === "cash" ||
              settlementReference.trim().length >= 3),
        );

  const ready =
    lines.length > 0 &&
    linesValid &&
    !duplicateSaleItems &&
    reason.trim().length >= 4 &&
    settlementValid;

  function updateLine(id: string, patch: Partial<ExchangeLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, newLine(`exchange-${nextId}`)]);
    setNextId((current) => current + 1);
  }

  function removeLine(id: string) {
    setLines((current) =>
      current.length > 1 ? current.filter((line) => line.id !== id) : current,
    );
  }

  const itemsJson = JSON.stringify(
    selectedLines.map((line) => ({
      sale_item_id: line.sale_item_id,
      quantity: line.quantity,
      replacement_variant_id: line.replacement_variant_id,
    })),
  );

  return (
    <form action={processSaleExchange} className="panel space-y-4 p-5">
      <input type="hidden" name="original_sale_id" value={saleId} />
      <input type="hidden" name="invoice_number" value={invoiceNumber} />
      <input type="hidden" name="items_json" value={itemsJson} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black">تسجيل استبدال أو مرتجع</h3>
          <p className="muted mt-1 text-xs">
            اختر البند الأصلي والكمية، ثم حدد المقاس/اللون البديل أو اختر «مرتجع فقط».
          </p>
        </div>
        <button
          type="button"
          className="btn btn-gold"
          onClick={addLine}
          disabled={lines.length >= 50}
        >
          ＋ إضافة بند
        </button>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => {
          const selectedSaleItem = saleItems.find((item) => item.id === line.sale_item_id);
          return (
            <section
              key={line.id}
              className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_0.6fr_minmax(0,1.5fr)_auto]"
            >
              <label className="block text-sm font-bold">
                الصنف الأصلي من الفاتورة
                <select
                  className="field mt-1"
                  value={line.sale_item_id}
                  onChange={(event) => {
                    const item = saleItems.find((entry) => entry.id === event.target.value);
                    updateLine(line.id, {
                      sale_item_id: event.target.value,
                      quantity: item ? "1" : "1",
                    });
                  }}
                  required
                >
                  <option value="" disabled>اختر الصنف</option>
                  {saleItems.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      disabled={
                        item.remaining < 1 ||
                        lines.some(
                          (other) =>
                            other.id !== line.id && other.sale_item_id === item.id,
                        )
                      }
                    >
                      {item.label} · المتبقي للاستبدال: {item.remaining}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-bold">
                الكمية
                <input
                  className="field mt-1"
                  type="number"
                  min="1"
                  max={selectedSaleItem?.remaining || 1}
                  step="1"
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                  required
                />
              </label>

              <label className="block text-sm font-bold">
                البديل (اختياري للمرتجع فقط)
                <select
                  className="field mt-1"
                  value={line.replacement_variant_id}
                  onChange={(event) =>
                    updateLine(line.id, { replacement_variant_id: event.target.value })
                  }
                >
                  <option value="">مرتجع فقط — بدون بديل</option>
                  {variants.map((variant) => (
                    <option
                      key={variant.id}
                      value={variant.id}
                      disabled={
                        variant.stock < Number(line.quantity || 0) &&
                        variant.id !== line.replacement_variant_id
                      }
                    >
                      {variant.label} · {money(variant.price)} · المتاح {variant.stock}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end justify-between gap-3">
                <div className="text-xs">
                  <p className="muted">قيمة المرتجع</p>
                  <b>{money(selectedLines[index]?.returnedValue || 0)}</b>
                  <p className="muted mt-2">قيمة البديل</p>
                  <b>{money(selectedLines[index]?.replacementValue || 0)}</b>
                </div>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                  onClick={() => removeLine(line.id)}
                  disabled={lines.length === 1}
                  aria-label={`حذف البند ${index + 1}`}
                >
                  حذف
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {duplicateSaleItems ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          لا تكرر بند الفاتورة نفسه. اجمع الكمية في سطر واحد.
        </p>
      ) : null}

      <label className="block text-sm font-bold">
        سبب الاستبدال أو المرتجع
        <textarea
          className="field mt-1 min-h-20"
          name="reason"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="مثال: المقاس غير مناسب"
          required
        />
      </label>

      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        <div>
          <p className="muted text-xs">إجمالي المرتجع</p>
          <b className="text-lg">{money(returnTotal)}</b>
        </div>
        <div>
          <p className="muted text-xs">قيمة البدائل</p>
          <b className="text-lg">{money(replacementTotal)}</b>
        </div>
        <div>
          <p className="muted text-xs">
            {priceDifference > 0
              ? "المطلوب تحصيله من العميل"
              : priceDifference < 0
                ? "المبلغ الذي سيتم رده للعميل"
                : "فرق السعر"}
          </p>
          <b className="text-lg">{money(Math.abs(priceDifference))}</b>
        </div>
      </div>

      {priceDifference !== 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-bold">
            وسيلة التسوية
            <select
              className="field mt-1"
              name="settlement_method"
              value={settlementMethod}
              onChange={(event) => setSettlementMethod(event.target.value)}
              required
            >
              <option value="" disabled>اختر وسيلة التحصيل / الرد</option>
              <option value="cash">كاش</option>
              <option value="instapay">InstaPay</option>
              <option value="visa">Visa</option>
            </select>
          </label>
          <label className="block text-sm font-bold">
            مرجع التحويل / الفيزا
            <input
              className="field mt-1"
              name="settlement_reference"
              value={settlementReference}
              onChange={(event) => setSettlementReference(event.target.value)}
              minLength={settlementMethod && settlementMethod !== "cash" ? 3 : undefined}
              maxLength={120}
              placeholder={settlementMethod === "cash" ? "اختياري" : "مطلوب للتحويل أو الفيزا"}
              required={Boolean(settlementMethod && settlementMethod !== "cash")}
            />
          </label>
          {settlementMethod === "cash" ? (
            <p className="muted text-xs sm:col-span-2">
              يجب أن تكون لك وردية نقدية مفتوحة حتى يُسجل فرق السعر في درجك ويظهر في إغلاق الوردية.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="muted text-sm">
          لا توجد تسوية مالية مطلوبة؛ قيمة المرتجع والبدائل متساوية.
        </p>
      )}

      <button className="btn btn-primary w-full sm:w-auto" disabled={!ready}>
        اعتماد الاستبدال وتحديث المخزون
      </button>
      <p className="muted text-xs">
        لا يمكن استبدال فاتورة عليها مبلغ متبقٍ حاليًا. لا تنتقص سياسة المحل من الحقوق القانونية للمستهلك في السلع المعيبة أو غير المطابقة.
      </p>
    </form>
  );
}
