import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StorefrontClient } from "./storefront-client";

export const revalidate = 60;

export default async function PublicShop() {
  const supabase = await createClient();
  const [{ data: catalog, error }, { data: settings }] = await Promise.all([
    supabase.rpc("get_public_catalog"),
    supabase.from("store_settings").select("store_name,store_name_ar,logo_url,phone,whatsapp_url,address,facebook_url,instagram_url,tiktok_url").eq("id",1).maybeSingle(),
  ]);
  if (error) throw new Error("تعذر تحميل المنتجات المتاحة: " + error.message);

  return (
    <main className="min-h-screen">
      <header className="bg-emerald-950 px-4 py-5 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <Link href="/shop" className="flex items-center gap-3">
            {settings?.logo_url ? <img src={settings.logo_url} alt="BARTIKA" className="h-12 w-12 rounded-xl object-cover" /> : <span className="text-3xl">👖</span>}
            <span><b className="block text-xl tracking-widest">{settings?.store_name || "BARTIKA JEANS"}</b><small className="text-emerald-200">{settings?.store_name_ar || "بارتيكا جينز"}</small></span>
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm text-emerald-100">
            {settings?.phone ? <a href={"tel:" + settings.phone}>اتصل بنا</a> : null}
            {settings?.whatsapp_url ? <a href={settings.whatsapp_url} target="_blank" rel="noreferrer">واتساب</a> : null}
            <Link href="/login" className="rounded-lg border border-white/30 px-3 py-2">دخول الإدارة</Link>
          </nav>
        </div>
      </header>
      <section className="bg-gradient-to-l from-emerald-950 to-emerald-800 px-4 py-12 text-center text-white">
        <p className="text-sm font-bold tracking-[.25em] text-amber-300">BARTIKA JEANS</p>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">ستايلك يبدأ من هنا</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-emerald-100">اكتشف تشكيلتنا من الجينز والملابس الرجالي، واختر المقاس واللون المناسبين واطلب بسهولة.</p>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <StorefrontClient catalog={(catalog || []) as never} />
      </div>
      <footer className="mt-12 bg-slate-950 px-4 py-8 text-center text-sm text-slate-300">
        <b className="text-white">{settings?.store_name || "BARTIKA JEANS"}</b>
        {settings?.address ? <p className="mt-2">{settings.address}</p> : null}
        <div className="mt-3 flex justify-center gap-4">
          {settings?.facebook_url ? <a href={settings.facebook_url}>Facebook</a> : null}
          {settings?.instagram_url ? <a href={settings.instagram_url}>Instagram</a> : null}
          {settings?.tiktok_url ? <a href={settings.tiktok_url}>TikTok</a> : null}
        </div>
      </footer>
    </main>
  );
}
