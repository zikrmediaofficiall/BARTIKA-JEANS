"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StaffRole = "seller" | "manager";

export function StaffClient() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [discount, setDiscount] = useState(0);
  const [role, setRole] = useState<StaffRole>("seller");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email,
          full_name: name,
          password,
          role,
          max_discount_percent: discount,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMessage(
        role === "manager"
          ? "تم إنشاء حساب المدير. الصلاحيات الإدارية الافتراضية مغلقة؛ امنح الصلاحيات المطلوبة من القسم أدناه."
          : "تم إنشاء حساب البائع. يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول.",
      );
      setEmail("");
      setName("");
      setPassword("");
      setDiscount(0);
      setRole("seller");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء الحساب");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel mb-6 p-5">
      <h3 className="mb-4 font-black">إضافة موظف</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="field"
          placeholder="اسم الموظف"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="field"
          placeholder="البريد الإلكتروني"
          type="email"
          dir="ltr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="field"
          placeholder="كلمة مرور مؤقتة (12 حرفًا على الأقل)"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label className="text-sm">
          نوع الحساب
          <select
            className="field mt-1"
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRole)}
          >
            <option value="seller">بائع</option>
            <option value="manager">مدير محل</option>
          </select>
        </label>
        <label className="text-sm">
          الحد الأقصى للخصم المسموح %
          <input
            className="field mt-1"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={discount}
            onChange={(event) => setDiscount(Number(event.target.value))}
          />
        </label>
      </div>
      <button
        className="btn btn-primary mt-4"
        disabled={busy || !name.trim() || !email.includes("@") || password.length < 12}
        onClick={create}
        type="button"
      >
        {busy ? "جارٍ الإنشاء…" : role === "manager" ? "إنشاء حساب مدير" : "إنشاء حساب بائع"}
      </button>
      {message && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">{message}</p>}
    </section>
  );
}
