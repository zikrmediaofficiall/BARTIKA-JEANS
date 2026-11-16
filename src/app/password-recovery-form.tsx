"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecoveryForm({ code }: { code: string }) {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const started = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let active = true;

    try {
      const supabase = createClient();
      supabaseRef.current = supabase;
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (!active) return;
        if (exchangeError) {
          setError("رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رسالة استعادة جديدة.");
          return;
        }
        setReady(true);
      }).catch(() => {
        if (active) setError("تعذر التحقق من رابط الاستعادة. اطلب رسالة جديدة وحاول مرة أخرى.");
      });
    } catch {
      setError("تعذر تهيئة جلسة الاستعادة. افتح الرابط في نفس المتصفح الذي طلبت منه الرسالة.");
    }

    return () => { active = false; };
  }, [code]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      setError("تأكيد كلمة المرور غير مطابق.");
      return;
    }

    const supabase = supabaseRef.current;
    if (!supabase) {
      setError("انتهت جلسة الاستعادة. اطلب رسالة جديدة.");
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message || "تعذر تغيير كلمة المرور. حاول مجددًا.");
      setBusy(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?password_updated=1");
  }

  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="panel w-full max-w-md p-8">
        <h1 className="text-2xl font-black text-emerald-950">إنشاء كلمة مرور جديدة</h1>
        <p className="muted mt-2 text-sm leading-6">اختر كلمة مرور خاصة بحساب إدارة BARTIKA JEANS.</p>

        {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        {!ready && !error ? (
          <p className="muted mt-6 text-sm">جارٍ التحقق من رابط الاستعادة…</p>
        ) : null}

        {ready ? (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-bold">
              كلمة المرور الجديدة
              <input className="field mt-2" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="block text-sm font-bold">
              تأكيد كلمة المرور
              <input className="field mt-2" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
            <button className="btn btn-primary w-full" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
