import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { StaffClient } from "./staff-client";
import { ManagerPermissionsClient } from "./manager-permissions-client";

export default async function Staff() {
  const { supabase, user, profile } = await requireAdmin();
  const [{ data: staff, error: staffError }, { data: grants, error: grantsError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id,full_name,role,is_active,max_discount_percent,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("manager_permissions").select("user_id,permission_key"),
    ]);

  if (staffError) throw new Error(staffError.message);
  const managers = (staff || []).filter((person) => person.role === "manager");
  const permissionsAvailable = !grantsError;
  const permissionRows = grants || [];

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <h2 className="mb-5 text-2xl font-black">إدارة الموظفين</h2>
      <StaffClient />

      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الصلاحية</th>
              <th>الحالة</th>
              <th>حد الخصم</th>
            </tr>
          </thead>
          <tbody>
            {(staff || []).map((person) => (
              <tr key={person.id}>
                <td>{person.full_name || "—"}</td>
                <td>
                  {person.role === "admin"
                    ? "أدمن"
                    : person.role === "manager"
                      ? "مدير محل"
                      : "بائع"}
                </td>
                <td>{person.is_active ? "نشط" : "موقوف"}</td>
                <td>{person.max_discount_percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-6 space-y-4">
        <div>
          <h3 className="text-xl font-black">صلاحيات مديري المحل</h3>
          <p className="muted mt-1 text-sm">
            كل مدير يبدأ دون صلاحيات إضافية. حدّد ما تسمح له بعرضه من حساب Admin.
          </p>
        </div>
        {!permissionsAvailable && (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            تعذر تحميل الصلاحيات. تأكد من تطبيق ترحيل قاعدة البيانات 0007 قبل إدارة صلاحيات المديرين.
          </p>
        )}
        {permissionsAvailable && managers.length === 0 && (
          <p className="panel p-4 text-sm text-slate-600">
            لا يوجد حساب Manager حتى الآن. أنشئ حساب مدير أولًا.
          </p>
        )}
        {permissionsAvailable &&
          managers.map((manager) => (
            <ManagerPermissionsClient
              key={manager.id}
              managerId={manager.id}
              managerName={manager.full_name || ""}
              granted={permissionRows
                .filter((grant) => grant.user_id === manager.id)
                .map((grant) => grant.permission_key)}
            />
          ))}
      </section>

      <p className="muted mt-4 text-sm">
        إنشاء الحسابات يتم عبر Edge Function تتحقق من دور Admin. كلمات المرور لا تُعرض ولا تُحفظ في التطبيق.
      </p>
    </Shell>
  );
}
