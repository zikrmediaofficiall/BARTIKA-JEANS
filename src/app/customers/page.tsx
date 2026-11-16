import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";

export default async function Customers() {
  const { supabase, user, profile } = await requirePermission("customers.read");
  const { data, error } = await supabase
    .from("customers")
    .select("id,name,phone,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <h2 className="mb-5 text-2xl font-black">العملاء</h2>
      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>رقم الهاتف</th>
              <th>تاريخ الإضافة</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.phone}</td>
                <td>{new Date(customer.created_at).toLocaleDateString("ar-EG")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
