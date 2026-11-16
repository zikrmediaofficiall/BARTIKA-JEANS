import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { setOnlineOrderStatus } from "@/app/actions";

export default async function OnlineOrders() {
  const { supabase, user, profile } = await requireAdmin();
  const { data: orders, error } = await supabase
    .from("online_orders")
    .select("id,order_number,customer_name,customer_phone,delivery_method,delivery_address,customer_notes,status,subtotal,created_at,online_order_items(id,product_name_snapshot,size_snapshot,color_snapshot,quantity,unit_price,line_total)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const money = (value: number) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5">
        <h2 className="text-2xl font-black">طلبات المتجر الإلكتروني</h2>
        <p className="muted mt-1 text-sm">مراجعة الطلبات والحجز المؤقت للمخزون وتأكيدها أو إلغاؤها أو تسجيل التسليم.</p>
      </div>
      <div className="space-y-4">
        {(orders || []).map((order) => (
          <article key={order.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">طلب #{order.order_number}</h3>
                <p className="muted mt-1 text-xs">{new Date(order.created_at).toLocaleString("ar-EG")}</p>
              </div>
              <span className={"rounded-full px-3 py-2 text-xs font-bold " + (
                order.status === "pending" ? "bg-amber-100 text-amber-900" :
                order.status === "confirmed" ? "bg-blue-100 text-blue-900" :
                order.status === "fulfilled" ? "bg-emerald-100 text-emerald-900" :
                "bg-slate-100 text-slate-700"
              )}>
                {order.status === "pending" ? "بانتظار المراجعة" :
                 order.status === "confirmed" ? "تم التأكيد" :
                 order.status === "fulfilled" ? "تم التسليم" : "ملغي"}
              </span>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="muted">العميل: </span><b>{order.customer_name}</b></div>
              <div><span className="muted">الهاتف: </span><b dir="ltr">{order.customer_phone}</b></div>
              <div><span className="muted">الاستلام: </span><b>{order.delivery_method === "delivery" ? "توصيل" : "استلام من الفرع"}</b></div>
              {order.delivery_method === "delivery" ? <div><span className="muted">العنوان: </span><b>{order.delivery_address}</b></div> : null}
              {order.customer_notes ? <div className="sm:col-span-2"><span className="muted">ملاحظات: </span>{order.customer_notes}</div> : null}
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
              <table>
                <thead><tr><th>الصنف</th><th>المقاس / اللون</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>
                  {(order.online_order_items || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.product_name_snapshot}</td>
                      <td>{item.size_snapshot || "—"} / {item.color_snapshot || "—"}</td>
                      <td>{item.quantity}</td>
                      <td>{money(Number(item.unit_price))}</td>
                      <td>{money(Number(item.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <b className="text-lg">الإجمالي: {money(Number(order.subtotal))}</b>
              <div className="flex flex-wrap gap-2">
                {order.status === "pending" ? (
                  <form action={setOnlineOrderStatus}>
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="status" value="confirmed" />
                    <button className="btn btn-primary">تأكيد الطلب</button>
                  </form>
                ) : null}
                {order.status === "confirmed" ? (
                  <form action={setOnlineOrderStatus}>
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="status" value="fulfilled" />
                    <button className="btn btn-primary">تسجيل التسليم وخصم المخزون</button>
                  </form>
                ) : null}
                {order.status === "pending" || order.status === "confirmed" ? (
                  <form action={setOnlineOrderStatus}>
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <button className="btn border border-red-200 text-red-700">إلغاء الطلب وإرجاع الحجز</button>
                  </form>
                ) : null}
              </div>
            </div>
          </article>
        ))}
        {!orders?.length ? <div className="panel p-8 text-center muted">لا توجد طلبات إلكترونية حتى الآن.</div> : null}
      </div>
    </Shell>
  );
}
