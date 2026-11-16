"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/lib/auth";
import { normalizeVariantBarcodes } from "@/lib/barcode";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent("بيانات الدخول غير صحيحة")}`);
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const storeSettingsSchema = z.object({
  store_name: z.string().trim().min(2).max(100),
  store_name_ar: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(250),
  facebook_url: z.union([z.literal(""), z.string().url()]),
  instagram_url: z.union([z.literal(""), z.string().url()]),
  tiktok_url: z.union([z.literal(""), z.string().url()]),
  whatsapp_url: z.union([z.literal(""), z.string().url()]),
  instapay_ipa: z.string().trim().max(120),
  instapay_url: z.union([z.literal(""), z.string().url()]),
  exchange_days: z.coerce.number().int().min(0).max(30),
  quick_discount_percent: z.coerce.number().finite().min(0).max(20),
});

export async function updateStoreSettings(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = storeSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("راجع بيانات المتجر والروابط قبل الحفظ");
  }

  const values = parsed.data;
  const { data, error } = await supabase
    .from("store_settings")
    .update({
      store_name: values.store_name,
      store_name_ar: values.store_name_ar,
      phone: values.phone || null,
      address: values.address || null,
      facebook_url: values.facebook_url || null,
      instagram_url: values.instagram_url || null,
      tiktok_url: values.tiktok_url || null,
      whatsapp_url: values.whatsapp_url || null,
      instapay_ipa: values.instapay_ipa || null,
      instapay_url: values.instapay_url || null,
      exchange_days: values.exchange_days,
      quick_discount_percent: values.quick_discount_percent,
    })
    .eq("id", 1)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("لم يتم العثور على سجل إعدادات المتجر");

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/login");
}

const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(2).max(80),
  category: z.string().trim().max(80).optional(),
  cost: z.coerce.number().finite().min(0),
  price: z.coerce.number().finite().positive(),
  variants_json: z.string().min(2),
  image_url: z.union([z.string().url(), z.literal("")]).optional(),
  image_public_id: z.union([z.string().trim().max(255), z.literal("")]).optional(),
});

const productVariantSchema = z.object({
  size: z.string().trim().max(40),
  color: z.string().trim().max(60),
  barcode: z.string().trim().max(64),
  opening_quantity: z.number().int().min(0),
});

export async function addProduct(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("راجع بيانات المنتج والسعر");

  const product = parsed.data;
  let decodedVariants: unknown;
  try {
    decodedVariants = JSON.parse(product.variants_json);
  } catch {
    throw new Error("بيانات المقاسات والألوان غير صالحة");
  }

  const parsedVariants = z.array(productVariantSchema).min(1).max(100).safeParse(decodedVariants);
  if (!parsedVariants.success) {
    throw new Error("راجع المقاسات والألوان والباركود والكميات الافتتاحية");
  }

  const variants = normalizeVariantBarcodes(parsedVariants.data);
  const optionKeys = variants.map((variant) =>
    `${variant.size.normalize("NFKC").toLocaleLowerCase("ar")}::${variant.color.normalize("NFKC").toLocaleLowerCase("ar")}`,
  );
  if (new Set(optionKeys).size !== optionKeys.length) {
    throw new Error("لا يمكن تكرار نفس تركيبة المقاس واللون داخل المنتج");
  }

  const explicitBarcodes = variants
    .map((variant) => variant.barcode.trim().toLocaleLowerCase("en"))
    .filter(Boolean);
  if (new Set(explicitBarcodes).size !== explicitBarcodes.length) {
    throw new Error("لا يمكن تكرار الباركود داخل المنتج");
  }

  const imageUrl = product.image_url || "";
  const imagePublicId = product.image_public_id || "";

  if (Boolean(imageUrl) !== Boolean(imagePublicId)) {
    throw new Error("ارفع الصورة واحفظ رابطها ومعرّفها معًا");
  }

  if (imageUrl) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
      throw new Error("إعداد CLOUDINARY_CLOUD_NAME غير مكتمل على الخادم");
    }

    let parsedImageUrl: URL;
    try {
      parsedImageUrl = new URL(imageUrl);
    } catch {
      throw new Error("رابط صورة المنتج غير صالح");
    }

    if (
      parsedImageUrl.protocol !== "https:" ||
      parsedImageUrl.hostname !== "res.cloudinary.com" ||
      !parsedImageUrl.pathname.includes(`/${cloudName}/image/upload/`) ||
      !imagePublicId.startsWith("bartika-jeans/products/")
    ) {
      throw new Error("صورة المنتج يجب أن تكون من حساب Cloudinary ومجلد BARTIKA المخصص");
    }
  }

  const { data, error } = await supabase.rpc("add_product_with_variants", {
    p_name: product.name,
    p_sku: product.sku,
    p_category: product.category || "جينز",
    p_cost_price: product.cost,
    p_sale_price: product.price,
    p_variants: variants,
  });

  if (error) throw new Error(error.message);

  if (imageUrl && imagePublicId) {
    const productResult =
      data && typeof data === "object" && !Array.isArray(data) ? data : null;
    const productId =
      productResult && typeof productResult.product_id === "string"
        ? productResult.product_id
        : null;

    if (!productId) {
      throw new Error("تم إنشاء المنتج لكن لم يرجع معرّف المنتج لحفظ الصورة");
    }

    const { error: imageError } = await supabase
      .from("products")
      .update({ image_url: imageUrl, image_public_id: imagePublicId })
      .eq("id", productId);
    if (imageError) {
      throw new Error("تم إنشاء المنتج لكن تعذر حفظ مرجع الصورة: " + imageError.message);
    }
  }

  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/pos");
}

const saleSchema = z.object({
  idempotency_key: z.string().uuid(),
  items: z.array(
    z.object({
      variant_id: z.string().uuid(),
      quantity: z.number().int().positive(),
    }),
  ).min(1).max(100),
  payments: z.array(
    z.object({
      method: z.enum(["cash", "instapay", "visa"]),
      amount: z.number().finite().positive(),
      reference: z.string().max(120).optional(),
    }),
  ).max(10),
  discount_percent: z.number().finite().min(0).max(100),
  customer_phone: z.string().trim().optional(),
});

export async function checkoutSale(input: unknown) {
  const { supabase } = await requireUser();
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) throw new Error("بيانات الفاتورة غير صحيحة");

  const { data, error } = await supabase.rpc("create_sale", {
    p_idempotency_key: parsed.data.idempotency_key,
    p_items: parsed.data.items,
    p_payments: parsed.data.payments,
    p_discount_percent: parsed.data.discount_percent,
    p_customer_phone: parsed.data.customer_phone || undefined,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  return data;
}

const managerPermissionKeys = [
  "dashboard.read",
  "sales.read_all",
  "inventory.read",
  "purchases.read",
  "stocktake.read",
  "cash.read_all",
  "expenses.read",
  "customers.read",
  "staff.read",
  "exchanges.read",
  "reports.read",
] as const;

export async function updateManagerPermissions(formData: FormData) {
  const { supabase } = await requireAdmin();
  const managerId = String(formData.get("manager_id") || "");
  const requested = formData.getAll("permission").map(String);
  const uniquePermissions = [...new Set(requested)];

  if (!z.string().uuid().safeParse(managerId).success) {
    throw new Error("اختر حساب المدير بصورة صحيحة");
  }
  if (uniquePermissions.some((key) => !managerPermissionKeys.includes(key as (typeof managerPermissionKeys)[number]))) {
    throw new Error("توجد صلاحية غير معروفة");
  }

  const { error } = await supabase.rpc("set_manager_permissions", {
    p_manager_id: managerId,
    p_permission_keys: uniquePermissions,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/staff");
}

export async function addSupplier(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (name.length < 2) throw new Error("اسم المورد مطلوب");

  const { error } = await supabase.from("suppliers").insert({
    name,
    phone: phone || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchases");
}

const purchaseItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_cost: z.number().finite().min(0),
});

export async function receivePurchase(formData: FormData) {
  const { supabase } = await requireAdmin();
  const supplierId = String(formData.get("supplier_id") || "");
  const reference = String(formData.get("reference") || "").trim().slice(0, 120);
  const rawItems = String(formData.get("items_json") || "");
  if (!z.string().uuid().safeParse(supplierId).success) {
    throw new Error("اختر المورد بصورة صحيحة");
  }

  let decodedItems: unknown;
  try {
    decodedItems = JSON.parse(rawItems);
  } catch {
    throw new Error("تفاصيل بنود فاتورة الشراء غير صالحة");
  }

  const parsedItems = z.array(purchaseItemSchema).min(1).max(100).safeParse(decodedItems);
  if (!parsedItems.success) {
    throw new Error("راجع الأصناف والكميات وتكلفة كل قطعة");
  }

  const items = parsedItems.data;
  const variantIds = items.map((item) => item.variant_id);
  if (new Set(variantIds).size !== variantIds.length) {
    throw new Error("لا تكرر نفس المقاس/اللون في أكثر من سطر داخل الفاتورة");
  }

  const { error } = await supabase.rpc("receive_purchase", {
    p_supplier_id: supplierId,
    p_reference: reference,
    p_items: items,
    p_paid: 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/reports");
}

const exchangeItemInputSchema = z.object({
  sale_item_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  replacement_variant_id: z.union([z.string().uuid(), z.literal("")]),
});

export async function processSaleExchange(formData: FormData) {
  const { supabase, profile } = await requireUser();
  if (profile.role !== "admin" && profile.role !== "seller") {
    throw new Error("تنفيذ الاستبدال متاح للأدمن والبائعين فقط");
  }

  const originalSaleId = String(formData.get("original_sale_id") || "");
  const invoiceNumber = String(formData.get("invoice_number") || "");
  const reason = String(formData.get("reason") || "").trim();
  const exchangeType = z.enum(["voluntary", "defect", "nonconforming"]).parse(
    String(formData.get("exchange_type") || "voluntary"),
  );
  const rawItems = String(formData.get("items_json") || "");
  const settlementMethodValue = String(formData.get("settlement_method") || "");
  const settlementReference = String(formData.get("settlement_reference") || "").trim();

  if (!z.string().uuid().safeParse(originalSaleId).success) {
    throw new Error("الفاتورة الأصلية غير صحيحة");
  }
  if (reason.length < 4 || reason.length > 500) {
    throw new Error("اكتب سبب الاستبدال بصورة صحيحة");
  }

  let decodedItems: unknown;
  try {
    decodedItems = JSON.parse(rawItems);
  } catch {
    throw new Error("تفاصيل أصناف الاستبدال غير صالحة");
  }

  const parsedItems = z.array(exchangeItemInputSchema).min(1).max(50).safeParse(decodedItems);
  if (!parsedItems.success) {
    throw new Error("راجع القطع المرتجعة والكميات والبدائل");
  }

  if (new Set(parsedItems.data.map((item) => item.sale_item_id)).size !== parsedItems.data.length) {
    throw new Error("لا تكرر بند الفاتورة نفسه؛ اجمع الكمية في سطر واحد");
  }

  const settlementMethod = settlementMethodValue
    ? z.enum(["cash", "instapay", "visa"]).parse(settlementMethodValue)
    : null;

  if (settlementMethod && settlementMethod !== "cash" && settlementReference.length < 3) {
    throw new Error("أدخل مرجع التحويل أو الفيزا لتوثيق التسوية");
  }

  const { error } = await supabase.rpc("process_sale_exchange", {
    p_original_sale_id: originalSaleId,
    p_reason: reason,
    p_exchange_type: exchangeType,
    p_items: parsedItems.data,
    p_settlement_method: settlementMethod ?? undefined,
    p_settlement_reference: settlementReference || undefined,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/exchanges");
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  revalidatePath("/cash");
  revalidatePath("/reports");

  redirect(`/exchanges?invoice=${encodeURIComponent(invoiceNumber)}&success=1`);
}

const customerInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(30),
  email: z.union([z.literal(""), z.string().email().max(160)]),
  address: z.string().trim().max(300),
  notes: z.string().trim().max(1000),
  credit_limit: z.coerce.number().finite().min(0).max(100000000),
});

export async function addCustomer(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = customerInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("راجع بيانات العميل وحد الائتمان");

  const values = parsed.data;
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      name: values.name,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      notes: values.notes || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { error: creditError } = await supabase
    .from("customer_credit_accounts")
    .upsert({
      customer_id: customer.id,
      credit_limit: values.credit_limit,
    });
  if (creditError) throw new Error(creditError.message);

  revalidatePath("/customers");
}

export async function updateCustomerCreditLimit(formData: FormData) {
  const { supabase } = await requireAdmin();
  const customerId = String(formData.get("customer_id") || "");
  const creditLimit = Number(formData.get("credit_limit"));

  if (!z.string().uuid().safeParse(customerId).success) {
    throw new Error("ملف العميل غير صحيح");
  }
  if (!Number.isFinite(creditLimit) || creditLimit < 0 || creditLimit > 100000000) {
    throw new Error("حد الائتمان غير صحيح");
  }

  const { data: dueRows, error: dueError } = await supabase
    .from("sales")
    .select("due")
    .eq("customer_id", customerId)
    .eq("status", "completed");
  if (dueError) throw new Error(dueError.message);

  const outstanding = (dueRows || []).reduce(
    (sum, sale) => sum + Number(sale.due),
    0,
  );
  if (creditLimit < outstanding) {
    throw new Error(
      "لا يمكن خفض حد الائتمان عن الرصيد المستحق الحالي: " +
        outstanding.toFixed(2) +
        " ج.م",
    );
  }

  const { error } = await supabase
    .from("customer_credit_accounts")
    .upsert({
      customer_id: customerId,
      credit_limit: creditLimit,
    });
  if (error) throw new Error(error.message);

  revalidatePath("/customers");
  revalidatePath("/customers/" + customerId);
}

export async function collectSaleDue(formData: FormData) {
  const { supabase, profile } = await requireUser();
  if (profile.role !== "admin" && profile.role !== "seller") {
    throw new Error("تحصيل الأرصدة متاح للأدمن والبائعين فقط");
  }

  const saleId = String(formData.get("sale_id") || "");
  const amount = Number(formData.get("amount"));
  const method = z.enum(["cash", "instapay", "visa"]).parse(
    String(formData.get("method") || ""),
  );
  const reference = String(formData.get("reference") || "").trim();
  const idempotencyKey = String(formData.get("idempotency_key") || "");

  if (!z.string().uuid().safeParse(saleId).success) {
    throw new Error("الفاتورة غير صحيحة");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("مبلغ التحصيل غير صحيح");
  }
  if (!z.string().uuid().safeParse(idempotencyKey).success) {
    throw new Error("معرّف التحصيل غير صالح؛ حدّث الصفحة وأعد المحاولة");
  }
  if (method !== "cash" && reference.length < 3) {
    throw new Error("مرجع التحويل أو الفيزا مطلوب");
  }

  const { error } = await supabase.rpc("collect_sale_due", {
    p_sale_id: saleId,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/customers");
  revalidatePath("/invoices");
  revalidatePath("/cash");
  revalidatePath("/reports");
}

export async function recordSupplierPayment(formData: FormData) {
  const { supabase } = await requireAdmin();
  const invoiceId = String(formData.get("purchase_invoice_id") || "");
  const amount = Number(formData.get("amount"));
  const method = z.enum(["cash", "instapay", "visa"]).parse(
    String(formData.get("method") || ""),
  );
  const reference = String(formData.get("reference") || "").trim();
  const cashSessionId = String(formData.get("cash_session_id") || "").trim();
  const idempotencyKey = String(formData.get("idempotency_key") || "");

  if (!z.string().uuid().safeParse(invoiceId).success) {
    throw new Error("فاتورة المورد غير صحيحة");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("قيمة السداد غير صحيحة");
  }
  if (!z.string().uuid().safeParse(idempotencyKey).success) {
    throw new Error("معرّف السداد غير صالح؛ حدّث الصفحة وأعد المحاولة");
  }
  if (method !== "cash" && reference.length < 3) {
    throw new Error("مرجع التحويل أو الفيزا مطلوب");
  }
  if (cashSessionId && (!z.string().uuid().safeParse(cashSessionId).success || method !== "cash")) {
    throw new Error("اختيار درج الكاش غير صالح");
  }

  const { error } = await supabase.rpc("record_supplier_payment", {
    p_purchase_invoice_id: invoiceId,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
    ...(cashSessionId ? { p_cash_session_id: cashSessionId } : {}),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/purchases");
  revalidatePath("/suppliers");
  revalidatePath("/cash");
  revalidatePath("/reports");
}

export async function createOnlineOrder(formData: FormData) {
  const supabase = await createClient();
  const customerName = String(formData.get("customer_name") || "").trim();
  const customerPhone = String(formData.get("customer_phone") || "").trim();
  const deliveryMethod = z.enum(["delivery", "pickup"]).parse(
    String(formData.get("delivery_method") || ""),
  );
  const paymentPreference = z.enum(["cod", "instapay", "visa", "pickup_cash"]).parse(
    String(formData.get("payment_preference") || ""),
  );
  const address = String(formData.get("delivery_address") || "").trim();
  const shippingZoneRaw = String(formData.get("shipping_zone_id") || "").trim();
  const shippingZoneId = deliveryMethod === "delivery" ? shippingZoneRaw : null;
  const notes = String(formData.get("customer_notes") || "").trim();
  const rawItems = String(formData.get("items_json") || "[]");
  const idempotencyKey = String(formData.get("idempotency_key") || "");

  if (customerName.length < 2 || customerName.length > 160) {
    throw new Error("أدخل اسمًا صحيحًا");
  }
  if (!z.string().uuid().safeParse(idempotencyKey).success) {
    throw new Error("تعذر إنشاء رقم الطلب؛ حدّث الصفحة وحاول مرة أخرى");
  }
  if (deliveryMethod === "delivery") {
    if (address.length < 5) throw new Error("عنوان التوصيل مطلوب");
    if (!z.string().uuid().safeParse(shippingZoneId).success) {
      throw new Error("اختر منطقة التوصيل");
    }
    if (paymentPreference === "pickup_cash") {
      throw new Error("طريقة الدفع النقدي عند الفرع لا تتوافق مع التوصيل");
    }
  } else if (paymentPreference === "cod") {
    throw new Error("اختر الدفع نقدًا عند الاستلام من الفرع");
  }

  const itemsSchema = z.array(z.object({
    variant_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(10),
  })).min(1).max(20);
  let raw: unknown;
  try { raw = JSON.parse(rawItems); } catch { throw new Error("بيانات السلة غير صحيحة"); }
  const parsedItems = itemsSchema.safeParse(raw);
  if (!parsedItems.success) throw new Error("راجع أصناف وكميات الطلب");

  const { data, error } = await supabase.rpc("create_online_order", {
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_delivery_method: deliveryMethod,
    p_delivery_address: address,
    p_customer_notes: notes,
    p_items: parsedItems.data,
    p_idempotency_key: idempotencyKey,
    p_shipping_zone_id: shippingZoneId,
    p_payment_preference: paymentPreference,
  });
  if (error) throw new Error(error.message);

  const result = data as { order_number?: number; total?: number; shipping_amount?: number };
  if (!result?.order_number) throw new Error("تم إرسال الطلب لكن تعذر قراءة رقم الطلب");
  redirect("/shop/confirmation?order=" + result.order_number);
}

export async function setOnlineOrderStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const orderId = String(formData.get("order_id") || "");
  const status = z.enum(["confirmed", "cancelled", "fulfilled"]).parse(
    String(formData.get("status") || ""),
  );
  if (!z.string().uuid().safeParse(orderId).success) throw new Error("رقم الطلب غير صحيح");
  const { error } = await supabase.rpc("set_online_order_status", {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/online-orders");
  revalidatePath("/shop");
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  revalidatePath("/customers");
  revalidatePath("/reports");
  revalidatePath("/cash");
}

export async function recordOnlineOrderPayment(formData: FormData) {
  const { supabase } = await requireAdmin();
  const orderId = String(formData.get("order_id") || "");
  const amount = Number(formData.get("amount"));
  const method = z.enum(["cash", "instapay", "visa"]).parse(String(formData.get("method") || ""));
  const reference = String(formData.get("reference") || "").trim();
  const cashSessionId = String(formData.get("cash_session_id") || "").trim();
  const idempotencyKey = String(formData.get("idempotency_key") || "");

  if (!z.string().uuid().safeParse(orderId).success) throw new Error("رقم الطلب غير صحيح");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("قيمة التحصيل غير صحيحة");
  if (!z.string().uuid().safeParse(idempotencyKey).success) throw new Error("معرف التحصيل غير صالح");
  if (method !== "cash" && reference.length < 3) throw new Error("مرجع التحويل أو الفيزا مطلوب");
  if (cashSessionId && (!z.string().uuid().safeParse(cashSessionId).success || method !== "cash")) {
    throw new Error("درج النقدية المحدد غير صالح");
  }

  const { error } = await supabase.rpc("record_online_order_payment", {
    p_order_id: orderId,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
    ...(cashSessionId ? { p_cash_session_id: cashSessionId } : {}),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/online-orders");
  revalidatePath("/cash");
  revalidatePath("/reports");
}

export async function recordOnlineOrderRefund(formData: FormData) {
  const { supabase } = await requireAdmin();
  const orderId = String(formData.get("order_id") || "");
  const amount = Number(formData.get("amount"));
  const method = z.enum(["cash", "instapay", "visa"]).parse(String(formData.get("method") || ""));
  const reference = String(formData.get("reference") || "").trim();
  const cashSessionId = String(formData.get("cash_session_id") || "").trim();
  const idempotencyKey = String(formData.get("idempotency_key") || "");

  if (!z.string().uuid().safeParse(orderId).success) throw new Error("رقم الطلب غير صحيح");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("قيمة الرد غير صحيحة");
  if (!z.string().uuid().safeParse(idempotencyKey).success) throw new Error("معرف الرد غير صالح");
  if (method !== "cash" && reference.length < 3) throw new Error("مرجع رد التحويل مطلوب");
  if (cashSessionId && (!z.string().uuid().safeParse(cashSessionId).success || method !== "cash")) {
    throw new Error("درج النقدية المحدد غير صالح");
  }

  const { error } = await supabase.rpc("record_online_order_refund", {
    p_order_id: orderId,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
    ...(cashSessionId ? { p_cash_session_id: cashSessionId } : {}),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/online-orders");
  revalidatePath("/cash");
  revalidatePath("/reports");
}

export async function startStocktake(formData: FormData) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("start_stocktake", {
    p_notes: String(formData.get("notes") || ""),
  });
  if (error) throw new Error(error.message);
  redirect("/stocktake/" + data);
}

export async function setStocktakeCount(formData: FormData) {
  const { supabase } = await requireAdmin();
  const stocktakeId = String(formData.get("stocktake_id"));
  const { error } = await supabase.rpc("set_stocktake_count", {
    p_stocktake_id: stocktakeId,
    p_variant_id: String(formData.get("variant_id")),
    p_actual_quantity: Number(formData.get("actual_quantity")),
    p_reason: String(formData.get("reason") || ""),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/stocktake/" + stocktakeId);
}

export async function approveStocktake(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("stocktake_id"));
  const { error } = await supabase.rpc("approve_stocktake", {
    p_stocktake_id: id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/stocktake");
  revalidatePath("/inventory");
  redirect("/stocktake");
}

export async function openCashSession(formData: FormData) {
  const { supabase } = await requireUser();
  const openingCash = Number(formData.get("opening_cash") || 0);
  if (!Number.isFinite(openingCash) || openingCash < 0) {
    throw new Error("رصيد بداية الوردية غير صحيح");
  }
  const { error } = await supabase.rpc("open_cash_session", {
    p_opening_cash: openingCash,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/cash");
}

export async function closeCashSession(formData: FormData) {
  const { supabase } = await requireUser();
  const countedCash = Number(formData.get("counted_cash"));
  if (!Number.isFinite(countedCash) || countedCash < 0) {
    throw new Error("النقدية الفعلية غير صحيحة");
  }
  const { error } = await supabase.rpc("close_cash_session", {
    p_session_id: String(formData.get("session_id")),
    p_counted_cash: countedCash,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/cash");
}

export async function addExpense(formData: FormData) {
  const { supabase } = await requireAdmin();
  const cashSessionValue = String(formData.get("cash_session_id") || "").trim();
  const cashSessionId = cashSessionValue || null;
  const method = z.enum(["cash", "instapay", "visa"]).parse(
    String(formData.get("method") || "cash"),
  );

  if (cashSessionId && !z.string().uuid().safeParse(cashSessionId).success) {
    throw new Error("اختيار الوردية غير صحيح");
  }
  if (cashSessionId && method !== "cash") {
    throw new Error("لا يمكن ربط مصروف InstaPay أو الفيزا بدرج الكاش");
  }

  const common = {
    p_category: String(formData.get("category") || "").trim(),
    p_description: String(formData.get("description") || "").trim(),
    p_amount: Number(formData.get("amount")),
    p_method: method,
  };

  const result = cashSessionId
    ? await supabase.rpc("add_expense", {
        ...common,
        p_cash_session_id: cashSessionId,
      })
    : await supabase.rpc("add_expense", common);

  if (result.error) throw new Error(result.error.message);
  revalidatePath("/cash");
  revalidatePath("/reports");
}


export async function addShippingCompany(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("contact_phone") || "").trim();
  const trackingTemplate = String(formData.get("tracking_url_template") || "").trim();
  if (name.length < 2 || name.length > 120) throw new Error("اسم شركة الشحن غير صحيح");
  if (phone.length > 30 || trackingTemplate.length > 500) throw new Error("راجع بيانات التواصل أو رابط التتبع");
  if (trackingTemplate && !/^https:\/\//i.test(trackingTemplate)) {
    throw new Error("رابط التتبع يجب أن يبدأ بـ https://");
  }
  const { error } = await supabase.from("shipping_companies").insert({
    name,
    contact_phone: phone || null,
    tracking_url_template: trackingTemplate || null,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/shipping");
  revalidatePath("/shop");
}

export async function addShippingZone(formData: FormData) {
  const { supabase } = await requireAdmin();
  const companyId = String(formData.get("company_id") || "");
  const name = String(formData.get("name") || "").trim();
  const fee = Number(formData.get("fee"));
  const freeRaw = String(formData.get("free_shipping_threshold") || "").trim();
  const freeThreshold = freeRaw ? Number(freeRaw) : null;
  const sortOrder = Number(formData.get("sort_order") || 0);
  if (!z.string().uuid().safeParse(companyId).success) throw new Error("اختر شركة شحن صحيحة");
  if (name.length < 2 || name.length > 120) throw new Error("اسم المنطقة غير صحيح");
  if (!Number.isFinite(fee) || fee < 0) throw new Error("رسوم الشحن غير صحيحة");
  if (freeThreshold !== null && (!Number.isFinite(freeThreshold) || freeThreshold < 0)) {
    throw new Error("حد الشحن المجاني غير صحيح");
  }
  const { error } = await supabase.from("shipping_zones").insert({
    company_id: companyId,
    name,
    fee,
    free_shipping_threshold: freeThreshold,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/shipping");
  revalidatePath("/shop");
}

export async function updateShippingZone(formData: FormData) {
  const { supabase } = await requireAdmin();
  const zoneId = String(formData.get("zone_id") || "");
  const name = String(formData.get("name") || "").trim();
  const fee = Number(formData.get("fee"));
  const freeRaw = String(formData.get("free_shipping_threshold") || "").trim();
  const freeThreshold = freeRaw ? Number(freeRaw) : null;
  const active = String(formData.get("is_active") || "true") === "true";
  if (!z.string().uuid().safeParse(zoneId).success) throw new Error("منطقة الشحن غير صحيحة");
  if (name.length < 2 || name.length > 120 || !Number.isFinite(fee) || fee < 0) {
    throw new Error("راجع اسم المنطقة ورسوم الشحن");
  }
  if (freeThreshold !== null && (!Number.isFinite(freeThreshold) || freeThreshold < 0)) {
    throw new Error("حد الشحن المجاني غير صحيح");
  }
  const { error } = await supabase.from("shipping_zones").update({
    name,
    fee,
    free_shipping_threshold: freeThreshold,
    is_active: active,
  }).eq("id", zoneId);
  if (error) throw new Error(error.message);
  revalidatePath("/shipping");
  revalidatePath("/shop");
}

export async function setShippingCompanyActive(formData: FormData) {
  const { supabase } = await requireAdmin();
  const companyId = String(formData.get("company_id") || "");
  const active = String(formData.get("is_active") || "false") === "true";
  if (!z.string().uuid().safeParse(companyId).success) throw new Error("شركة الشحن غير صحيحة");
  const { error } = await supabase.from("shipping_companies").update({ is_active: active }).eq("id", companyId);
  if (error) throw new Error(error.message);
  revalidatePath("/shipping");
  revalidatePath("/shop");
}
