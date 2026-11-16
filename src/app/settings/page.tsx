import Image from "next/image";
import { updateStoreSettings } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/shell";

export default async function Settings() {
  const { supabase, user } = await requireAdmin();

  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !settings) {
    throw new Error(error?.message || "تعذر تحميل إعدادات المتجر");
  }

  return (
    <Shell user={user.email || ""} role="admin">
      <h2 className="mb-5 text-2xl font-black">إعدادات المتجر</h2>

      <form action={updateStoreSettings} className="space-y-5">
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center gap-4">
            {settings.logo_url ? (
              <Image
                src={settings.logo_url}
                alt="شعار BARTIKA JEANS"
                width={88}
                height={88}
                className="h-20 w-20 rounded-xl object-cover"
                unoptimized
              />
            ) : null}
            <div>
              <h3 className="font-black">هوية المتجر</h3>
              <p className="muted mt-1 text-sm">
                الشعار الحالي محفوظ في Cloudinary ضمن مجلد BARTIKA.
              </p>
            </div>
          </div>

          <label className="block text-sm font-bold">
            اسم المتجر بالإنجليزية
            <input className="field mt-2" name="store_name" defaultValue={settings.store_name} required maxLength={100} />
          </label>
          <label className="block text-sm font-bold">
            اسم المتجر بالعربية
            <input className="field mt-2" name="store_name_ar" defaultValue={settings.store_name_ar} required maxLength={100} />
          </label>
        </section>

        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h3 className="font-black sm:col-span-2">بيانات التواصل والعنوان</h3>
          <label className="block text-sm font-bold">
            رقم هاتف المتجر
            <input className="field mt-2" name="phone" type="tel" dir="ltr" defaultValue={settings.phone || ""} maxLength={30} />
          </label>
          <label className="block text-sm font-bold">
            عنوان الفرع
            <input className="field mt-2" name="address" defaultValue={settings.address || ""} maxLength={250} />
          </label>
        </section>

        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h3 className="font-black sm:col-span-2">روابط التواصل الاجتماعي</h3>
          <label className="block text-sm font-bold">
            Facebook
            <input className="field mt-2" name="facebook_url" type="url" dir="ltr" defaultValue={settings.facebook_url || ""} placeholder="https://www.facebook.com/..." />
          </label>
          <label className="block text-sm font-bold">
            Instagram
            <input className="field mt-2" name="instagram_url" type="url" dir="ltr" defaultValue={settings.instagram_url || ""} placeholder="https://www.instagram.com/..." />
          </label>
          <label className="block text-sm font-bold">
            TikTok
            <input className="field mt-2" name="tiktok_url" type="url" dir="ltr" defaultValue={settings.tiktok_url || ""} placeholder="https://www.tiktok.com/@..." />
          </label>
          <label className="block text-sm font-bold">
            WhatsApp
            <input className="field mt-2" name="whatsapp_url" type="url" dir="ltr" defaultValue={settings.whatsapp_url || ""} placeholder="https://wa.me/..." />
          </label>
        </section>

        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h3 className="font-black sm:col-span-2">الدفع عبر InstaPay</h3>
          <label className="block text-sm font-bold">
            InstaPay IPA
            <input className="field mt-2" name="instapay_ipa" dir="ltr" defaultValue={settings.instapay_ipa || ""} placeholder="name@instapay" maxLength={120} />
          </label>
          <label className="block text-sm font-bold">
            رابط التحويل
            <input className="field mt-2" name="instapay_url" type="url" dir="ltr" defaultValue={settings.instapay_url || ""} placeholder="https://ipn.eg/..." />
          </label>
          <p className="muted text-xs sm:col-span-2">
            حفظ رابط InstaPay لا يثبت وصول التحويل. يجب مراجعة التحويل وتأكيده قبل اعتماد الطلب كمدفوع.
          </p>
        </section>

        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h3 className="font-black sm:col-span-2">سياسات المتجر والخصومات</h3>
          <label className="block text-sm font-bold">
            مدة الاستبدال الطوعي (بالأيام)
            <input className="field mt-2" name="exchange_days" type="number" min="0" max="30" step="1" defaultValue={settings.exchange_days} required />
          </label>
          <label className="block text-sm font-bold">
            الخصم السريع الافتراضي (%)
            <input className="field mt-2" name="quick_discount_percent" type="number" min="0" max="20" step="0.01" defaultValue={settings.quick_discount_percent} required />
          </label>
          <p className="muted text-xs leading-6 sm:col-span-2">
            مدة الاستبدال الطوعي لا تنتقص من الحقوق القانونية للمستهلك في حالة العيب أو عدم المطابقة. حدود خصم الموظفين الفردية تُدار من شاشة الموظفين وتتحقق منها قاعدة البيانات.
          </p>
        </section>

        <button className="btn btn-primary">حفظ إعدادات المتجر</button>
      </form>
    </Shell>
  );
}
