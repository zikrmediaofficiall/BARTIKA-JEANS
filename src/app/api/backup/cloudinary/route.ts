import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildBackupJson, type Client } from "@/lib/backup";
import { cloudinaryEnv, uploadBackup } from "@/lib/cloudinary-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin-only "backup now": builds the full export and stores a private copy in Cloudinary.
export async function POST() {
  const { supabase } = await requireAdmin();
  const env = cloudinaryEnv();
  if (!env) {
    return NextResponse.json({ error: "إعدادات Cloudinary غير مكتملة على الخادم" }, { status: 503 });
  }
  try {
    const { body, counts } = await buildBackupJson(supabase as unknown as Client);
    const result = await uploadBackup(env, body);
    return NextResponse.json({ ok: true, ...result, counts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر أخذ النسخة" }, { status: 500 });
  }
}
