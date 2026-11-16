import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { startStocktake } from "@/app/actions";

export default async function Stocktake() {
  const { supabase, user, profile } = await requirePermission("stocktake.read");
  const isAdmin = profile.role === "admin";
  const { data, error } = await supabase
    .from("stocktakes")
    .select("id,status,notes,created_at,approved_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black">الجرد الفعلي</h2>
        {isAdmin ? (
          <form action={startStocktake} className="flex gap-2">
            <input className="field" name="notes" placeholder="ملاحظات الجرد" />
            <button className="btn btn-primary whitespace-nowrap">بدء جلسة جرد</button>
          </form>
        ) : (
          <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            عرض فقط — إنشاء واعتماد الجرد للأدمن
          </span>
        )}
      </div>
      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>رقم الجلسة</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((session) => (
              <tr key={session.id}>
                <td>
                  <Link className="font-bold text-emerald-800 underline" href={"/stocktake/" + session.id}>
                    {session.id.slice(0, 8)}
                  </Link>
                </td>
                <td>{new Date(session.created_at).toLocaleString("ar-EG")}</td>
                <td>{session.status}</td>
                <td>{session.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
