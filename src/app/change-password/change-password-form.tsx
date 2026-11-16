"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (password.length < 12) {
      setMessage("كلمة المرور يجب ألا تقل عن 12 حرفًا.");
      setIsError(true);
      return;
    }
    if (password !== confirmation) {
      setMessage("تأكيد كلمة المرور غير متطابق.");
      setIsError(true);
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPassword("");
      setConfirmation("");
      setMessage("تم تغيير كلمة المرور بنجاح.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تغيير كلمة المرور.");
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-bold">
        كلمة المرور الجديدة
        <input
          className="field mt-2"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <label className="block text-sm font-bold">
        تأكيد كلمة المرور الجديدة
        <input
          className="field mt-2"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
      </label>
      <button className="btn btn-primary w-full" type="submit" disabled={busy}>
        {busy ? "جارٍ تحديث كلمة المرور…" : "حفظ كلمة المرور الجديدة"}
      </button>
      {message ? (
        <p role="status" aria-live="polite" className={`rounded-xl p-3 text-sm ${isError ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
