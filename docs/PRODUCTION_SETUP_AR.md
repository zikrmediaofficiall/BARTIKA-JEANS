# تجهيز BARTIKA JEANS للإطلاق

## فصل الخدمات عن ZIKR

- Supabase Project: BARTIKA-JEANS
- Supabase Project Ref: gnebcwgaahwowxwiqqlj
- Region: eu-central-1 (Frankfurt)
- قاعدة البيانات مخصصة لهذا المستودع فقط. لا تستخدم مفاتيح أو قاعدة ZIKR.
- صور BARTIKA تستخدم مجلد الجذر `bartika-jeans/` داخل Cloudinary، ولا ترفع ملفات إلى مجلدات ZIKR.

## أول حساب Admin

لا يوجد حساب مستخدم تلقائيًا في قاعدة البيانات الجديدة. أنشئ الحساب الأول من لوحة Supabase:

1. افتح Authentication ثم Users.
2. اختر Add user، وأدخل بريد المالك الذي سيستخدم Admin، وأنشئ كلمة مرور قوية أو أرسل دعوة موثقة.
3. بعد إنشاء المستخدم، افتح SQL Editor ونفّذ الاستعلام التالي مع استبدال البريد ببريد المالك نفسه:

```sql
update public.profiles
set role = 'admin',
    is_active = true,
    max_discount_percent = 100
where id = (
  select id
  from auth.users
  where lower(email) = lower('OWNER_EMAIL_HERE')
  limit 1
);
```

4. سجّل الدخول من صفحة التطبيق. بعد دخول Admin يمكنه إنشاء المديرين والبائعين من قسم الموظفين.

لا تنشئ حساب Admin من الواجهة العامة، ولا تضع كلمة المرور أو Service Role Key في GitHub أو في متغيرات تبدأ بـ `NEXT_PUBLIC_`.

## متغيرات التشغيل

انسخ `.env.example` إلى `.env.local` في بيئة التطوير، وأضف القيم التالية:

- `NEXT_PUBLIC_SUPABASE_URL`: رابط مشروع BARTIKA أعلاه.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: مفتاح anon العام من API Keys لمشروع BARTIKA فقط.
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET` — خادم فقط، لا يُعرض للمتصفح.
- `CLOUDINARY_FOLDER_MODE`: يجب أن يطابق نمط بيئة Cloudinary (fixed أو dynamic).

في Vercel، تُضاف المتغيرات نفسها إلى Production وPreview وDevelopment. لا تضف مفتاح Supabase الخاص بـ ZIKR، ولا Service Role Key إلى متغيرات المتصفح.

## Cloudinary

المجلدات المخصصة التي جهزت في البيئة المتصلة:

- `bartika-jeans/products`
- `bartika-jeans/inventory`
- `bartika-jeans/general`

رفع الصور موقّع من الخادم ويتطلب جلسة Admin. يقبل JPG وPNG وWebP حتى 10 ميجابايت. النطاق الحالي المستخدم في الروابط هو `res.cloudinary.com`.

> هذه المجلدات تعزل ملفات BARTIKA تنظيميًا عن ملفات ZIKR داخل حساب Cloudinary المتصل، لكنها ليست Product Environment أو حساب Cloudinary مستقلًا. يلزم ربط Cloudinary مستقل عند توفر حساب/بيئة مخصصة مستقلة.

## الترحيلات والتحقق

الترحيلات المطبقة على قاعدة BARTIKA:

- 0001 إلى 0010: البنية والعمليات والصلاحيات والبيع والمخزون والصور.
- 0011: ربط المصروف النقدي بدرج محدد أو بخزينة المحل العامة.
- 0012: حجب وصول anon إلى دوال RPC وتحسين RLS والفهارس.
- 0013: إغلاق استدعاء anon لدالة is_admin.

قبل فتح البيع الفعلي:
- أنشئ حساب Admin وادخل به.
- اختبر منتجًا تجريبيًا بصورة ومقاس ومخزون افتتاحي.
- اختبر بيعًا نقديًا وInstaPay وفيزا ودفعًا مختلطًا ومبلغًا آجلًا.
- اختبر ورديتين مفتوحتين مع مصروف عام ومصروف مربوط بدرج واحد.
- اختبر صلاحيات Admin وManager وSeller بحسابات منفصلة.

## ما لا يزال يحتاج إجراء من مالك الحساب

- السماح لحساب Vercel المتصل بإنشاء مشروع مستقل أو استخدام فريق/حساب Vercel يملك صلاحية Owner.
- توفير بيانات Cloudinary الخاصة بالبيئة المخصصة. لا توجد صلاحية عبر التكامل الحالي لإنشاء Product Environment جديدة.
- إنشاء حساب Admin الأول من Authentication كما هو موضح أعلاه.
