import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { PrintButton } from "./print-button";

const fmt = (n: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
  }).format(n);

export default async function InvoiceDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, profile } = await getSessionContext();

  if (!user) redirect("/login");

  const { data: sale } = await supabase
    .from("sales")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!sale) notFound();

  const [
    { data: items },
    { data: payments },
    { data: storeSettings },
  ] = await Promise.all([
    supabase
      .from("sale_items")
      .select(
        "product_name_snapshot,barcode_snapshot,quantity,unit_price,line_total,discount_amount",
      )
      .eq("sale_id", id),
    supabase
      .from("payments")
      .select("method,amount,reference")
      .eq("sale_id", id),
    supabase
      .from("store_settings")
      .select("store_name,store_name_ar,phone,address,logo_url")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const [{ data: onlinePayments }, { data: onlineRefunds }] = sale.source_online_order_id
    ? await Promise.all([
        supabase
          .from("online_order_payments")
          .select("payment_method,amount,reference,created_at")
          .eq("order_id", sale.source_online_order_id)
          .order("created_at", { ascending: true }),
        supabase
          .from("online_order_refunds")
          .select("payment_method,amount,reference,created_at")
          .eq("order_id", sale.source_online_order_id)
          .order("created_at", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  const storeName = storeSettings?.store_name || "BARTIKA JEANS";
  const storeNameAr = storeSettings?.store_name_ar || "بارتيكا جينز";
  const logoUrl =
    storeSettings?.logo_url ||
    "https://res.cloudinary.com/dcuveyab9/image/upload/v1794812757/bartika-jeans/general/bartika-brand-logo.webp";

  return (
    <Shell user={user.email || ""} role={profile?.role || "seller"}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-black">
          فاتورة رقم {sale.invoice_number}
        </h2>
        <PrintButton />
      </div>

      <article className="invoice-paper panel mx-auto max-w-3xl p-6 print:max-w-none print:border-0 print:shadow-none">
        <header className="mb-6 flex items-center justify-between border-b-2 border-gold-400 pb-5">
          <div>
            <h1 className="text-2xl font-black text-emerald-950">
              {storeNameAr}
            </h1>
            <p className="text-sm text-gold-500">{storeName} · فاتورة بيع</p>
            {storeSettings?.phone ? (
              <p className="mt-1 text-xs text-slate-500" dir="ltr">
                {storeSettings.phone}
              </p>
            ) : null}
            {storeSettings?.address ? (
              <p className="mt-1 text-xs text-slate-500">
                {storeSettings.address}
              </p>
            ) : null}
          </div>
          <Image
            src={logoUrl}
            alt={`شعار ${storeName}`}
            width={80}
            height={80}
            className="h-20 w-20 rounded-lg object-contain"
            unoptimized
          />
        </header>

        <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
          <p>
            رقم الفاتورة: <b>{sale.invoice_number}</b>
          </p>
          <p>
            التاريخ: <b>{new Date(sale.created_at).toLocaleString("ar-EG")}</b>
          </p>
          <p>
            الحالة: <b>{sale.status === "void" ? "ملغاة" : "معتمدة"}</b>
          </p>
          <p>
            المدفوع: <b>{fmt(Number(sale.paid))}</b>
          </p>
        </div>

        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>الباركود</th>
              <th>العدد</th>
              <th>السعر</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((item, index) => (
              <tr key={index}>
                <td>{item.product_name_snapshot}</td>
                <td>{item.barcode_snapshot}</td>
                <td>{item.quantity}</td>
                <td>{fmt(Number(item.unit_price))}</td>
                <td>
                  {fmt(Number(item.line_total) - Number(item.discount_amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 mr-auto max-w-xs space-y-2 text-sm">
          <p className="flex justify-between">
            <span>الإجمالي قبل الخصم</span>
            <b>{fmt(Number(sale.subtotal))}</b>
          </p>
          <p className="flex justify-between">
            <span>الخصم</span>
            <b>{fmt(Number(sale.discount_amount))}</b>
          </p>
          <p className="flex justify-between border-t pt-2 text-lg">
            <span>الصافي</span>
            <b>{fmt(Number(sale.total))}</b>
          </p>
          <p className="flex justify-between">
            <span>المدفوع</span>
            <b>{fmt(Number(sale.paid))}</b>
          </p>
          <p className="flex justify-between">
            <span>المتبقي</span>
            <b>{fmt(Number(sale.due))}</b>
          </p>
        </div>

        <div className="mt-6 border-t pt-4 text-xs text-slate-500">
          <p>
            الاستبدال الطوعي خلال 3 أيام للسلع السليمة وفق سياسة المحل، مع
            الحفاظ على الحقوق القانونية للمستهلك.
          </p>
          <p className="mt-2">شكرًا لزيارتكم {storeName}</p>
        </div>

        <div className="mt-5 print:hidden">
          <b className="text-sm">وسائل الدفع</b>
          {(payments || []).map((payment, index) => (
            <p key={"pos-" + index} className="muted text-sm">
              {payment.method === "cash" ? "كاش" : payment.method === "instapay" ? "InstaPay" : "فيزا"}
              {" — "}{fmt(Number(payment.amount))}
              {payment.reference ? ` · ${payment.reference}` : ""}
            </p>
          ))}
          {(onlinePayments || []).map((payment, index) => (
            <p key={"online-" + index} className="muted text-sm">
              {payment.payment_method === "cash" ? "كاش" : payment.payment_method === "instapay" ? "InstaPay" : "فيزا"}
              {" — "}{fmt(Number(payment.amount))}
              {payment.reference ? ` · ${payment.reference}` : ""}
              <span className="muted"> · طلب إلكتروني</span>
            </p>
          ))}
          {(onlineRefunds || []).map((refund, index) => (
            <p key={"refund-" + index} className="muted text-sm text-red-700">
              رد {refund.payment_method === "cash" ? "كاش" : refund.payment_method === "instapay" ? "InstaPay" : "فيزا"}
              {" — −"}{fmt(Number(refund.amount))}
              {refund.reference ? ` · ${refund.reference}` : ""}
            </p>
          ))}
        </div>
      </article>

      <style>{`
        @media print {
          body { background: #fff; }
          body[data-print="thermal"] .invoice-paper {
            width: 80mm;
            max-width: 80mm;
            margin: 0;
            padding: 4mm;
            font-size: 11px;
          }
          body[data-print="a4"] .invoice-paper {
            width: 210mm;
            max-width: 210mm;
            margin: 0 auto;
            padding: 12mm;
          }
          aside, .app-shell-header, nav, .print\\:hidden {
            display: none !important;
          }
          main { padding: 0 !important; }
        }
      `}</style>
    </Shell>
  );
}
