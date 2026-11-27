import Link from "next/link";
import { hasPermission, requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { cairoDayRange, cairoToday, isValidDay } from "@/lib/day-range";
import { PrintButton } from "./print-button";

const money = (v: number) => `${v.toFixed(2)} ج.م`;
const methodNames: Record<string, string> = { cash: "كاش", instapay: "InstaPay", visa: "فيزا" };

export default async function DailyReport({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { supabase, user, profile } = await requirePermission("reports.read");
  const q = await searchParams;
  const day = isValidDay(q.day) ? q.day : cairoToday();
  const { from, to } = cairoDayRange(day);
  const canReadExpenses = await hasPermission(supabase, profile.role, "expenses.read");

  const [sales, pays, exp] = await Promise.all([
    supabase
      .from("sales")
      .select("id,total,paid,due,discount_amount,status")
      .neq("status", "void")
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(5000),
    supabase
      .from("payments")
      .select("method,amount,sales!inner(status)")
      .neq("sales.status", "void")
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(10000),
    canReadExpenses
      ? supabase
          .from("expenses")
          .select("amount,payment_method")
          .gte("created_at", from)
          .lt("created_at", to)
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sales.error || pays.error || exp.error) {
    throw new Error(sales.error?.message || pays.error?.message || exp.error?.message);
  }

  const rows = sales.data || [];
  const sum = (k: "total" | "paid" | "due" | "discount_amount") =>
    rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  const byMethod: Record<string, number> = {};
  for (const p of pays.data || []) byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
  const expByMethod: Record<string, number> = {};
  for (const e of exp.data || [])
    expByMethod[e.payment_method] = (expByMethod[e.payment_method] || 0) + Number(e.amount);
  const expTotal = Object.values(expByMethod).reduce((a, b) => a + b, 0);
  const cashNet = (byMethod.cash || 0) - (expByMethod.cash || 0);

  const line = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between border-b border-dashed py-2 ${strong ? "font-black" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="no-print mb-5 flex flex-wrap items-end gap-3">
        <h2 className="text-2xl font-black">ملخص إغلاق اليوم (Z)</h2>
        <form className="flex items-end gap-2" method="get">
          <input className="field" type="date" name="day" defaultValue={day} />
          <button className="btn btn-gold">عرض</button>
        </form>
        <PrintButton />
        <Link className="btn" href="/reports">التقارير</Link>
      </div>
      <div id="bartika-z-print" className="panel mx-auto max-w-md p-5">
        <h3 className="mb-1 text-center text-lg font-black">بارتيكا جينز</h3>
        <p className="muted mb-3 text-center text-sm">إغلاق يوم {day}</p>
        {line("عدد الفواتير", String(rows.length))}
        {line("إجمالي المبيعات", money(sum("total")), true)}
        {line("إجمالي الخصومات", money(sum("discount_amount")))}
        {line("المدفوع", money(sum("paid")))}
        {line("المتبقي (آجل)", money(sum("due")))}
        <h4 className="mt-4 font-black">المقبوضات حسب الطريقة</h4>
        {Object.keys(methodNames).map((m) => line(methodNames[m], money(byMethod[m] || 0)))}
        {canReadExpenses && (
          <>
            <h4 className="mt-4 font-black">المصروفات</h4>
            {line("إجمالي المصروفات", money(expTotal))}
            {line("صافي الكاش (كاش - مصروف كاش)", money(cashNet), true)}
          </>
        )}
        <p className="muted mt-4 text-xs">
          اليوم بتوقيت القاهرة. الفواتير الملغاة غير محسوبة. للجرد الفعلي للدرج استخدم إغلاق الوردية من الخزينة.
        </p>
      </div>
    </Shell>
  );
}
