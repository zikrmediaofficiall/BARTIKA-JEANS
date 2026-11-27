import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";

type ReportJson = {
  sales_count?: number;
  sales_total?: number;
  paid_total?: number;
  due_total?: number;
  discount_total?: number;
  is_admin?: boolean;
  cogs_complete?: boolean | null;
  cost_snapshot_missing_items?: number | null;
  cogs_total?: number | null;
  gross_profit?: number | null;
  expenses_total?: number | null;
  net_profit?: number | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(value);

function metric(title: string, value: number, note?: string) {
  return (
    <div className="panel p-5">
      <p className="muted text-sm">{title}</p>
      <b className="mt-3 block text-2xl font-black text-emerald-950">
        {money(value)}
      </b>
      {note ? <p className="muted mt-2 text-xs">{note}</p> : null}
    </div>
  );
}

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { supabase, user, profile } = await requirePermission("reports.read");
  const query = await searchParams;
  const days = query.days === "7" || query.days === "90" ? Number(query.days) : 30;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [{ data: reportData, error: reportError }, { data: sales, error: salesError }] =
    await Promise.all([
      supabase.rpc("get_financial_report", {
        p_from: from.toISOString(),
        p_to: now.toISOString(),
      }),
      supabase
        .from("sales")
        .select("id,invoice_number,total,paid,due,discount_amount,created_at,status")
        .neq("status", "void")
        .gte("created_at", from.toISOString())
        .lt("created_at", now.toISOString())
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (reportError || salesError) {
    throw new Error(reportError?.message || salesError?.message || "تعذر تحميل التقرير");
  }

  const raw = reportData as ReportJson | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("استجابة التقرير المالي غير صالحة");
  }

  const salesCount = Number(raw.sales_count || 0);
  const salesTotal = Number(raw.sales_total || 0);
  const paidTotal = Number(raw.paid_total || 0);
  const dueTotal = Number(raw.due_total || 0);
  const discountTotal = Number(raw.discount_total || 0);
  const canSeeProfit = profile.role === "admin" && raw.is_admin === true;
  const canShowProfit = canSeeProfit && raw.cogs_complete === true;
  const missingCostSnapshots = Number(raw.cost_snapshot_missing_items || 0);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">التقارير المالية</h2>
          <p className="muted mt-1 text-sm">
            الفترة من {from.toLocaleDateString("ar-EG")} إلى {now.toLocaleDateString("ar-EG")}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="فترة التقرير">
          <Link className="btn btn-gold" href="/reports/daily">إغلاق اليوم (Z)</Link>
          {[7, 30, 90].map((period) => (
            <a
              key={period}
              href={`/reports?days=${period}`}
              aria-current={days === period ? "page" : undefined}
              className={days === period ? "btn btn-primary" : "btn border border-slate-200 bg-white text-slate-700"}
            >
              {period === 7 ? "7 أيام" : period === 30 ? "30 يومًا" : "90 يومًا"}
            </a>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel p-5">
          <p className="muted text-sm">عدد الفواتير المكتملة</p>
          <b className="mt-3 block text-2xl font-black text-emerald-950">
            {salesCount.toLocaleString("ar-EG")}
          </b>
        </div>
        {metric("إجمالي المبيعات بعد الخصم", salesTotal)}
        {metric("المبالغ المحصلة", paidTotal)}
        {metric("المتبقي على العملاء", dueTotal)}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {metric("إجمالي الخصومات", discountTotal)}
        {canSeeProfit ? (
          <>
            {canShowProfit ? (
              <>
                {metric("تكلفة البضاعة المباعة", Number(raw.cogs_total || 0))}
                {metric("مجمل الربح", Number(raw.gross_profit || 0))}
              </>
            ) : (
              <div className="panel p-5 sm:col-span-2">
                <p className="font-bold text-amber-900">لا يمكن اعتماد الربح لهذه الفترة بعد</p>
                <p className="muted mt-2 text-sm">
                  توجد {missingCostSnapshots.toLocaleString("ar-EG")} بنود بيع بدون لقطة تكلفة تاريخية. تم إخفاء مجمل الربح وصافي التشغيل حتى تكتمل بيانات التكلفة بدل احتسابها بصفر.
                </p>
              </div>
            )}
            {metric("المصروفات المسجلة", Number(raw.expenses_total || 0))}
            {canShowProfit
              ? metric("صافي تشغيلي تقديري", Number(raw.net_profit || 0), "المبيعات بعد الخصم − تكلفة البضاعة − المصروفات المسجلة. لا يشمل التزامات أو ضرائب غير مدخلة.")
              : null}
          </>
        ) : (
          <div className="panel p-5 sm:col-span-1">
            <p className="font-bold text-emerald-950">بيانات الربحية محمية</p>
            <p className="muted mt-2 text-sm">
              يظهر لك ملخص المبيعات والتحصيل والمتبقي فقط. تكلفة البضاعة والمصروفات والربح متاحة لحساب Admin فقط.
            </p>
          </div>
        )}
      </div>

      <div className="panel table-wrap mt-6 p-4">
        <h3 className="mb-3 font-black">الفواتير خلال الفترة</h3>
        <table>
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>الخصم</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(sales || []).map((sale) => (
              <tr key={sale.id}>
                <td>{sale.invoice_number}</td>
                <td>{new Date(sale.created_at).toLocaleString("ar-EG")}</td>
                <td>{money(Number(sale.discount_amount))}</td>
                <td>{money(Number(sale.total))}</td>
                <td>{money(Number(sale.paid))}</td>
                <td>{money(Number(sale.due))}</td>
                <td>{sale.status === "void" ? "ملغاة" : "مكتملة"}</td>
              </tr>
            ))}
            {!sales?.length ? (
              <tr><td colSpan={7} className="py-6 text-center muted">لا توجد فواتير خلال هذه الفترة.</td></tr>
            ) : null}
          </tbody>
        </table>
        <p className="muted mt-3 text-xs">
          يعرض الجدول آخر 50 فاتورة فقط؛ مؤشرات الإجماليات محسوبة من قاعدة البيانات على كامل الفترة المحددة.
        </p>
      </div>
    </Shell>
  );
}
