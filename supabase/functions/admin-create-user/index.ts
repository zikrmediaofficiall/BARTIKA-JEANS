import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");

    if (!url || !anonKey || !serviceRoleKey || !authorization) {
      return json({ error: "إعدادات الخدمة أو جلسة الدخول غير مكتملة" }, 401);
    }

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser();

    if (userError || !user) {
      return json({ error: "يجب تسجيل الدخول" }, 401);
    }

    const { data: profile, error: profileError } = await caller
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin" || !profile.is_active) {
      return json({ error: "هذه العملية للأدمن فقط" }, 403);
    }

    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const requestedRole = String(body.role ?? "seller");
    const role = requestedRole === "manager" ? "manager" : requestedRole === "seller" ? "seller" : null;
    const discount = Number(body.max_discount_percent ?? 0);

    if (!role) {
      return json({ error: "يمكن إنشاء حساب Seller أو Manager فقط" }, 400);
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      password.length < 12 ||
      password.length > 128 ||
      !fullName ||
      fullName.length > 160 ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 100
    ) {
      return json(
        { error: "تحقق من البريد والاسم والخصم؛ كلمة المرور يجب ألا تقل عن 12 حرفًا والخصم بين 0 و100" },
        400,
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // This is an admin-provisioned account with a temporary password entered by
    // the owner. Confirm it immediately; the employee must change it after first login.
    // createUser does not send a confirmation email.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error || !data.user) {
      return json({ error: error?.message ?? "تعذر إنشاء المستخدم" }, 400);
    }

    const { error: profileUpsertError } = await admin.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      role,
      max_discount_percent: discount,
      is_active: true,
    });

    if (profileUpsertError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return json({ error: profileUpsertError.message }, 400);
    }

    return json({ ok: true, user_id: data.user.id, role });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "تعذر إنشاء الحساب" },
      400,
    );
  }
});
