import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await requireAdmin();

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folderMode = process.env.CLOUDINARY_FOLDER_MODE;

  if (
    !cloudName ||
    !apiKey ||
    !apiSecret ||
    (folderMode !== "fixed" && folderMode !== "dynamic")
  ) {
    return NextResponse.json(
      {
        error:
          "إعدادات Cloudinary غير مكتملة. أضف بيانات الحساب وحدد CLOUDINARY_FOLDER_MODE إلى fixed أو dynamic حسب إعداد البيئة.",
      },
      { status: 503 },
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "bartika-jeans/products";
  const signedParams: Record<string, string> =
    folderMode === "fixed"
      ? { folder, timestamp: String(timestamp) }
      : {
          asset_folder: folder,
          public_id_prefix: `${folder}/`,
          timestamp: String(timestamp),
        };

  const stringToSign =
    Object.keys(signedParams)
      .sort()
      .map((key) => `${key}=${signedParams[key]}`)
      .join("&") + apiSecret;
  const signature = createHash("sha1").update(stringToSign).digest("hex");

  return NextResponse.json({
    cloudName,
    apiKey,
    timestamp,
    folderMode,
    folder: folderMode === "fixed" ? folder : undefined,
    assetFolder: folderMode === "dynamic" ? folder : undefined,
    publicIdPrefix: folderMode === "dynamic" ? `${folder}/` : undefined,
    signature,
  });
}
