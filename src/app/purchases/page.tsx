import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { addSupplier, receivePurchase } from "@/app/actions";

export default async function Purchases() {
  const { supabase, user, profile } = await requirePermission("purchases.read");
  const isAdmin = profile.role === "admin";
  const [{ data: suppliers, error: suppliersError }, { data: variants, error: variantsError }, { data: invoices, error: invoicesError }] =
    await Promise.all([
      supabase.from("suppliers").select("id,name,phone").order("name"),
      supabase
        .from("product_variants")
        .select("id,barcode,size,color,products(name,sku)")
        .order("created_at", { ascending: false }),
      supabase
        .from("purchase_invoices")
        .select("id,invoice_reference,subtotal,paid,due,status,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (suppliersError || variantsError || invoicesError) {
    throw new Error(
      suppliersError?.message || variantsError?.message || invoicesError?.message,
    );
  }

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <h2 className="mb-5 text-2xl font-black">المشتريات والموردون</h2>

      {isAdmin ? (
        <>
          <form action={addSupplier} className="panel mb-5 grid gap-3 p-5 sm:grid-cols-3">
            <h3 className="font-black sm:col-span-3">إضافة مورد</h3>
            <input className="field" name="name" placeholder="اسم المورد" required />
            <input className="field" name="phone" placeholder="رقم الهاتف" />
            <button className="btn btn-primary">حفظ المورد</button>
          </form>

          <form action={receivePurchase} className="panel mb-5 grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            <h3 className="font-black sm:col-span-2 xl:col-span-3">
              استلام فاتورة شراء (متغير واحد لكل عملية حاليًا)
            </h3>
            <select className="field" name="supplier_id" required defaultValue="">
              <option value="" disabled>اختر المورد</option>
              {(suppliers || []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} — {supplier.phone || "بدون هاتف"}
                </option>
              ))}
            </select>
            <input className="field" name="reference" placeholder="رقم فاتورة المورد" />
            <select
              className="field sm:col-span-2 xl:col-span-3"
              name="variant_id"
              required
              defaultValue=""
            >
              <option value="" disabled>اختر الصنف والمقاس واللون</option>
              {(variants || []).map((variant) => {
                const product = Array.isArray(variant.products)
                  ? variant.products[0]
                  : variant.products;

                return (
                  <option key={variant.id} value={variant.id}>
                    {product?.name || "صنف"} · {product?.sku || "—"} · {variant.size || "—"} · {variant.color || "—"} · {variant.barcode}
                  </option>
                );
              })}
            </select>
            <input className="field" name="quantity" type="number" min="1" step="1" placeholder="الكمية" required />
            <input className="field" name="unit_cost" type="number" min="0" step="0.01" placeholder="تكلفة القطعة" required />
            <input className="field" name="paid" type="number" min="0" step="0.01" placeholder="المدفوع للمورد" defaultValue="0" />
            <button className="btn btn-gold">تسجيل الاستلام وتحديث المخزون</button>
          </form>
        </>
      ) : (
        <p className="panel mb-5 p-4 text-sm text-slate-600">
          صلاحية قراءة فقط. إضافة الموردين واستلام المشتريات متاحان من حساب Admin.
        </p>
      )}

      <div className="panel table-wrap p-4">
        <h3 className="mb-3 font-black">فواتير الشراء</h3>
        <table>
          <thead>
            <tr>
              <th>المرجع</th>
              <th>التاريخ</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(invoices || []).map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.invoice_reference || invoice.id.slice(0, 8)}</td>
                <td>{new Date(invoice.created_at).toLocaleDateString("ar-EG")}</td>
                <td>{Number(invoice.subtotal).toFixed(2)}</td>
                <td>{Number(invoice.paid).toFixed(2)}</td>
                <td>{Number(invoice.due).toFixed(2)}</td>
                <td>{invoice.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
