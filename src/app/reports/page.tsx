import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";

export default async function Reports() {
  const { supabase, user, profile } = await requirePermission("reports.read");
  const { data, error } = await supabase
    .from("sales")
    .select("id,invoice_number,total,discount_amount,created_at,status")
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const total = (data || []).reduce((sum, sale) => sum + Number(sale.total), 0);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <h2 className="mb-5 text-2xl font-black">تقارير المبيعات</h2>
      <div className="panel mb-5 p-5">
        <p className="muted">إجمالي الفواتير المعروضة</p>
        <b className="mt-2 block text-3xl text-emerald-950">
          {total.toLocaleString("ar-EG", { style: "currency", currency: "EGP" })}
        </b>
        <p className="muted mt-2 text-xs">
          آخر 100 فاتورة غير ملغاة. الأرباح لا تُعرض قبل استكمال التقارير المحاسبية وتكلفة البضاعة والمصروفات.
        </p>
      </div>
      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>الخصم</th>
              <th>الإجمالي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((sale) => (
              <tr key={sale.id}>
                <td>{sale.invoice_number}</td>
                <td>{new Date(sale.created_at).toLocaleString("ar-EG")}</td>
                <td>{Number(sale.discount_amount).toFixed(2)}</td>
                <td>{Number(sale.total).toFixed(2)} ج.م</td>
                <td>{sale.status === "void" ? "ملغاة" : "مكتملة"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
