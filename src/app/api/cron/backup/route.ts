import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { buildBackupJson, type Client } from "@/lib/backup";
import { cloudinaryEnv, uploadBackup } from "@/lib/cloudinary-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request, secret: string) {
  const given = Buffer.from(request.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

// Nightly job called by Vercel Cron. Refuses to run unless CRON_SECRET and the service role key are set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const env = cloudinaryEnv();
  if (!secret || !serviceKey || !url || !env) {
    return NextResponse.json({ error: "النسخ الليلي غير مفعّل: متغيرات البيئة ناقصة" }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { body, counts } = await buildBackupJson(admin as unknown as Client);
    const result = await uploadBackup(env, body);
    return NextResponse.json({ ok: true, publicId: result.publicId, bytes: result.bytes, deleted: result.deleted, kept: result.kept, counts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر النسخ" }, { status: 500 });
  }
}
