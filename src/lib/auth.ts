import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,role,is_active,max_discount_percent")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile };
}

export async function requireUser() {
  const context = await getSessionContext();
  if (!context.user || !context.profile?.is_active) {
    redirect("/login");
  }
  return context;
}

export async function requireAdmin() {
  const context = await requireUser();
  if (context.profile.role !== "admin") {
    redirect("/");
  }
  return context;
}

export async function hasPermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  role: string,
  permission: string,
) {
  if (role === "admin") return true;
  if (role !== "manager") return false;

  const { data, error } = await supabase.rpc("has_permission", {
    p_permission: permission,
  });
  if (error) {
    throw new Error(
      "تعذر التحقق من صلاحية المدير. تأكد من تطبيق ترحيل قاعدة البيانات 0007.",
    );
  }
  return data === true;
}

export async function requirePermission(permission: string) {
  const context = await requireUser();
  if (!(await hasPermission(context.supabase, context.profile.role, permission))) {
    redirect("/");
  }
  return context;
}
