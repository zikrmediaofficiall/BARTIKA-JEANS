import Link from "next/link";
import { requireUser, hasPermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { agingBucket } from "@/lib/ledger";

const fmt = (v: number) => v.toFixed(2);

export default async function Debts() {
  const { supabase, user, profile } = await requireUser();
  if (
    profile.role === "manager" &&
    !(await hasPermission(supabase, profile.role, "customers.read"))
  ) {
    return (
      <Shell user={user.email || ""} role={profile.role}>
        <p className="panel p-5">لا تملك صلاحية عرض ملفات العملاء.</p>
      </Shell>
    );
  }
  const { data, error } = await supabase
    .from("sales")
    .select("customer_id,due,created_at,customers(name,phone)")
    .eq("status", "completed")
    .gt("due", 0.009)
    .not("customer_id", "is", null)
    .limit(5000);
  if (error) throw new Error(error.message);

  const now = new Date();
  const map = new Map<
    string,
    { name: string; phone: string; due: number; oldest: string; b: Record<string, number> }
  >();
  for (const s of data || []) {
    const c = Array.isArray(s.customers) ? s.customers[0] : s.customers;
    const cur = map.get(s.customer_id as string) || {
      name: c?.name || "—",
      phone: c?.phone || "",
      due: 0,
      oldest: s.created_at,
      b: { "0-30": 0, "31-60": 0, "61+": 0 },
    };
    cur.due += Number(s.due);
    cur.b[agingBucket(s.created_at, now)] += Number(s.due);
    if (s.created_at < cur.oldest) cur.oldest = s.created_at;
    map.set(s.customer_id as string, cur);
  }
  const rows = [...map.entries()].sort((a, b) => b[1].due - a[1].due);
  const total = rows.reduce((a, [, r]) => a + r.due, 0);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-black">مديونيات العملاء</h2>
        <Link className="btn" href="/customers">ملفات العملاء</Link>
      </div>
      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>العميل</th>
              <th>الهاتف</th>
              <th>المتبقي</th>
              <th>0-30 يوم</th>
              <th>31-60 يوم</th>
              <th>أكثر من 60</th>
              <th>كشف</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, r]) => (
              <tr key={id}>
                <td><Link className="font-bold text-emerald-800 underline" href={`/customers/${id}`}>{r.name}</Link></td>
                <td dir="ltr">{r.phone}</td>
                <td className="font-bold text-amber-800">{fmt(r.due)}</td>
                <td>{fmt(r.b["0-30"])}</td>
                <td>{fmt(r.b["31-60"])}</td>
                <td className={r.b["61+"] > 0 ? "font-bold text-red-700" : ""}>{fmt(r.b["61+"])}</td>
                <td><Link className="underline" href={`/customers/${id}/statement`}>كشف حساب</Link></td>
              </tr>
            ))}
            {!rows.length ? (
              <tr><td colSpan={7} className="py-6 text-center muted">لا توجد مديونيات مفتوحة.</td></tr>
            ) : null}
          </tbody>
        </table>
        <p className="mt-3 font-black">إجمالي المديونيات: {fmt(total)} ج.م</p>
        <p className="muted mt-1 text-xs">العمر محسوب من تاريخ الفاتورة.</p>
      </div>
    </Shell>
  );
}
