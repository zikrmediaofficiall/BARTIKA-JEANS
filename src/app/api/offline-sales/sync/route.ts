import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  idempotency_key: z.string().uuid(),
  items: z.array(z.object({
    variant_id: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1).max(100),
  payments: z.array(z.object({
    method: z.enum(["cash","instapay","visa"]),
    amount: z.number().finite().positive(),
    reference: z.string().optional(),
  })).min(1).max(2),
  discount_percent: z.number().finite().min(0).max(100),
  customer_phone: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "انتهت جلسة الدخول. اتصل بالإنترنت وسجل الدخول قبل المزامنة." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active,role")
    .eq("id", user.id)
    .maybeSingle();
  if (
    profileError ||
    !profile?.is_active ||
    (profile.role !== "admin" && profile.role !== "seller")
  ) {
    return NextResponse.json({ error: "الحساب غير نشط أو لا يملك صلاحية البيع." }, { status: 403 });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "بيانات المزامنة غير صحيحة" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "راجع بيانات الفاتورة المحفوظة دون اتصال" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_sale", {
    p_idempotency_key: parsed.data.idempotency_key,
    p_items: parsed.data.items,
    p_payments: parsed.data.payments,
    p_discount_percent: parsed.data.discount_percent,
    p_customer_phone: parsed.data.customer_phone || undefined,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ success: true, sale: data });
}
