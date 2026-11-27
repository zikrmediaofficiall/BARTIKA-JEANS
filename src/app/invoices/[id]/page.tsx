import Image from "next/image";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { PrintButton } from "./print-button";
import { QRCodeSVG } from "qrcode.react";
import { BRAND_LOGO_URL } from "@/lib/brand";

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
  const { supabase, user, profile } = await requireUser();

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (saleError) throw new Error("تعذر تحميل الفاتورة: " + saleError.message);
  if (!sale) notFound();

  const [
    { data: items, error: itemsError },
    { data: payments, error: paymentsError },
    { data: storeSettings, error: storeSettingsError },
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
      .select("store_name,store_name_ar,phone,address,logo_url,exchange_days")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (itemsError || paymentsError || storeSettingsError) {
    throw new Error(
      "تعذر تحميل تفاصيل الفاتورة: " +
        (itemsError?.message || paymentsError?.message || storeSettingsError?.message),
    );
  }

  const [{ data: onlinePayments, error: onlinePaymentsError }, { data: onlineRefunds, error: onlineRefundsError }] = sale.source_online_order_id
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
    : [{ data: [], error: null }, { data: [], error: null }];

  if (onlinePaymentsError || onlineRefundsError) {
    throw new Error(
      "تعذر تحميل سجل تحصيل/رد الطلب: " +
        (onlinePaymentsError?.message || onlineRefundsError?.message),
    );
  }
  const storeName = storeSettings?.store_name || "BARTIKA JEANS";
  const storeNameAr = storeSettings?.store_name_ar || "بارتيكا جينز";
  const logoUrl = BRAND_LOGO_URL;

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
              <th className="thermal-hide">الباركود</th>
              <th>العدد</th>
              <th>السعر</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((item, index) => (
              <tr key={index}>
                <td>{item.product_name_snapshot}</td>
                <td className="thermal-hide">{item.barcode_snapshot}</td>
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
          {Number(sale.shipping_amount || 0) > 0 ? (
            <p className="flex justify-between">
              <span>الشحن</span>
              <b>{fmt(Number(sale.shipping_amount))}</b>
            </p>
          ) : null}
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
            {Number(storeSettings?.exchange_days ?? 3) > 0
              ? `الاستبدال الطوعي خلال ${Number(storeSettings?.exchange_days ?? 3)} يوم للسلع السليمة وفق سياسة المحل، مع الحفاظ على الحقوق القانونية للمستهلك.`
              : "لا يقدم المتجر استبدالًا طوعيًا للسلع السليمة، مع الحفاظ الكامل على الحقوق القانونية للمستهلك في العيب أو عدم المطابقة."}
          </p>
          <p className="mt-2">شكرًا لزيارتكم {storeName}</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <QRCodeSVG value="https://bartika-jeans.vercel.app/links" size={84} level="H" marginSize={3} />
            <p className="max-w-32 text-xs leading-5">امسح الكود لمتابعة BARTIKA على منصات التواصل والمتجر</p>
          </div>
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
          html, body { background: #fff !important; }
          body * { visibility: hidden; }
          .invoice-paper, .invoice-paper * { visibility: visible; }
          .invoice-paper { position: absolute; inset: 0 auto auto 0; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; color: #000; }
          body[data-print="t80"] .invoice-paper,
          body[data-print="t58"] .invoice-paper {
            margin: 0;
            font-size: 11px;
            line-height: 1.45;
            padding: 3mm;
            direction: rtl;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body[data-print="t80"] .invoice-paper { width: 80mm; max-width: 80mm; }
          body[data-print="t58"] .invoice-paper { width: 58mm; max-width: 58mm; font-size: 10px; }
          body[data-print="t80"] .invoice-paper header,
          body[data-print="t58"] .invoice-paper header { flex-direction: column-reverse; align-items: center; text-align: center; gap: 4px; margin-bottom: 6px; padding-bottom: 6px; }
          body[data-print="t80"] .invoice-paper header img,
          body[data-print="t58"] .invoice-paper header img { width: 48px; height: 48px; }
          body[data-print="t80"] .invoice-paper h1,
          body[data-print="t58"] .invoice-paper h1 { font-size: 15px; }
          body[data-print="t80"] .invoice-paper .grid,
          body[data-print="t58"] .invoice-paper .grid { grid-template-columns: 1fr; gap: 2px; margin-bottom: 6px; }
          body[data-print="t80"] .invoice-paper .thermal-hide,
          body[data-print="t58"] .invoice-paper .thermal-hide { display: none !important; }
          body[data-print="t80"] .invoice-paper th,
          body[data-print="t80"] .invoice-paper td,
          body[data-print="t58"] .invoice-paper th,
          body[data-print="t58"] .invoice-paper td { padding: 2px 1px; white-space: normal; font-size: inherit; border-bottom: 1px dashed #000; color: #000; }
          body[data-print="t80"] .invoice-paper .max-w-xs,
          body[data-print="t58"] .invoice-paper .max-w-xs { max-width: none; margin: 6px 0 0; }
          body[data-print="t80"] .invoice-paper .text-lg,
          body[data-print="t58"] .invoice-paper .text-lg { font-size: 14px; }
          body[data-print="t80"] .invoice-paper .text-slate-500,
          body[data-print="t80"] .invoice-paper .text-gold-500,
          body[data-print="t58"] .invoice-paper .text-slate-500,
          body[data-print="t58"] .invoice-paper .text-gold-500 { color: #000; }
          body[data-print="a4"] .invoice-paper { position: static; width: 190mm; max-width: 190mm; margin: 0 auto; padding: 6mm; }
          aside, .app-shell-header, nav, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
        }
      `}</style>
    </Shell>
  );
}
