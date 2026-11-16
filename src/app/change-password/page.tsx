import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const { user, profile } = await requireUser();

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <section className="panel mx-auto w-full max-w-xl p-5 sm:p-7">
        <h2 className="text-2xl font-black">تغيير كلمة المرور</h2>
        <p className="muted mt-2 text-sm leading-6">
          غيّر كلمة المرور المؤقتة بعد أول دخول، واستخدم كلمة مرور جديدة لا تقل عن 12 حرفًا.
        </p>
        <div className="mt-6">
          <ChangePasswordForm />
        </div>
      </section>
    </Shell>
  );
}
