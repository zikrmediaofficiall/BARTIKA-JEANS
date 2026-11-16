import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Shell } from "@/components/shell";

export default async function Settings() {
  const { user, profile } = await getSessionContext();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/");

  return (
    <Shell user={user.email || ""} role="admin">
      <h2 className="mb-5 text-2xl font-black">إعدادات النظام</h2>
      <div className="panel space-y-3 p-6">
        <div>
          <b>العملة</b>
          <p className="muted text-sm">الجنيه المصري EGP</p>
        </div>
        <div>
          <b>اللغة والاتجاه</b>
          <p className="muted text-sm">العربية — RTL</p>
        </div>
        <div>
          <b>صلاحيات الخصومات</b>
          <p className="muted text-sm">
            يحدد Admin الحد الأقصى لكل موظف من شاشة إدارة الموظفين، من 0% إلى 100%.
            لا يستطيع البائع تجاوز الحد المسجل في قاعدة البيانات.
          </p>
        </div>
        <div>
          <b>سياسة الاستبدال</b>
          <p className="muted text-sm">
            ثلاثة أيام للاستبدال الطوعي للسلع السليمة مع الحفاظ على الحقوق القانونية للمستهلك.
          </p>
        </div>
      </div>
    </Shell>
  );
}
