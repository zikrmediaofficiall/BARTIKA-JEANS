# تجهيز BARTIKA JEANS للإطلاق

آخر تحديث: 16 نوفمبر 2026. استخدم هذا الملف مع `docs/IMPLEMENTATION_STATUS_AR.md`.

## الخدمات والدومين

- GitHub: `zikrofficial-X/BARTIKA-JEANS` (المستودع ما زال Public ويجب تحويله إلى Private).
- Supabase Project Ref: `gnebcwgaahwowxwiqqlj`، المنطقة Frankfurt (`eu-central-1`).
- Vercel Project: `bartika-jeans`، مربوط بالمستودع وفرع `main`.
- Production domain: `https://bartika-jeans.vercel.app`.
- آخر Production Deployment: `dpl_Bo8o2pqJ4kwJx22LbUAEYVNpHN9m`، الحالة READY، Commit `b3559c7715ce514b513184ceb71d9d2445d10f55`.
- لا تستخدم مفاتيح ZIKR أو Project Ref الخاص به.

## حساب Admin

تم إنشاء حساب المالك والتحقق من البريد، ثم تعيين `public.profiles.role = 'admin'` وتفعيل الحساب. يجب على المالك تسجيل الخروج ثم الدخول مرة أخرى بعد أي تغيير في الدور لتحديث الواجهة والجلسة.

لا تحفظ كلمة المرور أو Service Role Key في GitHub أو SQL أو ملفات التوثيق.

## متغيرات Vercel

متغيرات Supabase اللازمة موجودة في Production.

تمت إضافة:
- `CLOUDINARY_CLOUD_NAME=lnsnp6km` إلى Production وPreview وDevelopment.

ما زال مطلوبًا من مالك حساب Cloudinary:
- `CLOUDINARY_API_KEY` (Encrypted / Secret).
- `CLOUDINARY_API_SECRET` (Sensitive / Secret؛ Server only).
- `CLOUDINARY_FOLDER_MODE` (`fixed` أو `dynamic` بحسب إعداد الحساب الفعلي).

لا تضع `CLOUDINARY_API_SECRET` أو Supabase Service Role في `NEXT_PUBLIC_*` أو Git.

بعد إدخال هذه القيم، أعد نشر Vercel ثم اختبر:
1. فتح صفحة المنتجات بحساب Admin.
2. طلب توقيع الرفع من `POST /api/cloudinary/signature`.
3. رفع صورة JPG/PNG/WebP لا تتجاوز 10 MB إلى `bartika-jeans/products`.
4. التأكد أن Public ID يقع تحت المجلد وأن رابط HTTPS يُحفظ على المنتج.
5. إعادة فتح المنتج من صفحة الإدارة والمتجر العام والتحقق من الصورة.

## Cloudinary

- الحساب المتصل: `lnsnp6km` على الخطة المجانية.
- مجلدات موجودة: `bartika-jeans/products`, `bartika-jeans/inventory`, `bartika-jeans/general`.
- الصورة التي زود بها المالك موجودة تحت Public ID `1000062284` في جذر الحساب؛ لم يتم تعيينها كصورة منتج أو شعار.
- كود الرفع الموقّع موجود في `src/app/api/cloudinary/signature/route.ts` ويتطلب Admin.
- رابط شعار المتجر الحالي من Cloud Name آخر (`dcuveyab9`). لا تغيّره قبل توفير ملف شعار معتمد ورفعه إلى حساب BARTIKA المعتمد.
- هذه المجلدات تنظيم داخل الحساب المتصل وليست Product Environment مستقلة.

## قاعدة البيانات والترحيلات

الترحيلات `0001` إلى `0041` موجودة في `supabase/migrations` ومطبقة على قاعدة BARTIKA. آخر ترحيلات المتجر:
- `0039`: لقطات بيانات المنتج والباركود والتكلفة، قفل idempotency وحماية حد الطلبات حسب الهاتف.
- `0040`: انتهاء الحجز غير المدفوع بعد 24 ساعة.
- `0041`: تنظيف الحجوزات قبل الطلبات الجديدة وتغييرات الحالة من Admin.

راجع `supabase_migrations.schema_migrations` قبل تشغيل أي ترحيل. لا تشغّل هذه الترحيلات على مشروع ZIKR.

## المتجر والطلبات

- المتجر العام: `/shop`.
- لوحة إدارة الطلبات: `/online-orders` للأدمن فقط.
- الطلب الجديد يبدأ غير مدفوع ويحجز المخزون لمدة 24 ساعة.
- التنظيف ينفذ عند قراءة الكتالوج أو إرسال طلب جديد أو محاولة Admin تغيير الحالة.
- الطلب غير المدفوع بالكامل تنتهي مدة حجزه ويُحرر المخزون؛ الطلب ذو الدفع الجزئي لا يُلغى تلقائيًا.
- لا يتم التسليم قبل تسجيل التحصيل الكامل؛ بعدها يُنشأ سجل بيع مرتبط بالطلب.
- لا توجد بوابة دفع آلية؛ Admin يسجل التحصيل بعد التحقق الفعلي من Cash أو InstaPay أو Visa.
- رسوم الشحن يحددها المحل عند التواصل مع العميل.

## إعدادات المتجر

يوجد صف إعدادات افتراضي باسم BARTIKA JEANS، مع روابط تواصل ووسيلة InstaPay. ما زال رقم هاتف الفرع والعنوان فارغين، ويلزم إدخالهما من `/settings` بعد اعتماد المالك.

لا تعدّل روابط الدفع أو السياسات أو رسوم التوصيل اعتمادًا على التخمين.

## البريد وتسجيل الدخول

- صفحة الدخول: `/login`.
- صفحة الاستعادة: `/forgot-password`.
- تدفق إعادة تعيين كلمة المرور يعود إلى الدومين الأساسي.
- خدمة البريد الافتراضية في Supabase تجاوزت حد الإرسال أثناء اختبار الاستعادة. يلزم إعداد Custom SMTP موثوق وإبقاء Confirm Email مفعّلًا.
- Leaked Password Protection لم يُفعّل بعد في Supabase Auth.

## اختبارات ما قبل التشغيل

- [ ] تحويل GitHub repository إلى Private.
- [ ] إضافة مفاتيح Cloudinary وتأكيد Folder Mode واختبار رفع صورة حقيقية.
- [ ] تفعيل Custom SMTP وLeaked Password Protection.
- [ ] إدخال رقم الهاتف والعنوان وسياسات المتجر المعتمدة.
- [ ] إنشاء المنتجات والمقاسات والألوان والباركود والأسعار والتكاليف الفعلية.
- [ ] جرد افتتاحي وإدخال المخزون.
- [ ] اختبار Admin / Manager / Seller والصلاحيات.
- [ ] اختبار البيع والدفع المختلط والخصم والآجل والتحصيل.
- [ ] اختبار ورديتين نقديتين وإغلاق كل درج.
- [ ] اختبار الطلب الإلكتروني والحجز والتحصيل الجزئي والكامل والإلغاء والتسليم.
- [ ] اختبار الطابعة والباركود والماسح على أجهزة المحل.
- [ ] إعداد نسخة احتياطية مشفرة وتنفيذ استعادة مثبتة.

لا يوجد بيع Offline آمن أو مزامنة معاملات في هذا الإصدار.
