import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// Backups go to a separate folder, type "authenticated" (no public URL), never under the product folder.
export const BACKUP_FOLDER = "bartika-jeans/backups";
export const BACKUP_KEEP = 30;
const MAX_RAW_BYTES = 10 * 1024 * 1024; // Cloudinary free plan raw file limit

type Env = { cloudName: string; apiKey: string; apiSecret: string; folderMode: "fixed" | "dynamic" };

export function cloudinaryEnv(): Env | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folderMode = process.env.CLOUDINARY_FOLDER_MODE;
  if (!cloudName || !apiKey || !apiSecret) return null;
  if (folderMode !== "fixed" && folderMode !== "dynamic") return null;
  return { cloudName, apiKey, apiSecret, folderMode };
}

function sign(params: Record<string, string>, secret: string) {
  const text =
    Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&") + secret;
  return createHash("sha1").update(text).digest("hex");
}

function basic(env: Env) {
  return "Basic " + Buffer.from(`${env.apiKey}:${env.apiSecret}`).toString("base64");
}

export type BackupResult = {
  publicId: string;
  bytes: number;
  rawBytes: number;
  deliveryUrl: string;
  unsignedStatus: number | null;
  privateOk: boolean;
  deleted: number;
  kept: number;
};

export async function uploadBackup(env: Env, json: string): Promise<BackupResult> {
  const gz = gzipSync(Buffer.from(json, "utf8"));
  if (gz.length > MAX_RAW_BYTES) {
    throw new Error(
      `حجم النسخة بعد الضغط ${(gz.length / 1048576).toFixed(1)}MB أكبر من حد Cloudinary المجاني (10MB). حمّل النسخة محليًا أو رقّ الخطة.`,
    );
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const publicId = `${BACKUP_FOLDER}/bartika-backup-${stamp}.json.gz`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = { public_id: publicId, timestamp, type: "authenticated" };
  if (env.folderMode === "dynamic") params.asset_folder = BACKUP_FOLDER;

  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append("api_key", env.apiKey);
  form.append("signature", sign(params, env.apiSecret));
  form.append("file", new Blob([new Uint8Array(gz)], { type: "application/gzip" }), "backup.json.gz");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudName}/raw/upload`, {
    method: "POST",
    body: form,
  });
  const out = (await res.json()) as {
    public_id?: string;
    secure_url?: string;
    type?: string;
    bytes?: number;
    error?: { message?: string };
  };
  if (!res.ok || !out.public_id || !out.secure_url) {
    throw new Error("فشل رفع النسخة إلى Cloudinary: " + (out.error?.message || res.status));
  }
  if (out.type !== "authenticated") {
    await deleteIds(env, [out.public_id]);
    throw new Error("Cloudinary لم يحفظ الملف كنوع authenticated، تم حذفه. لم تُحفظ نسخة.");
  }

  // The plain delivery URL must be refused (no signature).
  let unsignedStatus: number | null = null;
  try {
    const head = await fetch(out.secure_url, { method: "GET", redirect: "manual", cache: "no-store" });
    unsignedStatus = head.status;
    await head.body?.cancel();
  } catch {
    unsignedStatus = null;
  }
  const privateOk = unsignedStatus !== null && unsignedStatus >= 400;
  if (!privateOk) {
    await deleteIds(env, [out.public_id]);
    throw new Error("الرابط غير الموقّع لم يُرفض (الحالة " + unsignedStatus + ")، تم حذف الملف حفاظًا على الخصوصية.");
  }

  const { deleted, kept } = await pruneBackups(env, BACKUP_KEEP);
  return {
    publicId: out.public_id,
    bytes: gz.length,
    rawBytes: Buffer.byteLength(json),
    deliveryUrl: "(خاص، لا يعمل بدون توقيع)",
    unsignedStatus,
    privateOk,
    deleted,
    kept,
  };
}

async function deleteIds(env: Env, ids: string[]) {
  const q = ids.map((id) => "public_ids[]=" + encodeURIComponent(id)).join("&");
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${env.cloudName}/resources/raw/authenticated?${q}`,
    { method: "DELETE", headers: { Authorization: basic(env) } },
  );
  if (!res.ok) throw new Error("تعذر حذف نسخ قديمة من Cloudinary: " + res.status);
}

/** Keep only the newest `keep` files in the backup folder. Only touches raw/authenticated under BACKUP_FOLDER. */
export async function pruneBackups(env: Env, keep: number): Promise<{ deleted: number; kept: number }> {
  const items: { public_id: string; created_at: string }[] = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const url =
      `https://api.cloudinary.com/v1_1/${env.cloudName}/resources/raw/authenticated` +
      `?prefix=${encodeURIComponent(BACKUP_FOLDER + "/")}&max_results=500` +
      (cursor ? `&next_cursor=${encodeURIComponent(cursor)}` : "");
    const res = await fetch(url, { headers: { Authorization: basic(env) }, cache: "no-store" });
    if (!res.ok) throw new Error("تعذر قراءة قائمة النسخ من Cloudinary: " + res.status);
    const page = (await res.json()) as {
      resources?: { public_id: string; created_at: string }[];
      next_cursor?: string;
    };
    items.push(...(page.resources || []));
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  const mine = items.filter((r) => r.public_id.startsWith(BACKUP_FOLDER + "/bartika-backup-"));
  mine.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const old = mine.slice(keep).map((r) => r.public_id);
  for (let i = 0; i < old.length; i += 50) await deleteIds(env, old.slice(i, i + 50));
  return { deleted: old.length, kept: Math.min(keep, mine.length) };
}
