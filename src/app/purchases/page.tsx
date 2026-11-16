import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { addSupplier } from "@/app/actions";
import { PurchaseInvoiceForm } from "./purchase-invoice-form";
import { SupplierPaymentForm } from "./supplier-payment-form";

export default async function Purchases() {
  const { supabase, user, profile } = await requirePermission("purchases.read");
  const isAdmin = profile.role === "admin";
  const [
    { data: suppliers, error: suppliersError },
    { data: variants, error: variantsError },
    { data: invoices, error: invoicesError },
    { data: openSessions, error: sessionsError },
  ] = await Promise.all([
    supabase.from("suppliers").select("id,name,phone").order("name"),
    supabase
      .from("product_variants")
      .select("id,barcode,size,color,products(name,sku)")
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_invoices")
      .select("id,supplier_id,invoice_reference,subtotal,paid,due,status,created_at,suppliers(name)")
      .order("created_at", { ascending: false })
      .limit(50),
    isAdmin
      ? supabase
          .from("cash_sessions")
          .select("id,seller_id,opened_at")
          .eq("status", "open")
          .order("opened_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (suppliersError || variantsError || invoicesError || sessionsError) {
    throw new Error(
      suppliersError?.message ||
        variantsError?.message ||
        invoicesError?.message ||
        sessionsError?.message,
    );
  }

  const supplierOptions = (suppliers || []).map((supplier) => ({
    id: supplier.id,
    label: supplier.phone
      ? `${supplier.name} — ${supplier.phone}`
      : supplier.name,
  }));

  const variantOptions = (variants || []).map((variant) => {
    const product = Array.isArray(variant.products)
      ? variant.products[0]
      : variant.products;

    return {
      id: variant.id,
      label: [
        product?.name || "صنف",
        product?.sku || "—",
        variant.size || "بدون مقاس",
        variant.color || "بدون لون",
        variant.barcode || "بدون باركود",
      ].join(" · "),
    };
  });

  const tillOptions = (openSessions || []).map((session) => ({
    id: session.id,
    label: `بائع ${session.seller_id.slice(0, 8)} · ${new Date(session.opened_at).toLocaleTimeString("ar-EG")}`,
  }));

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5">
        <h2 className="text-2xl font-black">المشتريات والموردون</h2>
        <p className="muted mt-1 text-sm">
          استلام المخزون والفواتير، ثم تسجيل سداد المورد كحركة مستقلة في كشف الحساب.
        </p>
      </div>

      {isAdmin ? (
        <>
          <form
            action={addSupplier}
            className="panel mb-5 grid gap-3 p-5 sm:grid-cols-3"
          >
            <h3 className="font-black sm:col-span-3">إضافة مورد</h3>
            <input
              className="field"
              name="name"
              placeholder="اسم المورد"
              required
              minLength={2}
              maxLength={120}
            />
            <input
              className="field"
              name="phone"
              placeholder="رقم الهاتف"
              maxLength={30}
            />
            <button className="btn btn-primary">حفظ المورد</button>
          </form>

          <PurchaseInvoiceForm
            suppliers={supplierOptions}
            variants={variantOptions}
          />
        </>
      ) : (
        <p className="panel mb-5 p-4 text-sm text-slate-600">
          صلاحية قراءة فقط. إضافة الموردين واستلام المشتريات وسداد المورد متاح من حساب Admin.
        </p>
      )}

      <div className="panel table-wrap p-4">
        <h3 className="mb-3 font-black">آخر فواتير الشراء وكشوف الموردين</h3>
        <table>
          <thead>
            <tr>
              <th>المورد</th>
              <th>المرجع</th>
              <th>التاريخ</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
              {isAdmin ? <th>تسجيل سداد</th> : null}
            </tr>
          </thead>
          <tbody>
            {(invoices || []).map((invoice) => {
              const supplier = Array.isArray(invoice.suppliers)
                ? invoice.suppliers[0]
                : invoice.suppliers;
              return (
                <tr key={invoice.id}>
                  <td>
                    <Link
                      className="font-bold text-emerald-800 underline"
                      href={"/suppliers/" + invoice.supplier_id}
                    >
                      {supplier?.name || "مورد"}
                    </Link>
                  </td>
                  <td>{invoice.invoice_reference || invoice.id.slice(0, 8)}</td>
                  <td>{new Date(invoice.created_at).toLocaleDateString("ar-EG")}</td>
                  <td>{Number(invoice.subtotal).toFixed(2)} ج.م</td>
                  <td>{Number(invoice.paid).toFixed(2)} ج.م</td>
                  <td className={Number(invoice.due) > 0 ? "font-bold text-amber-800" : ""}>
                    {Number(invoice.due).toFixed(2)} ج.م
                  </td>
                  <td>{invoice.status}</td>
                  {isAdmin ? (
                    <td>
                      {Number(invoice.due) > 0.009 ? (
                        <SupplierPaymentForm
                          invoiceId={invoice.id}
                          due={Number(invoice.due)}
                          tills={tillOptions}
                        />
                      ) : (
                        <span className="text-xs text-emerald-800">مسددة بالكامل</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!invoices?.length ? (
              <tr><td colSpan={isAdmin ? 8 : 7} className="py-6 text-center muted">لا توجد فواتير شراء حتى الآن.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
