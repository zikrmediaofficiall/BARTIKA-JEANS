import Link from "next/link";

export default async function OrderConfirmation({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const number = order && /^\d+$/.test(order) ? order : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="panel w-full max-w-lg p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
        <h1 className="mt-4 text-2xl font-black">تم استلام طلبك</h1>
        {number ? <p className="mt-3 text-lg">رقم الطلب: <b className="text-emerald-900">#{number}</b></p> : null}
        <p className="muted mt-3 text-sm leading-7">طلبك الآن قيد المراجعة. سيتواصل معك فريق BARTIKA لتأكيد المقاسات والتوفر وطريقة الاستلام. لا يتم تحصيل أي مبلغ من خلال هذه الصفحة.</p>
        <Link href="/shop" className="btn btn-primary mt-6 inline-block">العودة للمتجر</Link>
      </section>
    </main>
  );
}
