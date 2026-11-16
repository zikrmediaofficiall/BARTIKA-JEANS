"use client";

import { useMemo, useState } from "react";
import { createOnlineOrder } from "@/app/actions";

type CatalogRow = {
  product_id: string;
  product_name: string;
  category: string;
  sale_price: number;
  image_url: string | null;
  variant_id: string;
  size: string | null;
  color: string | null;
  available_quantity: number;
};

type CartLine = {
  variant_id: string;
  product_name: string;
  size: string | null;
  color: string | null;
  unit_price: number;
  quantity: number;
  image_url: string | null;
};

export function StorefrontClient({ catalog }: { catalog: CatalogRow[] }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">("delivery");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const products = useMemo(() => {
    const groups = new Map<string, { product_id: string; name: string; category: string; price: number; image: string | null; variants: CatalogRow[] }>();
    for (const row of catalog) {
      const current = groups.get(row.product_id) || {
        product_id: row.product_id,
        name: row.product_name,
        category: row.category,
        price: Number(row.sale_price),
        image: row.image_url,
        variants: [],
      };
      current.variants.push(row);
      groups.set(row.product_id, current);
    }
    return Array.from(groups.values());
  }, [catalog]);

  const total = cart.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
  const cartPayload = JSON.stringify(cart.map((line) => ({
    variant_id: line.variant_id,
    quantity: line.quantity,
  })));

  function add(row: CatalogRow) {
    setCart((current) => {
      const existing = current.find((line) => line.variant_id === row.variant_id);
      if (existing) {
        if (existing.quantity >= row.available_quantity) return current;
        return current.map((line) =>
          line.variant_id === row.variant_id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [...current, {
        variant_id: row.variant_id,
        product_name: row.product_name,
        size: row.size,
        color: row.color,
        unit_price: Number(row.sale_price),
        quantity: 1,
        image_url: row.image_url,
      }];
    });
  }

  function changeQuantity(variantId: string, quantity: number) {
    if (quantity < 1) {
      setCart((current) => current.filter((line) => line.variant_id !== variantId));
      return;
    }
    const row = catalog.find((item) => item.variant_id === variantId);
    if (!row || quantity > row.available_quantity) return;
    setCart((current) => current.map((line) =>
      line.variant_id === variantId ? { ...line, quantity } : line,
    ));
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_390px]">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-black">تسوق أحدث المنتجات</h2>
            <p className="muted mt-1 text-sm">اختر المقاس واللون المتاحين وأضفهما إلى سلتك.</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-900">{products.length} موديل</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article key={product.product_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="aspect-[4/3] bg-slate-100">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-5xl">👖</div>
                )}
              </div>
              <div className="p-4">
                <p className="muted text-xs">{product.category}</p>
                <h3 className="mt-1 font-black">{product.name}</h3>
                <p className="mt-2 text-lg font-black text-emerald-900">{product.price.toFixed(2)} ج.م</p>
                <div className="mt-3 grid gap-2">
                  {product.variants.map((variant) => (
                    <div key={variant.variant_id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2">
                      <div className="text-xs">
                        <b>{variant.size || "مقاس موحد"}</b>
                        {variant.color ? <span className="muted"> · {variant.color}</span> : null}
                        <p className="muted mt-1">متاح: {variant.available_quantity}</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary text-xs"
                        onClick={() => add(variant)}
                        disabled={variant.available_quantity <= 0}
                      >
                        أضف للسلة
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
          {!products.length ? (
            <div className="panel p-6 text-center muted sm:col-span-2 xl:col-span-3">لا توجد منتجات متاحة للعرض حاليًا.</div>
          ) : null}
        </div>
      </section>

      <aside className="panel sticky top-4 p-5">
        <h2 className="text-xl font-black">سلة التسوق</h2>
        <p className="muted mt-1 text-xs">{cart.length} أصناف مختلفة</p>
        <div className="my-4 space-y-3">
          {cart.map((line) => (
            <div key={line.variant_id} className="border-b border-slate-100 pb-3">
              <div className="flex justify-between gap-2">
                <b className="text-sm">{line.product_name}</b>
                <b className="text-sm">{(line.unit_price * line.quantity).toFixed(2)} ج.م</b>
              </div>
              <p className="muted mt-1 text-xs">{line.size || "مقاس موحد"}{line.color ? " · " + line.color : ""}</p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className="rounded border px-3 py-1" onClick={() => changeQuantity(line.variant_id, line.quantity - 1)}>−</button>
                <span className="text-sm font-bold">{line.quantity}</span>
                <button type="button" className="rounded border px-3 py-1" onClick={() => changeQuantity(line.variant_id, line.quantity + 1)}>+</button>
                <button type="button" className="mr-auto text-xs text-red-700 underline" onClick={() => changeQuantity(line.variant_id, 0)}>حذف</button>
              </div>
            </div>
          ))}
          {!cart.length ? <p className="muted py-4 text-center text-sm">السلة فارغة. أضف منتجًا للمتابعة.</p> : null}
        </div>
        <div className="mb-4 flex items-center justify-between border-t pt-4">
          <b>الإجمالي التقديري</b>
          <b className="text-xl text-emerald-900">{total.toFixed(2)} ج.م</b>
        </div>
        <form action={createOnlineOrder} className="space-y-3">
          <input type="hidden" name="items_json" value={cartPayload} />
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <label className="block text-sm font-bold">
            الاسم
            <input className="field mt-1" name="customer_name" required minLength={2} maxLength={160} />
          </label>
          <label className="block text-sm font-bold">
            رقم الهاتف
            <input className="field mt-1" name="customer_phone" type="tel" dir="ltr" required maxLength={30} placeholder="01xxxxxxxxx" />
          </label>
          <label className="block text-sm font-bold">
            طريقة الاستلام
            <select className="field mt-1" name="delivery_method" value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as typeof deliveryMethod)}>
              <option value="delivery">توصيل للعنوان</option>
              <option value="pickup">استلام من الفرع</option>
            </select>
          </label>
          {deliveryMethod === "delivery" ? (
            <label className="block text-sm font-bold">
              عنوان التوصيل
              <textarea className="field mt-1" name="delivery_address" required minLength={5} maxLength={500} rows={2} />
            </label>
          ) : (
            <input type="hidden" name="delivery_address" value="" />
          )}
          <label className="block text-sm font-bold">
            ملاحظات (اختياري)
            <textarea className="field mt-1" name="customer_notes" rows={2} maxLength={500} />
          </label>
          <button className="btn btn-primary w-full" disabled={!cart.length}>إرسال طلب الشراء</button>
          <p className="muted text-[11px] leading-5">
            الطلب لا يُعد مدفوعًا أو نهائيًا حتى يتواصل المتجر معك ويؤكد التوفر والتوصيل. يتم حجز الكميات مؤقتًا لحين مراجعة الطلب.
          </p>
        </form>
      </aside>
    </div>
  );
}
