# تجهيز BARTIKA JEANS للإطلاق

## الخدمات المنفصلة عن ZIKR

- مستودع GitHub: `zikrofficial-X/BARTIKA-JEANS`.
- Supabase Project Ref: `gnebcwgaahwowxwiqqlj`.
- المنطقة: Frankfurt (`eu-central-1`).
- يجب استخدام بيانات BARTIKA فقط؛ لا تستخدم مفاتيح ZIKR.
- مجلدات Cloudinary الحالية: `bartika-jeans/products`, `bartika-jeans/inventory`, `bartika-jeans/general`. هذه مجلدات داخل الحساب المتصل وليست Product Environment مستقلة.

## إنشاء أول Admin

لا يوجد حساب Admin مؤكد بعد. أنشئ مستخدم المالك من Supabase Authentication > Users، ثم عيّن له الصلاحيات من SQL Editor بعد التحقق من البريد:

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

لا تنشئ مستخدمًا إداريًا من الواجهة العامة. لا تحفظ كلمة مرور أو Service Role Key في GitHub.

## متغيرات البيئة

للتشغيل المحلي انسخ `.env.example` إلى `.env.local`، وأضف:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET` (Server only)
- `CLOUDINARY_FOLDER_MODE` (`fixed` أو `dynamic` حسب إعداد Cloudinary الفعلي).

لا تستخدم Supabase Service Role أو Cloudinary API Secret في المتصفح أو متغير `NEXT_PUBLIC_*`.

## Cloudinary

الشعار الحالي:
- Public ID: `bartika-jeans/general/bartika-brand-logo`
- URL: `https://res.cloudinary.com/dcuveyab9/image/upload/v1794812757/bartika-jeans/general/bartika-brand-logo.webp`

رفع الصور موقّع من الخادم، ويتطلب إعداد مفاتيح Cloudinary الصحيحة. الحساب المتصل حاليًا مشترك تنظيميًا بمجلدات منفصلة؛ لم يتم إنشاء حساب أو Product Environment مستقل ولم تتوفر أسرار الرفع. لذلك لم يُتحقق من رفع صورة منتج حية من نهاية إلى نهاية.

## ترحيلات قاعدة البيانات

الترحيلات `0001` إلى `0041` موجودة في `supabase/migrations` ومطبقة على قاعدة BARTIKA. تشمل البنية والمبيعات والمخزون والعملاء والائتمان والمشتريات ودفتر الموردين والورديات والاستبدال والتقارير والمتجر الإلكتروني.
آخر ترحيلات المتجر:
- `0039`: لقطات بيانات المنتج والباركود والتكلفة، قفل idempotency وحماية حد الطلبات حسب الهاتف.
- `0040`: انتهاء الحجز غير المدفوع بعد 24 ساعة.
- `0041`: تنظيف الحجوزات قبل الطلبات العامة الجديدة وقبل تغييرات حالة الطلب من الأدمن.

راجع `supabase_migrations.schema_migrations` قبل تشغيل أي ترحيل جديد. لا تنفذ هذه الترحيلات على مشروع ZIKR.

## المتجر والطلبات الإلكترونية

- المتجر العام: `/shop`.
- لوحة إدارة الطلبات: `/online-orders` للأدمن فقط.
- الطلب الجديد يبدأ غير مدفوع ويحجز المخزون لمدة 24 ساعة.
- التنظيف ينفذ عند قراءة الكتالوج أو إرسال طلب جديد أو محاولة Admin تغيير حالة الطلب.
- تنتهي الحجوزات التي لم يسجل عليها أي تحصيل فقط. الطلبات ذات المدفوعات الجزئية لا تُلغى تلقائيًا؛ يعالجها Admin ويرد الأموال إن لزم الأمر قبل الإلغاء.
- تأكيد الطلب لا يخصم المخزون. التسليم يتطلب تحصيل كامل القيمة، ثم ينشئ فاتورة بيع مرتبطة ويخصم الحجز والمخزون ويسجل حركة.
- لا توجد بوابة دفع آلية؛ Admin يسجل التحصيل بعد التحقق من وصول Cash أو InstaPay أو Visa.
- رسوم الشحن يؤكدها المحل بشكل منفصل؛ إجمالي صفحة المتجر هو قيمة المنتجات فقط.

## النشر

لم يُنشأ مشروع Vercel لـ BARTIKA بعد. الحساب المتصل أظهر صلاحية غير كافية لإنشاء مشروع ضمن فريق `zikr3` في آخر محاولة. استكمال النشر يتطلب:
- Owner أو صلاحية Create Project في فريق Vercel الصحيح، أو ربط حساب Vercel مناسب.
- إعداد متغيرات Supabase وCloudinary في Production/Preview/Development.
- ربط Vercel بالمستودع `zikrofficial-X/BARTIKA-JEANS` وفرع `main`.
- نشر production والتأكد من نجاح البناء والـruntime والـAPI.

المستودع ما زال Public؛ غيّره إلى Private قبل إدخال بيانات تشغيل حقيقية أو أسرار.

## اختبارات ما قبل التشغيل

- إنشاء أول Admin وتجربة الأدوار.
- رفع صورة منتج إلى Cloudinary واختبار عرضها.
- اختبار البيع ومزيج وسائل الدفع والخصم والآجل والتحصيل.
- اختبار حجز الطلب الإلكتروني، انتهاء الحجز، التحصيل الجزئي والكامل، الإلغاء والتسليم.
- اختبار ورديتين نقديتين متزامنتين وإغلاق كل درج.
- اختبار الطابعة والباركود على الأجهزة الحقيقية.
- إعداد النسخ الاحتياطي واستعادة نسخة مجربة.
- إدخال المخزون الحقيقي بعد جرد افتتاحي.
- لا يوجد بيع Offline آمن أو مزامنة معاملات في هذا الإصدار.
