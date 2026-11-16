import Link from "next/link";
import { requireUser, hasPermission } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { addCustomer } from "@/app/actions";

type SearchParams = { q?: string };

export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { supabase, user, profile } = await requireUser();
  if (
    profile.role === "manager" &&
    !(await hasPermission(supabase, profile.role, "customers.read"))
  ) {
    return (
      <Shell user={user.email || ""} role={profile.role}>
        <p className="panel p-5">لا تملك صلاحية عرض ملفات العملاء.</p>
      </Shell>
    );
  }

  const query = await searchParams;
  const search = (query.q || "").trim().slice(0, 60).replace(/[(),%]/g, "");
  let customerQuery = supabase
    .from("customers")
    .select("id,name,phone,email,address,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) {
    customerQuery = customerQuery.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`,
    );
  }

  const { data, error } = await customerQuery;
  if (error) throw new Error(error.message);

  const isAdmin = profile.role === "admin";

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">ملفات العملاء</h2>
          <p className="muted mt-1 text-sm">
            سجل بيانات العملاء والفواتير والأرصدة حسب صلاحيات حسابك.
          </p>
        </div>
        <form method="get" action="/customers" className="flex min-w-60 gap-2">
          <input
            className="field"
            name="q"
            defaultValue={query.q || ""}
            placeholder="بحث بالاسم أو الهاتف أو البريد"
          />
          <button className="btn btn-gold">بحث</button>
        </form>
      </div>

      {isAdmin ? (
        <form action={addCustomer} className="panel mb-5 grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          <h3 className="font-black sm:col-span-2 xl:col-span-3">إضافة ملف عميل جديد</h3>
          <input className="field" name="name" placeholder="اسم العميل" required minLength={2} maxLength={160} />
          <input className="field" name="phone" placeholder="رقم الهاتف" type="tel" dir="ltr" maxLength={30} />
          <input className="field" name="email" placeholder="البريد الإلكتروني" type="email" dir="ltr" maxLength={160} />
          <input className="field" name="address" placeholder="العنوان" maxLength={300} />
          <input className="field" name="notes" placeholder="ملاحظات داخلية" maxLength={1000} />
          <label className="text-sm font-bold">
            حد الائتمان (ج.م)
            <input className="field mt-1" name="credit_limit" type="number" min="0" max="100000000" step="0.01" defaultValue="0" required />
          </label>
          <button className="btn btn-primary sm:col-span-2 xl:col-span-3">حفظ ملف العميل</button>
        </form>
      ) : null}

      <div className="panel table-wrap p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-black">العملاء</h3>
          <span className="muted text-xs">آخر 100 ملف مطابق</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>البريد</th>
              <th>العنوان</th>
              <th>تاريخ الإضافة</th>
              <th>الملف</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((customer) => (
              <tr key={customer.id}>
                <td className="font-bold">{customer.name}</td>
                <td dir="ltr">{customer.phone || "—"}</td>
                <td>{customer.email || "—"}</td>
                <td>{customer.address || "—"}</td>
                <td>{new Date(customer.created_at).toLocaleDateString("ar-EG")}</td>
                <td>
                  <Link
                    className="font-bold text-emerald-800 underline"
                    href={"/customers/" + customer.id}
                  >
                    فتح الملف
                  </Link>
                </td>
              </tr>
            ))}
            {!data?.length ? (
              <tr><td colSpan={6} className="py-6 text-center muted">لا توجد ملفات عملاء مطابقة.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
