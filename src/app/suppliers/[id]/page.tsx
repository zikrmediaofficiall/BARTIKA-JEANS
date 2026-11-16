import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { SupplierPaymentForm } from "@/app/purchases/supplier-payment-form";

export default async function SupplierStatement({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, profile } = await requireAdmin();

  const [
    { data: supplier, error: supplierError },
    { data: invoices, error: invoicesError },
    { data: payments, error: paymentsError },
    { data: openSessions, error: sessionsError },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id,name,phone,address,created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("purchase_invoices")
      .select("id,invoice_reference,subtotal,paid,due,status,created_at")
      .eq("supplier_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("supplier_payments")
      .select("id,purchase_invoice_id,amount,payment_method,reference,cash_session_id,created_at")
      .eq("supplier_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("cash_sessions")
      .select("id,seller_id,opened_at")
      .eq("status", "open")
      .order("opened_at", { ascending: false }),
  ]);

  if (supplierError || invoicesError || paymentsError || sessionsError) {
    throw new Error(
      supplierError?.message ||
        invoicesError?.message ||
        paymentsError?.message ||
        sessionsError?.message,
    );
  }
  if (!supplier) notFound();

  const invoiceRows = invoices || [];
  const paymentRows = payments || [];
  const totalInvoices = invoiceRows.reduce((sum, item) => sum + Number(item.subtotal), 0);
  const totalPaid = invoiceRows.reduce((sum, item) => sum + Number(item.paid), 0);
  const totalDue = invoiceRows.reduce((sum, item) => sum + Number(item.due), 0);
  const totalPaymentsLedger = paymentRows.reduce((sum, item) => sum + Number(item.amount), 0);

  const tills = (openSessions || []).map((session) => ({
    id: session.id,
    label: `بائع ${session.seller_id.slice(0, 8)} · ${new Date(session.opened_at).toLocaleTimeString("ar-EG")}`,
  }));

  const money = (amount: number) =>
    new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 2,
    }).format(amount);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5">
        <Link href="/purchases" className="text-sm font-bold text-emerald-800 underline">
          العودة إلى المشتريات
        </Link>
        <h2 className="mt-2 text-2xl font-black">كشف حساب المورد: {supplier.name}</h2>
        <p className="muted mt-1 text-sm">
          {supplier.phone || "بدون هاتف"} · {supplier.address || "بدون عنوان"}
        </p>
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel p-4">
          <p className="muted text-xs">إجمالي الفواتير المستلمة</p>
          <b className="mt-2 block text-xl">{money(totalInvoices)}</b>
        </div>
        <div className="panel p-4">
          <p className="muted text-xs">إجمالي المسدد على الفواتير</p>
          <b className="mt-2 block text-xl">{money(totalPaid)}</b>
        </div>
        <div className="panel p-4">
          <p className="muted text-xs">الرصيد المستحق للمورد</p>
          <b className="mt-2 block text-xl text-amber-800">{money(totalDue)}</b>
        </div>
        <div className="panel p-4">
          <p className="muted text-xs">حركات السداد المسجلة بالدفتر</p>
          <b className="mt-2 block text-xl">{money(totalPaymentsLedger)}</b>
          <p className="muted mt-1 text-[11px]">لا يشمل أي مدفوع قديم لم يكن له سجل حركة قبل تفعيل دفتر السداد.</p>
        </div>
      </section>

      <section className="panel table-wrap mb-5 p-4">
        <h3 className="mb-3 font-black">فواتير المورد</h3>
        <table>
          <thead>
            <tr>
              <th>المرجع</th>
              <th>التاريخ</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {invoiceRows.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.invoice_reference || invoice.id.slice(0, 8)}</td>
                <td>{new Date(invoice.created_at).toLocaleDateString("ar-EG")}</td>
                <td>{money(Number(invoice.subtotal))}</td>
                <td>{money(Number(invoice.paid))}</td>
                <td>{money(Number(invoice.due))}</td>
                <td>{invoice.status}</td>
                <td>
                  {Number(invoice.due) > 0.009 ? (
                    <SupplierPaymentForm
                      invoiceId={invoice.id}
                      due={Number(invoice.due)}
                      tills={tills}
                    />
                  ) : (
                    <span className="text-xs text-emerald-800">مسددة بالكامل</span>
                  )}
                </td>
              </tr>
            ))}
            {!invoiceRows.length ? (
              <tr><td colSpan={7} className="py-6 text-center muted">لا توجد فواتير لهذا المورد.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel table-wrap p-4">
        <h3 className="mb-3 font-black">سجل حركات السداد</h3>
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>فاتورة الشراء</th>
              <th>المبلغ</th>
              <th>وسيلة الدفع</th>
              <th>المرجع</th>
              <th>درج النقدية</th>
            </tr>
          </thead>
          <tbody>
            {paymentRows.map((payment) => (
              <tr key={payment.id}>
                <td>{new Date(payment.created_at).toLocaleString("ar-EG")}</td>
                <td>{payment.purchase_invoice_id.slice(0, 8)}</td>
                <td>{money(Number(payment.amount))}</td>
                <td>{payment.payment_method}</td>
                <td>{payment.reference || "—"}</td>
                <td>{payment.cash_session_id ? payment.cash_session_id.slice(0, 8) : "الخزينة المركزية"}</td>
              </tr>
            ))}
            {!paymentRows.length ? (
              <tr><td colSpan={6} className="py-6 text-center muted">لا توجد حركات سداد مسجلة.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </Shell>
  );
}
