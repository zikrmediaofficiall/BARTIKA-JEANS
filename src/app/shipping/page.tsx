import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/shell";
import {
  addShippingCompany,
  addShippingZone,
  setShippingCompanyActive,
  updateShippingZone,
} from "@/app/actions";

export default async function ShippingSettings() {
  const { supabase, user } = await requireAdmin();
  const [{ data: companies, error: companyError }, { data: zones, error: zoneError }] = await Promise.all([
    supabase.from("shipping_companies").select("id,name,contact_phone,tracking_url_template,is_active,created_at").order("name"),
    supabase.from("shipping_zones").select("id,company_id,name,fee,free_shipping_threshold,is_active,sort_order,shipping_companies(name)").order("sort_order").order("name"),
  ]);
  if (companyError || zoneError) {
    throw new Error(companyError?.message || zoneError?.message || "تعذر تحميل إعدادات الشحن");
  }

  return (
    <Shell user={user.email || ""} role="admin">
      <div className="mb-6">
        <h2 className="text-2xl font-black">شركات الشحن ومناطق التوصيل</h2>
        <p className="muted mt-2 text-sm leading-6">
          أضف شركات الشحن ومناطق التغطية وأسعارها. تظهر المناطق النشطة فقط للعميل، ويحسب الخادم رسوم الشحن النهائية عند إنشاء الطلب.
        </p>
      </div>

      <form action={addShippingCompany} className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2">
        <h3 className="font-black sm:col-span-2">إضافة شركة شحن</h3>
        <label className="text-sm font-bold">اسم الشركة
          <input className="field mt-1" name="name" required minLength={2} maxLength={120} placeholder="اسم شركة الشحن" />
        </label>
        <label className="text-sm font-bold">رقم التواصل
          <input className="field mt-1" name="contact_phone" dir="ltr" maxLength={30} placeholder="رقم الشركة" />
        </label>
        <label className="text-sm font-bold sm:col-span-2">قالب رابط التتبع (اختياري)
          <input className="field mt-1" name="tracking_url_template" dir="ltr" maxLength={500} placeholder="https://carrier.example/track/" />
        </label>
        <button className="btn btn-primary sm:col-span-2">حفظ شركة الشحن</button>
      </form>

      <form action={addShippingZone} className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        <h3 className="font-black sm:col-span-2 xl:col-span-3">إضافة منطقة ورسوم التوصيل</h3>
        <label className="text-sm font-bold">شركة الشحن
          <select className="field mt-1" name="company_id" required defaultValue="">
            <option value="" disabled>اختر الشركة</option>
            {(companies || []).filter((company) => company.is_active).map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">اسم المنطقة
          <input className="field mt-1" name="name" required maxLength={120} placeholder="مثال: الإسكندرية - وسط" />
        </label>
        <label className="text-sm font-bold">رسوم الشحن (ج.م)
          <input className="field mt-1" name="fee" type="number" min="0" step="0.01" required placeholder="0.00" />
        </label>
        <label className="text-sm font-bold">حد الشحن المجاني (اختياري)
          <input className="field mt-1" name="free_shipping_threshold" type="number" min="0" step="0.01" placeholder="اتركه فارغًا لعدم وجود حد" />
        </label>
        <label className="text-sm font-bold">ترتيب الظهور
          <input className="field mt-1" name="sort_order" type="number" step="1" defaultValue="0" />
        </label>
        <button className="btn btn-primary">حفظ المنطقة</button>
      </form>

      <section className="panel mb-6 overflow-hidden">
        <div className="border-b p-5"><h3 className="font-black">شركات الشحن المسجلة</h3></div>
        <div className="divide-y">
          {(companies || []).map((company) => (
            <div key={company.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <b>{company.name}</b>
                <p className="muted mt-1 text-xs">{company.contact_phone || "بدون هاتف"} · {(zones || []).filter((zone) => zone.company_id === company.id).length} منطقة</p>
                {company.tracking_url_template ? <p className="muted mt-1 break-all text-xs" dir="ltr">{company.tracking_url_template}</p> : null}
              </div>
              <form action={setShippingCompanyActive}>
                <input type="hidden" name="company_id" value={company.id} />
                <input type="hidden" name="is_active" value={String(!company.is_active)} />
                <button className={company.is_active ? "btn border border-amber-200 text-amber-900" : "btn btn-primary"}>
                  {company.is_active ? "إيقاف الشركة" : "تفعيل الشركة"}
                </button>
              </form>
            </div>
          ))}
          {!companies?.length ? <p className="muted p-5 text-sm">لم تتم إضافة شركات شحن بعد.</p> : null}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b p-5"><h3 className="font-black">مناطق التوصيل والأسعار</h3></div>
        <div className="divide-y">
          {(zones || []).map((zone) => (
            <form key={zone.id} action={updateShippingZone} className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
              <input type="hidden" name="zone_id" value={zone.id} />
              <div className="sm:col-span-2 xl:col-span-5">
                <b>{zone.shipping_companies?.name || "شركة غير معروفة"}</b>
              </div>
              <label className="text-xs font-bold">المنطقة
                <input className="field mt-1" name="name" defaultValue={zone.name} required maxLength={120} />
              </label>
              <label className="text-xs font-bold">الرسوم (ج.م)
                <input className="field mt-1" name="fee" type="number" min="0" step="0.01" defaultValue={Number(zone.fee).toFixed(2)} required />
              </label>
              <label className="text-xs font-bold">حد الشحن المجاني
                <input className="field mt-1" name="free_shipping_threshold" type="number" min="0" step="0.01" defaultValue={zone.free_shipping_threshold === null ? "" : Number(zone.free_shipping_threshold).toFixed(2)} placeholder="بدون حد" />
              </label>
              <label className="text-xs font-bold">الحالة
                <select className="field mt-1" name="is_active" defaultValue={String(zone.is_active)}>
                  <option value="true">نشطة</option>
                  <option value="false">موقوفة</option>
                </select>
              </label>
              <button className="btn btn-primary self-end">حفظ التعديلات</button>
            </form>
          ))}
          {!zones?.length ? <p className="muted p-5 text-sm">أضف شركة شحن ومنطقة واحدة على الأقل حتى يظهر خيار التوصيل في المتجر.</p> : null}
        </div>
      </section>
    </Shell>
  );
}
