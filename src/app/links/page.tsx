import { BRAND_LOGO_URL } from "@/lib/brand";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicLinksPage() {
  const supabase = await createClient();
  const [{ data: storeRows }, { data: paymentRows }] = await Promise.all([
    supabase.rpc("get_public_store_settings"),
    supabase.rpc("get_public_instapay_settings"),
  ]);
  const store = storeRows?.[0];
  const payment = paymentRows?.[0];

  const links = [
    { label: "Facebook", href: store?.facebook_url, color: "bg-blue-50 text-blue-800" },
    { label: "Instagram", href: store?.instagram_url, color: "bg-pink-50 text-pink-800" },
    { label: "TikTok", href: store?.tiktok_url, color: "bg-slate-100 text-slate-900" },
    { label: "WhatsApp", href: store?.whatsapp_url, color: "bg-green-50 text-green-800" },
  ].filter((item): item is { label: string; href: string; color: string } => Boolean(item.href));

  return (
    <main className="min-h-screen bg-emerald-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <header className="mb-8 text-center">
          {BRAND_LOGO_URL ? (
            <Image src={BRAND_LOGO_URL} alt="BARTIKA JEANS" width={112} height={112} className="brand-logo-frame mx-auto mb-4 h-28 w-28 rounded-2xl object-contain p-1" unoptimized />
          ) : (
            <div className="brand-logo-frame mx-auto mb-4 grid h-24 w-24 place-items-center rounded-2xl text-4xl font-black text-gold-300">B</div>
          )}
          <h1 className="text-3xl font-black tracking-wider text-gold-300">{store?.store_name || "BARTIKA JEANS"}</h1>
          <p className="mt-2 text-sm text-emerald-100">تابعنا وتواصل معنا</p>
        </header>

        <section className="space-y-3">
          {links.map((item) => (
            <Link key={item.label} href={item.href} target="_blank" rel="noreferrer" className={`block rounded-xl px-5 py-4 text-center font-bold ${item.color}`}>
              {item.label}
            </Link>
          ))}
          {payment?.instapay_url ? (
            <Link href={payment.instapay_url} target="_blank" rel="noreferrer" className="block rounded-xl bg-gold-400 px-5 py-4 text-center font-black text-emerald-950 shadow-brand-gold">
              الدفع عبر InstaPay
              {payment.instapay_ipa ? <span className="mt-1 block text-xs font-normal" dir="ltr">{payment.instapay_ipa}</span> : null}
            </Link>
          ) : null}
          <Link href="/shop" className="block rounded-xl border border-gold-400 px-5 py-4 text-center font-bold text-gold-300">
            زيارة المتجر الإلكتروني
          </Link>
        </section>

        <footer className="mt-10 text-center text-xs text-emerald-200">
          {store?.phone ? <p dir="ltr">{store.phone}</p> : null}
          {store?.address ? <p className="mt-1">{store.address}</p> : null}
          <p className="mt-4">BARTIKA JEANS · أناقة الجينز الرجالي</p>
        </footer>
      </div>
    </main>
  );
}
