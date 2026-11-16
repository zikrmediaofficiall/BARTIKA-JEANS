"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("bartikastore321@gmail.com");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSent(false);

    const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "https://bartika-jeans.vercel.app/",
    });

    if (requestError) {
      setError(requestError.message || "تعذر إرسال رسالة الاستعادة. راجع إعدادات البريد وحاول مرة أخرى.");
    } else {
      setSent(true);
    }
    setBusy(false);
  }

  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="panel w-full max-w-md p-8">
        <h1 className="text-2xl font-black text-emerald-950">استعادة كلمة المرور</h1>
        <p className="muted mt-2 text-sm leading-6">أدخل بريد حساب الأدمن. سنرسل إليه رابطًا آمنًا لإنشاء كلمة مرور جديدة.</p>

        {sent ? (
          <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
            تم طلب رسالة الاستعادة. راجع صندوق الوارد والرسائل غير المرغوب فيها، وافتح الرابط من نفس المتصفح الذي طلبت منه الاستعادة.
          </p>
        ) : null}
        {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-bold">
            البريد الإلكتروني
            <input className="field mt-2" type="email" autoComplete="email" dir="ltr" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? "جارٍ الإرسال…" : "إرسال رابط الاستعادة"}</button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/login" className="text-sm font-bold text-emerald-800 underline">العودة لتسجيل الدخول</Link>
        </div>
      </section>
    </main>
  );
}
