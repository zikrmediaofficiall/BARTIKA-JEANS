import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { approveStocktake, setStocktakeCount } from "@/app/actions";

export default async function StocktakeDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, profile } = await requirePermission("stocktake.read");
  const isAdmin = profile.role === "admin";
  const [{ data: session, error: sessionError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from("stocktakes").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("stocktake_items")
        .select("id,variant_id,system_quantity,actual_quantity,reason,product_variants(barcode,size,color,products(name,sku))")
        .eq("stocktake_id", id),
    ]);

  if (sessionError || itemsError) {
    throw new Error(sessionError?.message || itemsError?.message);
  }
  if (!session) notFound();

  const variance = (items || []).reduce(
    (sum, item) =>
      sum + Math.abs(Number(item.actual_quantity) - Number(item.system_quantity)),
    0,
  );

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">جلسة الجرد</h2>
          <p className="muted mt-1">{session.id} · {session.status}</p>
        </div>
        {isAdmin && session.status !== "approved" ? (
          <form action={approveStocktake}>
            <input type="hidden" name="stocktake_id" value={id} />
            <button className="btn btn-gold">اعتماد الجرد وتحديث المخزون</button>
          </form>
        ) : null}
      </div>

      <div className="panel mb-4 p-4">
        <b>إجمالي فرق الوحدات المطلق: {variance}</b>
        <p className="muted mt-1 text-xs">
          {isAdmin
            ? "مراجعة الأعداد الفعلية قبل اعتماد التسوية."
            : "عرض فقط. تعديل العد واعتماد التسوية متاحان من حساب Admin."}
        </p>
      </div>

      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>باركود</th>
              <th>النظام</th>
              <th>الفعلي</th>
              {isAdmin ? <th>تحديث العدد</th> : null}
            </tr>
          </thead>
          <tbody>
            {(items || []).map((item) => (
              <tr key={item.id}>
                <td>
                  {item.product_variants?.products?.name} · {item.product_variants?.size || "—"} · {item.product_variants?.color || "—"}
                </td>
                <td>{item.product_variants?.barcode}</td>
                <td>{item.system_quantity}</td>
                <td className="font-bold">{item.actual_quantity}</td>
                {isAdmin ? (
                  <td>
                    {session.status !== "approved" ? (
                      <form action={setStocktakeCount} className="flex min-w-64 gap-2">
                        <input type="hidden" name="stocktake_id" value={id} />
                        <input type="hidden" name="variant_id" value={item.variant_id} />
                        <input
                          className="field w-24"
                          name="actual_quantity"
                          type="number"
                          min="0"
                          defaultValue={item.actual_quantity}
                        />
                        <input className="field w-28" name="reason" placeholder="سبب الفرق" />
                        <button className="btn btn-primary">حفظ</button>
                      </form>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
