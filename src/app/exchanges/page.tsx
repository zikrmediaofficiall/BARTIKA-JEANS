import { redirect } from "next/navigation";
import { getSessionContext, hasPermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { ExchangeForm } from "./exchange-form";

type SearchParams = { invoice?: string; success?: string };

export default async function Exchanges({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { supabase, user, profile } = await getSessionContext();
  if (!user || !profile || !profile.is_active) redirect("/login");

  const canExecute = profile.role === "admin" || profile.role === "seller";
  const canRead =
    canExecute ||
    (await hasPermission(supabase, profile.role, "exchanges.read"));

  if (!canRead) redirect("/");

  const query = await searchParams;
  const invoiceInput = (query.invoice || "").trim();
  const invoiceNumber = /^\d+$/.test(invoiceInput) ? Number(invoiceInput) : null;

  const exchangeQuery = supabase
    .from("exchanges")
    .select("id,original_sale_id,reason,status,price_difference,created_at,created_by")
    .order("created_at", { ascending: false })
    .limit(50);
  const { data: exchanges, error: exchangesError } = canExecute && profile.role !== "admin"
    ? await exchangeQuery.eq("created_by", user.id)
    : await exchangeQuery;

  if (exchangesError) throw new Error(exchangesError.message);

  let sale: {
    id: string;
    invoice_number: number;
    total: number;
    paid: number;
    due: number;
    status: string;
    created_at: string;
  } | null = null;
  let saleItems: {
    id: string;
    variant_id: string;
    product_name_snapshot: string;
    barcode_snapshot: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    discount_amount: number;
  }[] = [];
  let variants: {
    id: string;
    label: string;
    price: number;
    stock: number;
  }[] = [];
  let usedQuantities = new Map<string, number>();
  let searchError = "";

  if (invoiceInput && invoiceNumber !== null && Number.isSafeInteger(invoiceNumber) && invoiceNumber > 0) {
    const { data: foundSale, error: saleError } = await supabase
      .from("sales")
      .select("id,invoice_number,total,paid,due,status,created_at")
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();

    if (saleError) throw new Error(saleError.message);
    sale = foundSale;

    if (!sale) {
      searchError = "لم يتم العثور على الفاتورة، أو لا تملك صلاحية الوصول إليها.";
    } else if (sale.status !== "completed") {
      searchError = "لا يمكن الاستبدال من فاتورة ملغاة.";
    } else if (sale.due > 0.01) {
      searchError = "الفاتورة عليها مبلغ متبقٍ. يجب تسوية باقي الفاتورة قبل الاستبدال في الإصدار الحالي.";
    } else {
      const [
        { data: items, error: itemsError },
        { data: previousItems, error: previousError },
        { data: variantRows, error: variantsError },
      ] = await Promise.all([
        supabase
          .from("sale_items")
          .select("id,variant_id,product_name_snapshot,barcode_snapshot,quantity,unit_price,line_total,discount_amount")
          .eq("sale_id", sale.id)
          .order("id"),
        supabase
          .from("exchange_items")
          .select("original_sale_item_id,quantity,exchanges!inner(original_sale_id,status)")
          .eq("exchanges.original_sale_id", sale.id)
          .eq("exchanges.status", "completed"),
        supabase
          .from("product_variants")
          .select("id,barcode,size,color,products!inner(name,sku,sale_price,is_active),inventory(quantity)")
          .order("barcode")
          .limit(500),
      ]);

      if (itemsError || previousError || variantsError) {
        throw new Error(
          itemsError?.message || previousError?.message || variantsError?.message,
        );
      }

      saleItems = items || [];
      usedQuantities = new Map<string, number>();
      for (const previous of previousItems || []) {
        if (!previous.original_sale_item_id) continue;
        usedQuantities.set(
          previous.original_sale_item_id,
          (usedQuantities.get(previous.original_sale_item_id) || 0) + previous.quantity,
        );
      }

      const eligibleItems = saleItems
        .map((item) => ({
          id: item.id,
          label: `${item.product_name_snapshot} · ${item.barcode_snapshot}`,
          remaining: Math.max(
            0,
            item.quantity - (usedQuantities.get(item.id) || 0),
          ),
          netUnitPrice: Number(
            (Number(item.line_total) - Number(item.discount_amount)) / item.quantity,
          ),
        }))
        .filter((item) => item.remaining > 0);

      saleItems = eligibleItems as typeof saleItems;

      variants = (variantRows || []).map((variant) => {
        const product = Array.isArray(variant.products)
          ? variant.products[0]
          : variant.products;
        const inventory = Array.isArray(variant.inventory)
          ? variant.inventory[0]
          : variant.inventory;
        return {
          id: variant.id,
          label: [
            product?.name || "صنف",
            product?.sku || "—",
            variant.size || "بدون مقاس",
            variant.color || "بدون لون",
            variant.barcode,
          ].join(" · "),
          price: Number(product?.sale_price || 0),
          stock: Number(inventory?.quantity || 0),
        };
      }).filter((variant) => variant.stock > 0 && variant.price > 0);

      if (!saleItems.length) {
        searchError = "لا توجد كميات متبقية قابلة للاستبدال في هذه الفاتورة.";
      }
    }
  } else if (invoiceInput) {
    searchError = "أدخل رقم فاتورة صحيحًا.";
  }

  const numberBySale = new Map<string, number>();
  if ((exchanges || []).length) {
    const saleIds = [...new Set((exchanges || []).map((item) => item.original_sale_id))];
    const { data: originalSales, error: originalSalesError } = await supabase
      .from("sales")
      .select("id,invoice_number")
      .in("id", saleIds);
    if (originalSalesError) throw new Error(originalSalesError.message);
    for (const originalSale of originalSales || []) {
      numberBySale.set(originalSale.id, originalSale.invoice_number);
    }
  }

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5">
        <h2 className="text-2xl font-black">الاستبدال والمرتجعات</h2>
        <p className="muted mt-1 text-sm">
          كل عملية مرتبطة بفاتورتها الأصلية، وتُسجل حركات المخزون وفرق السعر والتسوية.
        </p>
      </div>

      {query.success === "1" ? (
        <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          تم اعتماد عملية الاستبدال وتسجيل حركة المخزون والتسوية.
        </p>
      ) : null}

      {canExecute ? (
        <form method="get" action="/exchanges" className="panel mb-5 flex flex-wrap items-end gap-3 p-5">
          <label className="min-w-52 flex-1 text-sm font-bold">
            رقم الفاتورة الأصلية
            <input
              className="field mt-1"
              name="invoice"
              type="number"
              min="1"
              step="1"
              defaultValue={invoiceInput}
              placeholder="ابحث برقم الفاتورة"
              required
            />
          </label>
          <button className="btn btn-primary">عرض الفاتورة</button>
        </form>
      ) : (
        <p className="panel mb-5 p-4 text-sm text-slate-600">
          هذه صلاحية قراءة فقط. تنفيذ الاستبدال متاح للأدمن والبائعين.
        </p>
      )}

      {searchError ? (
        <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          {searchError}
        </p>
      ) : null}

      {sale && canExecute && !searchError ? (
        <div className="mb-5 space-y-4">
          <section className="panel grid gap-3 p-5 sm:grid-cols-3">
            <div>
              <p className="muted text-xs">الفاتورة</p>
              <b className="text-lg">#{sale.invoice_number}</b>
            </div>
            <div>
              <p className="muted text-xs">الإجمالي</p>
              <b>{Number(sale.total).toFixed(2)} ج.م</b>
            </div>
            <div>
              <p className="muted text-xs">المدفوع</p>
              <b>{Number(sale.paid).toFixed(2)} ج.م</b>
            </div>
            <p className="muted text-xs sm:col-span-3">
              تاريخ البيع: {new Date(sale.created_at).toLocaleString("ar-EG")}
            </p>
          </section>
          <ExchangeForm
            saleId={sale.id}
            invoiceNumber={sale.invoice_number}
            saleItems={saleItems}
            variants={variants}
          />
        </div>
      ) : null}

      <div className="panel table-wrap p-4">
        <h3 className="mb-3 font-black">سجل عمليات الاستبدال والمرتجعات</h3>
        <table>
          <thead>
            <tr>
              <th>رقم العملية</th>
              <th>الفاتورة الأصلية</th>
              <th>التاريخ</th>
              <th>السبب</th>
              <th>فرق السعر</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(exchanges || []).map((exchange) => (
              <tr key={exchange.id}>
                <td>{exchange.id.slice(0, 8)}</td>
                <td>#{numberBySale.get(exchange.original_sale_id) || "—"}</td>
                <td>{new Date(exchange.created_at).toLocaleString("ar-EG")}</td>
                <td>{exchange.reason}</td>
                <td>{Number(exchange.price_difference).toFixed(2)} ج.م</td>
                <td>{exchange.status === "completed" ? "مكتملة" : exchange.status}</td>
              </tr>
            ))}
            {!exchanges?.length ? (
              <tr><td colSpan={6} className="py-6 text-center muted">لا توجد عمليات استبدال مسجلة.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
