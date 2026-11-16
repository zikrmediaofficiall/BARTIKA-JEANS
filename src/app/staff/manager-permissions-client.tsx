"use client";

import { updateManagerPermissions } from "@/app/actions";

const permissionOptions = [
  ["dashboard.read", "عرض لوحة الإدارة"],
  ["sales.read_all", "عرض مبيعات جميع البائعين"],
  ["inventory.read", "عرض سجل حركات المخزون"],
  ["purchases.read", "عرض الموردين والمشتريات"],
  ["stocktake.read", "عرض جلسات الجرد"],
  ["cash.read_all", "عرض جميع الورديات والخزائن"],
  ["expenses.read", "عرض المصروفات"],
  ["customers.read", "عرض ملفات العملاء"],
  ["staff.read", "عرض بيانات الموظفين"],
  ["exchanges.read", "عرض عمليات الاستبدال"],
  ["orders.read", "عرض الطلبات الإلكترونية"],
  ["orders.manage", "إدارة الطلبات الإلكترونية"],
  ["reports.read", "عرض التقارير"],
] as const;

export function ManagerPermissionsClient({
  managerId,
  managerName,
  granted,
}: {
  managerId: string;
  managerName: string;
  granted: string[];
}) {
  return (
    <form action={updateManagerPermissions} className="panel p-5">
      <input type="hidden" name="manager_id" value={managerId} />
      <div className="mb-4">
        <h3 className="font-black">صلاحيات {managerName || "مدير المحل"}</h3>
        <p className="muted mt-1 text-xs">
          الصلاحيات المحددة هنا للقراءة والمتابعة فقط ما لم توجد عملية تنفيذ مصرح بها بشكل منفصل.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {permissionOptions.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-100 p-3 text-sm">
            <input
              type="checkbox"
              name="permission"
              value={key}
              defaultChecked={granted.includes(key)}
              className="h-4 w-4 accent-emerald-800"
            />
            {label}
          </label>
        ))}
      </div>
      <button className="btn btn-primary mt-4" type="submit">
        حفظ صلاحيات المدير
      </button>
    </form>
  );
}
