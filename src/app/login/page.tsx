import Image from "next/image";
import { signIn } from "@/app/actions";

const brandLogo = "https://res.cloudinary.com/dcuveyab9/image/upload/v1794812757/bartika-jeans/general/bartika-brand-logo.webp";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="panel w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <Image
            src={brandLogo}
            alt="شعار BARTIKA JEANS"
            width={96}
            height={96}
            className="mx-auto mb-3 h-24 w-24 rounded-2xl object-cover"
            unoptimized
            priority
          />
          <h1 className="text-2xl font-black text-emerald-950">BARTIKA JEANS</h1>
          <p className="muted mt-2">نظام إدارة المحل</p>
        </div>

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

        <p className="muted mt-5 text-center text-xs">
          يتم إنشاء حساب المدير الأول من Supabase بعد إعداد قاعدة البيانات.
        </p>
      </section>
    </main>
  );
}
