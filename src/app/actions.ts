"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/lib/auth";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=بيانات الدخول غير صحيحة");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const productSchema = z.object({
  name: z.string().trim().min(2),
  sku: z.string().trim().min(2),
  barcode: z.string().trim().optional(),
  category: z.string().trim().optional(),
  size: z.string().trim().optional(),
  color: z.string().trim().optional(),
  cost: z.coerce.number().finite().min(0),
  price: z.coerce.number().finite().positive(),
  qty: z.coerce.number().int().min(0),
  image_url: z.union([z.string().url(), z.literal("")]).optional(),
  image_public_id: z.union([z.string().trim().max(255), z.literal("")]).optional(),
});

export async function addProduct(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("راجع بيانات الصنف");

  const product = parsed.data;
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

  const { data, error } = await supabase.rpc("add_product_with_variant", {
    p_name: product.name,
    p_sku: product.sku,
    p_category: product.category || "جينز",
    p_cost_price: product.cost,
    p_sale_price: product.price,
    p_barcode: product.barcode || undefined,
    p_size: product.size || undefined,
    p_color: product.color || undefined,
    p_opening_quantity: product.qty,
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
      throw new Error("تم إنشاء الصنف لكن لم يرجع معرّف المنتج لحفظ الصورة");
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
}

const saleSchema = z.object({
  idempotency_key: z.string().uuid(),
  items: z.array(
    z.object({
      variant_id: z.string().uuid(),
      quantity: z.number().int().positive(),
    }),
  ).min(1),
  payments: z.array(
    z.object({
      method: z.enum(["cash", "instapay", "visa"]),
      amount: z.number().finite().positive(),
      reference: z.string().optional(),
    }),
  ),
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

export async function receivePurchase(formData: FormData) {
  const { supabase } = await requireAdmin();
  const variantId = String(formData.get("variant_id") || "");
  const supplierId = String(formData.get("supplier_id") || "");
  const quantity = Number(formData.get("quantity"));
  const unitCost = Number(formData.get("unit_cost"));
  const reference = String(formData.get("reference") || "");
  const paid = Number(formData.get("paid") || 0);

  if (
    !variantId ||
    !supplierId ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isFinite(unitCost) ||
    unitCost < 0 ||
    !Number.isFinite(paid) ||
    paid < 0
  ) {
    throw new Error("راجع بيانات فاتورة الشراء");
  }

  const { error } = await supabase.rpc("receive_purchase", {
    p_supplier_id: supplierId,
    p_reference: reference,
    p_items: [{ variant_id: variantId, quantity, unit_cost: unitCost }],
    p_paid: paid,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchases");
  revalidatePath("/inventory");
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
