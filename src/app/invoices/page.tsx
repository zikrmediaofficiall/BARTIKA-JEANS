import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";

export default async function Invoices() {
  const { supabase, user, profile } = await requireUser();
  const { data, error } = await supabase
    .from("sales")
    .select("id,invoice_number,total,paid,due,status,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error("تعذر تحميل الفواتير: " + error.message);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <h2 className="mb-5 text-2xl font-black">الفواتير</h2>
      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>رقم</th>
              <th>التاريخ</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <Link className="font-bold text-emerald-800 underline" href={"/invoices/" + invoice.id}>
                    {invoice.invoice_number}
                  </Link>
                </td>
                <td>{new Date(invoice.created_at).toLocaleString("ar-EG")}</td>
                <td>{Number(invoice.total).toFixed(2)}</td>
                <td>{Number(invoice.paid).toFixed(2)}</td>
                <td>{Number(invoice.due).toFixed(2)}</td>
                <td>{invoice.status}</td>
              </tr>
            ))}
            {!data?.length ? (
              <tr>
                <td colSpan={6} className="py-6 text-center muted">لا توجد فواتير حتى الآن.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
