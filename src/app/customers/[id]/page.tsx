import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { updateCustomerCreditLimit } from "@/app/actions";
import { CustomerCollectionForm } from "../customer-collection-form";

export default async function CustomerDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, profile } = await requireUser();

  if (
    profile.role === "manager" &&
    !(await hasPermission(supabase, profile.role, "customers.read"))
  ) {
    notFound();
  }

  const [{ data: customer, error: customerError }, { data: sales, error: salesError }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id,name,phone,email,address,notes,created_at,updated_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("sales")
        .select("id,invoice_number,total,paid,due,status,created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (customerError || salesError) {
    throw new Error(customerError?.message || salesError?.message);
  }
  if (!customer) notFound();

  const isAdmin = profile.role === "admin";
  const canCollect = isAdmin || profile.role === "seller";
  let creditLimit = 0;

  if (isAdmin) {
    const { data: account, error: accountError } = await supabase
      .from("customer_credit_accounts")
      .select("credit_limit,updated_at")
      .eq("customer_id", id)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    creditLimit = Number(account?.credit_limit || 0);
  }

  const rows = sales || [];
  const totalSales = rows.reduce((sum, sale) => sum + Number(sale.total), 0);
  const totalPaid = rows.reduce((sum, sale) => sum + Number(sale.paid), 0);
  const totalDue = rows.reduce((sum, sale) => sum + Number(sale.due), 0);
  const fmt = (value: number) =>
    new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <Link href="/customers" className="text-sm font-bold text-emerald-800 underline">
            العودة إلى العملاء
          </Link>
          <h2 className="mt-2 text-2xl font-black">{customer.name}</h2>
          <p className="muted mt-1 text-sm">ملف العميل وسجل التعاملات</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-900">
          {rows.length} فاتورة ظاهرة
        </span>
      </div>

      <section className="panel grid gap-3 p-5 sm:grid-cols-2">
        <div>
          <p className="muted text-xs">رقم الهاتف</p>
          <b dir="ltr">{customer.phone || "—"}</b>
        </div>
        <div>
          <p className="muted text-xs">البريد الإلكتروني</p>
          <b>{customer.email || "—"}</b>
        </div>
        <div>
          <p className="muted text-xs">العنوان</p>
          <b>{customer.address || "—"}</b>
        </div>
        <div>
          <p className="muted text-xs">تاريخ إنشاء الملف</p>
          <b>{new Date(customer.created_at).toLocaleDateString("ar-EG")}</b>
        </div>
        {isAdmin && customer.notes ? (
          <div className="sm:col-span-2">
            <p className="muted text-xs">ملاحظات داخلية</p>
            <p className="whitespace-pre-wrap">{customer.notes}</p>
          </div>
        ) : null}
      </section>

      <section className="my-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel p-4">
          <p className="muted text-xs">إجمالي قيمة الفواتير الظاهرة</p>
          <b className="mt-2 block text-xl">{fmt(totalSales)}</b>
        </div>
        <div className="panel p-4">
          <p className="muted text-xs">إجمالي المدفوع</p>
          <b className="mt-2 block text-xl">{fmt(totalPaid)}</b>
        </div>
        <div className="panel p-4">
          <p className="muted text-xs">إجمالي الرصيد المستحق الظاهر</p>
          <b className="mt-2 block text-xl">{fmt(totalDue)}</b>
        </div>
        {isAdmin ? (
          <div className="panel p-4">
            <p className="muted text-xs">حد الائتمان المعتمد</p>
            <b className="mt-2 block text-xl">{fmt(creditLimit)}</b>
            <p className="muted mt-1 text-xs">المتاح حاليًا: {fmt(Math.max(0, creditLimit - totalDue))}</p>
          </div>
        ) : null}
      </section>

      {isAdmin ? (
        <form action={updateCustomerCreditLimit} className="panel mb-5 flex flex-wrap items-end gap-3 p-5">
          <input type="hidden" name="customer_id" value={id} />
          <label className="min-w-56 flex-1 text-sm font-bold">
            تعديل حد الائتمان (ج.م)
            <input
              className="field mt-1"
              name="credit_limit"
              type="number"
              min={totalDue}
              max="100000000"
              step="0.01"
              defaultValue={creditLimit}
              required
            />
          </label>
          <button className="btn btn-primary">حفظ حد الائتمان</button>
          <p className="muted w-full text-xs">
            لا يمكن خفض الحد إلى أقل من الرصيد المستحق الحالي.
          </p>
        </form>
      ) : null}

      <section className="panel table-wrap p-4">
        <h3 className="mb-3 font-black">سجل الفواتير والتحصيل</h3>
        <table>
          <thead>
            <tr>
              <th>الفاتورة</th>
              <th>التاريخ</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((sale) => (
              <tr key={sale.id}>
                <td>
                  <Link className="font-bold text-emerald-800 underline" href={"/invoices/" + sale.id}>
                    #{sale.invoice_number}
                  </Link>
                </td>
                <td>{new Date(sale.created_at).toLocaleString("ar-EG")}</td>
                <td>{fmt(Number(sale.total))}</td>
                <td>{fmt(Number(sale.paid))}</td>
                <td className={Number(sale.due) > 0 ? "font-bold text-amber-800" : ""}>
                  {fmt(Number(sale.due))}
                </td>
                <td>{sale.status === "completed" ? "مكتملة" : "ملغاة"}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr><td colSpan={6} className="py-6 text-center muted">لا توجد فواتير ظاهرة لهذا العميل.</td></tr>
            ) : null}
          </tbody>
        </table>
        {canCollect ? (
          <div className="mt-5 space-y-4">
            <h4 className="font-black">تحصيل الأرصدة المستحقة</h4>
            {rows.filter((sale) => sale.status === "completed" && Number(sale.due) > 0.009).map((sale) => (
              <div key={sale.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>الفاتورة #{sale.invoice_number}</b>
                  <span className="text-sm font-bold text-amber-800">
                    المتبقي: {fmt(Number(sale.due))}
                  </span>
                </div>
                <CustomerCollectionForm saleId={sale.id} due={Number(sale.due)} />
              </div>
            ))}
            {!rows.some((sale) => sale.status === "completed" && Number(sale.due) > 0.009) ? (
              <p className="muted text-sm">لا توجد أرصدة مفتوحة قابلة للتحصيل ضمن الفواتير الظاهرة.</p>
            ) : null}
          </div>
        ) : (
          <p className="muted mt-4 text-xs">
            التحصيل متاح للأدمن والبائع صاحب الفاتورة. مدير المحل يقرأ البيانات وفق صلاحياته فقط.
          </p>
        )}
      </section>
    </Shell>
  );
}
