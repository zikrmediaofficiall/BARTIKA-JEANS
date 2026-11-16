import Link from "next/link";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { setOnlineOrderStatus, recordOnlineOrderPayment, recordOnlineOrderRefund } from "@/app/actions";

export default async function OnlineOrders() {
  const { supabase, user, profile } = await requireAdmin();
  const [
    { data: orders, error },
    { data: openSessions, error: sessionsError },
  ] = await Promise.all([
    supabase
      .from("online_orders")
      .select("id,order_number,customer_name,customer_phone,delivery_method,delivery_address,customer_notes,status,subtotal,paid,due,payment_status,created_at,online_order_items(id,product_name_snapshot,size_snapshot,color_snapshot,quantity,unit_price,line_total)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("cash_sessions")
      .select("id,seller_id,opened_at")
      .eq("status", "open")
      .order("opened_at", { ascending: false }),
  ]);
  if (error || sessionsError) throw new Error(error?.message || sessionsError?.message);

  const orderIds = (orders || []).map((order) => order.id);
  const [{ data: sales }, { data: payments }, { data: refunds }] = orderIds.length
    ? await Promise.all([
        supabase.from("sales").select("id,invoice_number,source_online_order_id").in("source_online_order_id", orderIds),
        supabase.from("online_order_payments").select("id,order_id,amount,payment_method,reference,cash_session_id,created_at").in("order_id", orderIds).order("created_at", { ascending: false }),
        supabase.from("online_order_refunds").select("id,order_id,amount,payment_method,reference,cash_session_id,created_at").in("order_id", orderIds).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const saleByOrder = new Map((sales || []).map((sale) => [sale.source_online_order_id, sale]));
  const paymentsByOrder = new Map<string, typeof payments>();
  const refundsByOrder = new Map<string, typeof refunds>();
  for (const payment of payments || []) {
    paymentsByOrder.set(payment.order_id, [...(paymentsByOrder.get(payment.order_id) || []), payment]);
  }
  for (const refund of refunds || []) {
    refundsByOrder.set(refund.order_id, [...(refundsByOrder.get(refund.order_id) || []), refund]);
  }

  const tills = (openSessions || []).map((session) => ({
    id: session.id,
    label: `بائع ${session.seller_id.slice(0, 8)} · ${new Date(session.opened_at).toLocaleTimeString("ar-EG")}`,
  }));
  const money = (value: number) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);
  const methodName = (method: string) =>
    method === "cash" ? "كاش" : method === "instapay" ? "InstaPay" : "Visa";

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5">
        <h2 className="text-2xl font-black">طلبات المتجر الإلكتروني</h2>
        <p className="muted mt-1 text-sm">مراجعة الطلبات، تحصيلها أو ردها، ثم تحويل الطلب المسدد إلى فاتورة مبيعات عند التسليم.</p>
      </div>
      <div className="space-y-4">
        {(orders || []).map((order) => {
          const sale = saleByOrder.get(order.id);
          const orderPayments = paymentsByOrder.get(order.id) || [];
          const orderRefunds = refundsByOrder.get(order.id) || [];
          const canPay = order.status === "pending" || order.status === "confirmed";
          const canRefund = canPay && Number(order.paid) > 0.009;
          const canFulfill = order.status === "confirmed" && Number(order.due) <= 0.009;

          return (
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

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><p className="muted text-xs">إجمالي الطلب</p><b>{money(Number(order.subtotal))}</b></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="muted text-xs">المدفوع الصافي</p><b>{money(Number(order.paid))}</b></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="muted text-xs">المتبقي</p><b>{money(Number(order.due))}</b></div>
              </div>

              {orderPayments.length ? (
                <div className="mt-4 rounded-xl border p-3">
                  <h4 className="mb-2 text-sm font-black">سجل التحصيل</h4>
                  {orderPayments.map((payment) => (
                    <div key={payment.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-xs last:border-0">
                      <span>{methodName(payment.payment_method)} · {payment.reference || "بدون مرجع"} · {new Date(payment.created_at).toLocaleString("ar-EG")}</span>
                      <b>{money(Number(payment.amount))}</b>
                    </div>
                  ))}
                </div>
              ) : null}
              {orderRefunds.length ? (
                <div className="mt-3 rounded-xl border border-red-100 p-3">
                  <h4 className="mb-2 text-sm font-black text-red-800">سجل رد المبالغ</h4>
                  {orderRefunds.map((refund) => (
                    <div key={refund.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-xs last:border-0">
                      <span>{methodName(refund.payment_method)} · {refund.reference || "بدون مرجع"} · {new Date(refund.created_at).toLocaleString("ar-EG")}</span>
                      <b className="text-red-800">− {money(Number(refund.amount))}</b>
                    </div>
                  ))}
                </div>
              ) : null}

              {canPay ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {Number(order.due) > 0.009 ? (
                    <form action={recordOnlineOrderPayment} className="rounded-xl border border-emerald-100 p-3">
                      <h4 className="mb-2 text-sm font-black">تسجيل تحصيل</h4>
                      <input type="hidden" name="order_id" value={order.id} />
                      <input type="hidden" name="idempotency_key" value={randomUUID()} />
                      <label className="block text-xs font-bold">المبلغ
                        <input className="field mt-1" name="amount" type="number" min="0.01" max={Number(order.due)} step="0.01" defaultValue={Number(order.due).toFixed(2)} required />
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-xs font-bold">الطريقة
                          <select className="field mt-1" name="method" defaultValue="cash">
                            <option value="cash">كاش</option><option value="instapay">InstaPay</option><option value="visa">Visa</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold">درج الكاش (اختياري)
                          <select className="field mt-1" name="cash_session_id" defaultValue="">
                            <option value="">الخزينة المركزية</option>
                            {tills.map((till) => <option key={till.id} value={till.id}>{till.label}</option>)}
                          </select>
                        </label>
                      </div>
                      <label className="mt-2 block text-xs font-bold">مرجع التحويل / الفيزا
                        <input className="field mt-1" name="reference" maxLength={120} />
                      </label>
                      <button className="btn btn-primary mt-3 w-full">حفظ التحصيل</button>
                    </form>
                  ) : null}

                  {canRefund ? (
                    <form action={recordOnlineOrderRefund} className="rounded-xl border border-red-100 p-3">
                      <h4 className="mb-2 text-sm font-black text-red-800">رد مبلغ للعميل</h4>
                      <input type="hidden" name="order_id" value={order.id} />
                      <input type="hidden" name="idempotency_key" value={randomUUID()} />
                      <label className="block text-xs font-bold">المبلغ
                        <input className="field mt-1" name="amount" type="number" min="0.01" max={Number(order.paid)} step="0.01" defaultValue={Number(order.paid).toFixed(2)} required />
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-xs font-bold">طريقة الرد
                          <select className="field mt-1" name="method" defaultValue="cash">
                            <option value="cash">كاش</option><option value="instapay">InstaPay</option><option value="visa">Visa</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold">درج الكاش (اختياري)
                          <select className="field mt-1" name="cash_session_id" defaultValue="">
                            <option value="">الخزينة المركزية</option>
                            {tills.map((till) => <option key={till.id} value={till.id}>{till.label}</option>)}
                          </select>
                        </label>
                      </div>
                      <label className="mt-2 block text-xs font-bold">مرجع الرد
                        <input className="field mt-1" name="reference" maxLength={120} />
                      </label>
                      <button className="btn mt-3 w-full border border-red-200 text-red-800">تسجيل الرد</button>
                    </form>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  {sale ? (
                    <Link href={"/invoices/" + sale.id} className="font-bold text-emerald-800 underline">فاتورة البيع #{sale.invoice_number}</Link>
                  ) : <span className="muted">لم تصدر فاتورة بيع بعد</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.status === "pending" ? (
                    <form action={setOnlineOrderStatus}>
                      <input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="status" value="confirmed" />
                      <button className="btn btn-primary">تأكيد الطلب</button>
                    </form>
                  ) : null}
                  {canFulfill ? (
                    <form action={setOnlineOrderStatus}>
                      <input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="status" value="fulfilled" />
                      <button className="btn btn-primary">تسجيل التسليم وإصدار الفاتورة</button>
                    </form>
                  ) : null}
                  {order.status === "confirmed" && Number(order.due) > 0.009 ? <span className="muted self-center text-xs">يجب تحصيل كامل المبلغ قبل التسليم</span> : null}
                  {canPay && Number(order.paid) <= 0.009 ? (
                    <form action={setOnlineOrderStatus}>
                      <input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="status" value="cancelled" />
                      <button className="btn border border-red-200 text-red-700">إلغاء الطلب</button>
                    </form>
                  ) : null}
                  {canPay && Number(order.paid) > 0.009 ? <span className="muted self-center text-xs">رد المبلغ أولًا قبل الإلغاء</span> : null}
                </div>
              </div>
            </article>
          );
        })}
        {!orders?.length ? <div className="panel p-8 text-center muted">لا توجد طلبات إلكترونية حتى الآن.</div> : null}
      </div>
    </Shell>
  );
}
