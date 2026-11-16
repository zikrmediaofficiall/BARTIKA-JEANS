"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useMemo, useRef, useState } from "react";

export type BarcodeLabelItem = {
  id: string;
  barcode: string;
  product_name: string;
  sku: string;
  size: string | null;
  color: string | null;
  stock: number;
};

function BarcodeGraphic({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: 1.5,
        height: 42,
        displayValue: false,
        margin: 2,
        lineColor: "#111111",
        background: "#ffffff",
      });
      setError("");
    } catch {
      setError("قيمة الباركود غير صالحة للطباعة");
    }
  }, [value]);

  if (error) return <p className="text-xs text-red-700">{error}</p>;
  return <svg ref={svgRef} role="img" aria-label={`باركود ${value}`} className="barcode-svg block w-full" />;
}

export function BarcodeLabels({ items }: { items: BarcodeLabelItem[] }) {
  const [query, setQuery] = useState("");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ar");
    if (!term) return items;
    return items.filter((item) =>
      [item.product_name, item.sku, item.barcode, item.size || "", item.color || ""]
        .join(" ")
        .toLocaleLowerCase("ar")
        .includes(term),
    );
  }, [items, query]);

  const printItems = useMemo(() => filtered.flatMap((item) => {
    const count = Math.max(0, Math.min(500, copies[item.id] ?? 1));
    return Array.from({ length: count }, (_, index) => ({ ...item, printKey: `${item.id}-${index}` }));
  }), [filtered, copies]);

  function setCopyCount(id: string, value: number) {
    setCopies((current) => ({ ...current, [id]: Math.max(0, Math.min(500, Math.floor(value || 0))) }));
  }

  function useStockQuantity(item: BarcodeLabelItem) {
    setCopyCount(item.id, Math.max(1, item.stock));
  }

  function print() {
    if (!printItems.length) {
      setNotice("اختر عدد نسخ أكبر من صفر لملصق واحد على الأقل");
      return;
    }
    setNotice("");
    document.body.dataset.printMode = "barcode-labels";
    window.print();
  }

  useEffect(() => {
    const reset = () => { delete document.body.dataset.printMode; };
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);

  return (
    <section className="space-y-4">
      <div className="no-print panel flex flex-wrap items-end justify-between gap-3 p-4">
        <label className="min-w-60 flex-1 text-sm font-bold">
          البحث بالاسم أو SKU أو الباركود أو المقاس أو اللون
          <input className="field mt-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن منتج أو متغير..." />
        </label>
        <div className="text-sm">
          <b>{filtered.length}</b>
          <span className="muted"> متغير مطابق</span>
          <p className="muted mt-1 text-xs">{printItems.length} ملصقًا في معاينة الطباعة</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={print}>طباعة الملصقات المحددة</button>
      </div>

      {notice ? <p className="no-print rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p> : null}

      <div id="bartika-barcode-print" className="barcode-print-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <article key={item.id} className="barcode-source panel overflow-hidden p-3">
            <div className="no-print mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <b className="block truncate text-sm">{item.product_name}</b>
                <p className="muted text-xs">{item.sku} · {item.size || "مقاس موحد"} · {item.color || "لون موحد"}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-900">المخزون {item.stock}</span>
            </div>
            <div className="no-print mb-3 flex items-center gap-2">
              <label className="text-xs font-bold">عدد النسخ</label>
              <input className="field w-24 py-2" type="number" min="0" max="500" value={copies[item.id] ?? 1} onChange={(event) => setCopyCount(item.id, Number(event.target.value))} />
              <button className="text-xs font-bold text-emerald-800 underline" type="button" onClick={() => useStockQuantity(item)}>حسب رصيد المخزون</button>
            </div>
            <div className="barcode-one-label rounded-lg border border-slate-200 bg-white p-2 text-center">
              <p className="mb-1 truncate text-xs font-bold text-slate-900">{item.product_name}</p>
              <p className="mb-1 text-[10px] text-slate-700">{item.size || "—"} · {item.color || "—"}</p>
              <BarcodeGraphic value={item.barcode} />
              <p className="mt-1 break-all font-mono text-[11px] tracking-wider text-black">{item.barcode}</p>
            </div>
          </article>
        ))}
        {!filtered.length ? <div className="panel muted p-8 text-center sm:col-span-2 xl:col-span-3">لا توجد متغيرات مطابقة للبحث.</div> : null}

        <div className="barcode-print-only">
          {printItems.map((item) => (
            <div key={item.printKey} className="barcode-one-label barcode-print-card">
              <p className="mb-1 truncate text-xs font-bold text-slate-900">{item.product_name}</p>
              <p className="mb-1 text-[10px] text-slate-700">{item.size || "—"} · {item.color || "—"}</p>
              <BarcodeGraphic value={item.barcode} />
              <p className="mt-1 break-all font-mono text-[11px] tracking-wider text-black">{item.barcode}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="no-print muted text-xs leading-6">
        نوع الترميز المستخدم هو Code 128، ويدعم الأكواد التلقائية بصيغة BJK والأكواد اليدوية القابلة للطباعة. يمكن اختيار عدد الملصقات لكل متغير أو استخدام رصيد المخزون كعدد نسخ. اختبر المقاس مع طابعة الملصقات والماسح الفعلي قبل طباعة دفعة كبيرة.
      </p>
    </section>
  );
}
