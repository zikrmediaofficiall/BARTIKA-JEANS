import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { buildLedger } from "@/lib/ledger";
import { PrintButton } from "@/app/reports/daily/print-button";

const methodNames: Record<string, string> = { cash: "كاش", instapay: "InstaPay", visa: "فيزا" };
const fmt = (v: number) => v.toFixed(2);

export default async function Statement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireUser();
  if (
    profile.role === "manager" &&
    !(await hasPermission(supabase, profile.role, "customers.read"))
  ) {
    notFound();
  }

  const [cust, sales] = await Promise.all([
    supabase.from("customers").select("id,name,phone").eq("id", id).maybeSingle(),
    supabase
      .from("sales")
      .select("id,invoice_number,total,due,created_at")
      .eq("customer_id", id)
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (cust.error || sales.error) throw new Error(cust.error?.message || sales.error?.message);
  if (!cust.data) notFound();

  const saleRows = sales.data || [];
  const ids = saleRows.map((s) => s.id);
  const pays = ids.length
    ? await supabase
        .from("payments")
        .select("sale_id,method,amount,created_at")
        .in("sale_id", ids)
        .limit(5000)
    : { data: [], error: null };
  if (pays.error) throw new Error(pays.error.message);

  const entries = buildLedger(saleRows, pays.data || [], methodNames);
  const balance = entries.length ? entries[entries.length - 1].balance : 0;
  const dueSum = saleRows.reduce((a, s) => a + Number(s.due), 0);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href={`/customers/${id}`} className="text-sm font-bold text-emerald-800 underline">
          ملف العميل
        </Link>
        <PrintButton target="statement" />
      </div>
      <div id="bartika-statement-print" className="panel p-5">
        <h2 className="text-xl font-black">كشف حساب: {cust.data.name}</h2>
        <p className="muted mb-3 text-sm" dir="ltr">{cust.data.phone || ""}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>البيان</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.date).toLocaleDateString("ar-EG")}</td>
                  <td>{e.label}</td>
                  <td>{e.debit ? fmt(e.debit) : ""}</td>
                  <td>{e.credit ? fmt(e.credit) : ""}</td>
                  <td className="font-bold">{fmt(e.balance)}</td>
                </tr>
              ))}
              {!entries.length ? (
                <tr><td colSpan={5} className="py-6 text-center muted">لا توجد حركات.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-4 font-black">الرصيد المستحق: {fmt(balance)} ج.م</p>
        {Math.abs(balance - dueSum) > 0.01 ? (
          <p className="mt-2 text-xs text-amber-800">
            تنبيه: رصيد الكشف ({fmt(balance)}) يختلف عن مجموع المتبقي في الفواتير ({fmt(dueSum)}). راجع الفواتير.
          </p>
        ) : null}
      </div>
    </Shell>
  );
}
