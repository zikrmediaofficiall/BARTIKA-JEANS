# تجهيز BARTIKA JEANS للإطلاق

## فصل الخدمات عن ZIKR

- Supabase Project: BARTIKA-JEANS
- Supabase Project Ref: `gnebcwgaahwowxwiqqlj`
- Region: `eu-central-1` (Frankfurt)
- قاعدة البيانات مخصصة لهذا المستودع فقط. لا تستخدم مفاتيح أو قاعدة ZIKR.
- صور BARTIKA تستخدم مجلد الجذر `bartika-jeans/` داخل Cloudinary، ولا ترفع ملفات إلى مجلدات ZIKR.

## أول حساب Admin

لا يوجد حساب مستخدم تلقائيًا في قاعدة البيانات الجديدة. أنشئ الحساب الأول من لوحة Supabase:

1. افتح Authentication ثم Users.
2. اختر Add user، وأدخل بريد المالك، وأنشئ كلمة مرور قوية أو أرسل دعوة موثقة.
3. بعد إنشاء المستخدم، افتح SQL Editor ونفّذ الاستعلام التالي مع استبدال البريد ببريد المالك:

```sql
update public.profiles
set role = 'admin',
    is_active = true,
    max_discount_percent = 100
where id = (
  select id from auth.users
  where lower(email) = lower('OWNER_EMAIL_HERE')
  limit 1
);
```

4. سجّل الدخول من صفحة التطبيق. بعد دخول Admin يمكنه إنشاء المديرين والبائعين.

لا تنشئ حساب Admin من الواجهة العامة، ولا تضع كلمة المرور أو Service Role Key في GitHub أو متغيرات تبدأ بـ `NEXT_PUBLIC_`.

## متغيرات التشغيل

انسخ `.env.example` إلى `.env.local` في بيئة التطوير، وأضف:

- `NEXT_PUBLIC_SUPABASE_URL`: رابط مشروع BARTIKA.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: مفتاح anon العام من API Keys لمشروع BARTIKA فقط.
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET` — خادم فقط.
- `CLOUDINARY_FOLDER_MODE`: يطابق نمط Cloudinary (`fixed` أو `dynamic`).

## Cloudinary

المجلدات المخصصة التي تم تجهيزها في البيئة المتصلة:

- `bartika-jeans/products`
- `bartika-jeans/inventory`
- `bartika-jeans/general`

الشعار المحفوظ:
- Public ID: `bartika-jeans/general/bartika-brand-logo`
- Secure URL: `https://res.cloudinary.com/dcuveyab9/image/upload/v1794812757/bartika-jeans/general/bartika-brand-logo.webp`

رفع صور المنتجات موقّع من الخادم ويتطلب جلسة Admin. يقبل JPG وPNG وWebP حتى 10 ميجابايت.

> هذه المجلدات تعزل ملفات BARTIKA تنظيميًا داخل حساب Cloudinary المتصل، لكنها ليست Product Environment أو حسابًا مستقلًا. يلزم حساب/بيئة Cloudinary مخصصة عند توفرها، مع إضافة بياناتها إلى Vercel.

## ترحيلات قاعدة البيانات

الترحيلات مرتبة من `0001` حتى `0028` داخل `supabase/migrations`. تم تطبيقها على قاعدة BARTIKA المستقلة، بما فيها:

- البنية والبيع والمخزون والمشتريات والصلاحيات.
- تحسين RLS وإغلاق تنفيذ anon للدوال الحساسة.
- صور المنتجات وإعدادات المتجر.
- المنتجات متعددة المقاسات والألوان والتقارير المالية.
- ربط المبيعات بالورديات والاستبدال.
- حدود ائتمان العملاء والتحصيل اللاحق.
- دفتر سداد الموردين.
- الكتالوج العام وطلبات المتجر وحجز المخزون وحد الطلبات العامة حسب الهاتف وحماية POS من بيع الكميات المحجوزة.

لا تعِد تطبيق ترحيل سبق تطبيقه، ولا تنفذ أي ترحيل على مشروع ZIKR.

## المتجر العام والطلبات

- المسار العام: `/shop` (والجذر يوجه الزائر إليه).
- لوحة مراجعة الطلبات: `/online-orders` للأدمن فقط.
- الطلب يحجز الكمية مؤقتًا.
- تأكيد الطلب لا يخصم المخزون؛ التسليم هو الذي يخصم المخزون ويضيف حركة.
- الإلغاء يحرر الكمية المحجوزة.
- هذه النسخة لا تحصّل InstaPay/Visa عبر بوابة دفع ولا تحول الطلب تلقائيًا إلى فاتورة POS. يجب تأكيد الدفع يدويًا وتكامل الطلب مع دفتر المبيعات قبل الإطلاق التجاري.

## النشر والتشغيل

يحتاج النشر إلى:
- صلاحية Owner أو Project Create في فريق Vercel المتصل.
- إضافة متغيرات Supabase وCloudinary إلى Production وPreview وDevelopment.
- ربط مشروع Vercel بالمستودع `zikrofficial-X/BARTIKA-JEANS` وفرع `main`.
- التأكد من أن المستودع Private قبل إدخال بيانات حقيقية أو أسرار.
- إنشاء Admin أول واختبار حسابات الأدوار المختلفة.
- اختبار أجهزة الطباعة والباركود، والنسخ الاحتياطي والاستعادة.
