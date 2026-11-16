import Image from "next/image";
import Link from "next/link";
import { signIn } from "@/app/actions";
import { BRAND_LOGO_URL } from "@/lib/brand";


export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; password_updated?: string }>;
}) {
  const query = await searchParams;

  return (
    <main className="brand-login grid min-h-screen place-items-center p-5">
      <section className="panel w-full max-w-md border border-gold-400/40 p-8 shadow-brand-gold">
        <div className="mb-8 text-center">
          <Image
            src={BRAND_LOGO_URL}
            alt="شعار BARTIKA JEANS"
            width={128}
            height={128}
            className="brand-logo-frame mx-auto mb-4 h-32 w-32 rounded-2xl object-contain p-1"
            unoptimized
            priority
          />
          <h1 className="text-2xl font-black text-emerald-950">BARTIKA JEANS</h1>
          <p className="muted mt-2">نظام إدارة المحل</p>
        </div>

        {query.password_updated ? (
          <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            تم تغيير كلمة المرور بنجاح. سجّل الدخول بكلمة المرور الجديدة.
          </p>
        ) : null}

        {query.error ? (
          <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {query.error}
          </p>
        ) : null}

        <form action={signIn} className="space-y-4">
          <label className="block text-sm font-bold">
            البريد الإلكتروني
            <input
              className="field mt-2"
              name="email"
              type="email"
              autoComplete="username"
              required
              dir="ltr"
            />
          </label>
          <label className="block text-sm font-bold">
            كلمة المرور
            <input
              className="field mt-2"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn btn-primary w-full">تسجيل الدخول</button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/forgot-password" className="text-sm font-bold text-emerald-800 underline">
            نسيت كلمة المرور؟ إنشاء كلمة مرور جديدة
          </Link>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4 text-center">
          <Link href="/shop" className="text-sm font-bold text-emerald-800 underline">
            زيارة متجر BARTIKA العام
          </Link>
        </div>
      </section>
    </main>
  );
}
