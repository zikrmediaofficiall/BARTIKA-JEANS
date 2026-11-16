"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { checkoutSale } from "@/app/actions";
import {
  cachePosCatalog,
  enqueueOfflineSale,
  listOfflineSales,
  updateOfflineSale,
  type OfflineSaleRecord,
  type OfflineSalePayload,
} from "@/lib/offline-pos";

type Item = {
  variant_id: string;
  product_name: string;
  sku: string;
  barcode: string;
  size: string | null;
  color: string | null;
  price: number;
  stock: number;
};

type PaymentMethod = "cash" | "instapay" | "visa";

const paymentLabels: Record<PaymentMethod, string> = {
  cash: "نقدي",
  instapay: "InstaPay",
  visa: "فيزا",
};

export default function POSClient({
  catalog,
  maxDiscount,
}: {
  catalog: Item[];
  maxDiscount: number;
}) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<
    { variant_id: string; name: string; price: number; qty: number; stock: number }[]
  >([]);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [secondMethod, setSecondMethod] = useState<PaymentMethod>("instapay");
  const [paid, setPaid] = useState("");
  const [secondPaid, setSecondPaid] = useState("");
  const [reference, setReference] = useState("");
  const [customer, setCustomer] = useState("");
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const [isOnline, setIsOnline] = useState(true);
  const [offlineRecords, setOfflineRecords] = useState<OfflineSaleRecord[]>([]);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const syncingOfflineRef = useRef(false);
  const syncOfflineQueueRef = useRef<() => Promise<void>>(async () => {});

  const refreshOfflineQueue = useCallback(async () => {
    try {
      const records = await listOfflineSales();
      setOfflineRecords(records.filter((record) => record.status !== "synced"));
    } catch {
      // IndexedDB may be unavailable in private browsing; online POS remains usable.
    }
  }, []);

  useEffect(() => {
    const updateConnection = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) void syncOfflineQueueRef.current();
    };
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    void cachePosCatalog({ items: catalog, maxDiscount }).catch(() => {});
    void refreshOfflineQueue();
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [catalog, maxDiscount, refreshOfflineQueue]);

  async function syncOfflineQueue() {
    if (!navigator.onLine) {
      setMessage("لا يوجد اتصال بالإنترنت. ستظل الفواتير محفوظة على هذا الجهاز.");
      return;
    }
    if (syncingOfflineRef.current) return;
    syncingOfflineRef.current = true;
    setSyncingOffline(true);
    try {
      const records = await listOfflineSales();
      for (const record of records) {
        if (record.status !== "pending") continue;
        try {
          const response = await fetch("/api/offline-sales/sync", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(record.payload),
          });
          const body = await response.json().catch(() => ({}));
          if (response.status === 401) {
            setMessage(body.error || "سجل الدخول مرة أخرى قبل مزامنة المبيعات.");
            break;
          }
          if (!response.ok) {
            await updateOfflineSale({
              ...record,
              status: "needs_review",
              error: body.error || "تعذر اعتماد الفاتورة؛ راجع المخزون والوردية والصلاحيات.",
            });
            continue;
          }
          const sale = body.sale && typeof body.sale === "object" ? body.sale : {};
          await updateOfflineSale({
            ...record,
            status: "synced",
            error: undefined,
            sale_id: typeof sale.id === "string" ? sale.id : undefined,
            invoice_number: typeof sale.invoice_number === "number" ? sale.invoice_number : undefined,
          });
        } catch (error) {
          await updateOfflineSale({
            ...record,
            status: "pending",
            error: error instanceof Error ? error.message : "تعذر الاتصال بالخادم",
          });
          break;
        }
      }
      await refreshOfflineQueue();
      setMessage("انتهت محاولة المزامنة. راجع الفواتير التي تحتاج مراجعة قبل اعتبارها معتمدة.");
    } finally {
      syncingOfflineRef.current = false;
      setSyncingOffline(false);
    }
  }

  syncOfflineQueueRef.current = syncOfflineQueue;

  const filtered = useMemo(
    () =>
      catalog
        .filter((product) =>
          (
            product.product_name +
            " " +
            product.sku +
            " " +
            product.barcode +
            " " +
            (product.size || "") +
            " " +
            (product.color || "")
          )
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 16),
    [catalog, query],
  );

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = Math.round(subtotal * (1 - discount / 100) * 100) / 100;
  const firstAmount = paid === "" ? (secondPaid ? 0 : total) : Number(paid);
  const secondAmount = Number(secondPaid || 0);
  const paidValue = firstAmount + secondAmount;

  function add(product: Item) {
    setCart((old) => {
      const found = old.find((item) => item.variant_id === product.variant_id);
      if (found) {
        return old.map((item) =>
          item.variant_id === product.variant_id
            ? { ...item, qty: Math.min(item.stock, item.qty + 1) }
            : item,
        );
      }
      return [
        ...old,
        {
          variant_id: product.variant_id,
          name:
            product.product_name +
            " · " +
            [product.size, product.color].filter(Boolean).join(" / "),
          price: product.price,
          qty: 1,
          stock: product.stock,
        },
      ];
    });
  }

  function finish() {
    setMessage("");

    if (!cart.length) return setMessage("أضف صنفًا أولًا");
    if (
      firstAmount < 0 ||
      secondAmount < 0 ||
      paidValue > total ||
      (total > 0 && paidValue <= 0)
    ) {
      return setMessage("راجع المبالغ المدفوعة والإجمالي");
    }
    if (paidValue < total && !customer.trim()) {
      return setMessage("أدخل رقم هاتف العميل عند وجود مبلغ متبقٍ");
    }

    const payload: OfflineSalePayload = {
      idempotency_key: crypto.randomUUID(),
      items: cart.map((item) => ({
        variant_id: item.variant_id,
        quantity: item.qty,
      })),
      payments: [
        ...(firstAmount > 0 ? [{ method, amount: firstAmount, reference }] : []),
        ...(secondAmount > 0 ? [{ method: secondMethod, amount: secondAmount, reference }] : []),
      ],
      discount_percent: discount,
      customer_phone: customer || undefined,
    };

    start(async () => {
      try {
        if (!navigator.onLine) {
          await enqueueOfflineSale(payload);
          await refreshOfflineQueue();
          setMessage("تم حفظ العملية على هذا الجهاز كفاتورة معلّقة. لن تُعتبر بيعًا معتمدًا حتى تنجح المزامنة والتحقق من المخزون والوردية.");
        } else {
          const result = await checkoutSale(payload);
          const invoiceLabel =
            result && typeof result === "object" && !Array.isArray(result)
              ? typeof result.invoice_number === "number"
                ? String(result.invoice_number)
                : typeof result.id === "string"
                  ? result.id
                  : ""
              : "";
          setMessage("تم إنشاء الفاتورة رقم " + invoiceLabel);
        }
        setCart([]);
        setPaid("");
        setSecondPaid("");
        setCustomer("");
        setReference("");
        setDiscount(0);
      } catch (error) {
        if (!navigator.onLine || error instanceof TypeError) {
          await enqueueOfflineSale(payload);
          await refreshOfflineQueue();
          setMessage("انقطع الاتصال أثناء الحفظ؛ تم الاحتفاظ بالعملية محليًا بنفس رقم التكرار لمنع إصدار فاتورتين. المزامنة مطلوبة.");
        } else {
          setMessage(error instanceof Error ? error.message : "تعذر إتمام البيع");
        }
      }
    });
  }

  return (
    <main className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">الكاشير ونقطة البيع</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className={"rounded-full px-3 py-2 text-xs font-bold " + (isOnline ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900")}>
              {isOnline ? "متصل" : "دون اتصال"}
            </span>
            <a className="btn border text-xs" href="/offline-pos.html">فتح واجهة البيع Offline</a>
          </div>
        </div>
        {offlineRecords.length ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="text-sm">فواتير محفوظة على الجهاز: {offlineRecords.length}</b>
                <p className="muted mt-1 text-xs">غير معتمدة حتى تظهر برقم فاتورة بعد المزامنة.</p>
              </div>
              <button type="button" className="btn btn-primary" disabled={!isOnline || syncingOffline} onClick={syncOfflineQueue}>
                {syncingOffline ? "جارٍ المزامنة…" : "مزامنة الفواتير"}
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-xs">
              {offlineRecords.slice(0,5).map((record) => (
                <li key={record.idempotency_key}>
                  {new Date(record.created_at).toLocaleString("ar-EG")} ·
                  {record.status === "needs_review" ? " تحتاج مراجعة" : " بانتظار المزامنة"}
                  {record.error ? " · " + record.error : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!isOnline ? (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">
            الوضع دون اتصال يستخدم آخر كتالوج محفوظ. البيع يُحفظ كمعلّق فقط، ولا يتم خصم المخزون أو إصدار فاتورة رسمية إلا بعد المزامنة الناجحة.
          </p>
        ) : null}
        <input
          className="field mb-4"
          placeholder="امسح الباركود أو ابحث باسم الصنف / SKU"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((product) => (
            <button
              key={product.variant_id}
              onClick={() => add(product)}
              className="rounded-xl border border-slate-100 p-3 text-right hover:border-gold-400 disabled:opacity-40"
              disabled={product.stock < 1}
            >
              <b>{product.product_name}</b>
              <p className="muted mt-1 text-xs">
                {product.sku} · {product.size || "—"} · {product.color || "—"}
              </p>
              <div className="mt-2 flex justify-between text-sm">
                <strong>{product.price.toLocaleString("ar-EG")} ج.م</strong>
                <span className="muted">المتاح: {product.stock}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h3 className="mb-4 text-lg font-black">الفاتورة الحالية</h3>

        {cart.length === 0 ? (
          <p className="muted py-8 text-center">لم تتم إضافة منتجات</p>
        ) : (
          cart.map((item) => (
            <div
              key={item.variant_id}
              className="flex items-center justify-between border-b py-3"
            >
              <div>
                <b>{item.name}</b>
                <p className="muted text-sm">
                  {item.price.toLocaleString("ar-EG")} × {item.qty}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg bg-slate-100 px-3 py-1"
                  onClick={() =>
                    setCart((current) =>
                      current.map((line) =>
                        line.variant_id === item.variant_id
                          ? { ...line, qty: Math.max(1, line.qty - 1) }
                          : line,
                      ),
                    )
                  }
                  aria-label="تقليل الكمية"
                >
                  −
                </button>
                <button
                  className="rounded-lg bg-slate-100 px-3 py-1"
                  onClick={() =>
                    setCart((current) =>
                      current.map((line) =>
                        line.variant_id === item.variant_id
                          ? { ...line, qty: Math.min(line.stock, line.qty + 1) }
                          : line,
                      ),
                    )
                  }
                  aria-label="زيادة الكمية"
                >
                  ＋
                </button>
                <button
                  className="text-red-600"
                  onClick={() =>
                    setCart((current) =>
                      current.filter((line) => line.variant_id !== item.variant_id),
                    )
                  }
                  aria-label="حذف الصنف"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm">
            الخصم المسموح حتى {maxDiscount}%
            <input
              className="field mt-1"
              type="number"
              min="0"
              max={maxDiscount}
              step="0.5"
              value={discount}
              disabled={maxDiscount === 0}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDiscount(
                  Number.isFinite(value)
                    ? Math.min(maxDiscount, Math.max(0, value))
                    : 0,
                );
              }}
            />
          </label>
          <label className="text-sm">
            طريقة الدفع الأولى
            <select
              className="field mt-1"
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            >
              {Object.entries(paymentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block text-sm">
          المبلغ المدفوع بالطريقة الأولى
          <input
            className="field mt-1"
            type="number"
            min="0"
            step="0.01"
            value={paid}
            onChange={(event) => setPaid(event.target.value)}
            placeholder={total.toFixed(2)}
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            طريقة الدفع الثانية
            <select
              className="field mt-1"
              value={secondMethod}
              onChange={(event) => setSecondMethod(event.target.value as PaymentMethod)}
            >
              {Object.entries(paymentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            المبلغ بالطريقة الثانية
            <input
              className="field mt-1"
              type="number"
              min="0"
              step="0.01"
              value={secondPaid}
              onChange={(event) => setSecondPaid(event.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>

        <label className="mt-3 block text-sm">
          رقم العميل (مطلوب عند وجود باقي)
          <input
            className="field mt-1"
            value={customer}
            onChange={(event) => setCustomer(event.target.value)}
            placeholder="01xxxxxxxxx"
          />
        </label>

        <label className="mt-3 block text-sm">
          مرجع التحويل / الفيزا
          <input
            className="field mt-1"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>

        <div className="mt-4 space-y-2 rounded-xl bg-emerald-50 p-4">
          <div className="flex justify-between">
            <span>قبل الخصم</span>
            <b>{subtotal.toFixed(2)} ج.م</b>
          </div>
          <div className="flex justify-between">
            <span>الإجمالي بعد الخصم</span>
            <b className="text-xl text-emerald-950">{total.toFixed(2)} ج.م</b>
          </div>
          <div className="flex justify-between text-sm">
            <span>إجمالي المدفوع</span>
            <b>{paidValue.toFixed(2)} ج.م</b>
          </div>
          <div className="flex justify-between text-sm">
            <span>المتبقي</span>
            <b>{Math.max(0, total - paidValue).toFixed(2)} ج.م</b>
          </div>
        </div>

        {message && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">{message}</p>
        )}

        <button
          disabled={busy || !cart.length}
          onClick={finish}
          className="btn btn-primary mt-4 w-full disabled:opacity-50"
        >
          {busy ? "جارٍ الحفظ…" : "اعتماد البيع وإصدار الفاتورة"}
        </button>
        <p className="muted mt-3 text-xs">
          يلزم الاتصال بالخادم لاعتماد البيع والتحقق من المخزون ومنع تكرار الفاتورة.
        </p>
      </section>
    </main>
  );
}
