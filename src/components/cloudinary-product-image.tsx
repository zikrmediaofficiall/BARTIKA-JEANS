"use client";

import { useState, type ChangeEvent } from "react";

type SignatureResponse = {
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  folderMode?: "fixed" | "dynamic";
  folder?: string;
  assetFolder?: string;
  publicIdPrefix?: string;
  signature?: string;
  error?: string;
};

type UploadResponse = {
  secure_url?: string;
  public_id?: string;
  error?: { message?: string };
};

export function CloudinaryProductImage() {
  const [imageUrl, setImageUrl] = useState("");
  const [publicId, setPublicId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("اختر صورة بصيغة JPG أو PNG أو WebP.");
      event.currentTarget.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("الحد الأقصى لحجم الصورة 10 ميجابايت.");
      event.currentTarget.value = "";
      return;
    }

    setUploading(true);
    try {
      const signatureResponse = await fetch("/api/cloudinary/signature", {
        method: "POST",
      });
      const signature = (await signatureResponse.json()) as SignatureResponse;
      if (!signatureResponse.ok) {
        throw new Error(signature.error || "تعذر تجهيز رفع الصورة.");
      }
      if (
        !signature.cloudName ||
        !signature.apiKey ||
        !signature.timestamp ||
        !signature.folderMode ||
        !signature.signature
      ) {
        throw new Error("استجابة توقيع Cloudinary غير مكتملة.");
      }

      const payload = new FormData();
      payload.append("file", file);
      payload.append("api_key", signature.apiKey);
      payload.append("timestamp", String(signature.timestamp));
      payload.append("signature", signature.signature);

      if (signature.folderMode === "fixed" && signature.folder) {
        payload.append("folder", signature.folder);
      } else if (
        signature.folderMode === "dynamic" &&
        signature.assetFolder &&
        signature.publicIdPrefix
      ) {
        payload.append("asset_folder", signature.assetFolder);
        payload.append("public_id_prefix", signature.publicIdPrefix);
      } else {
        throw new Error("إعداد مسار مجلدات Cloudinary غير مكتمل.");
      }

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
        { method: "POST", body: payload },
      );
      const uploaded = (await uploadResponse.json()) as UploadResponse;
      if (!uploadResponse.ok || !uploaded.secure_url || !uploaded.public_id) {
        throw new Error(
          uploaded.error?.message || "فشل رفع الصورة إلى Cloudinary.",
        );
      }
      if (!uploaded.public_id.startsWith("bartika-jeans/products/")) {
        throw new Error("Cloudinary حفظ الصورة خارج مجلد المنتجات المحدد.");
      }

      setImageUrl(uploaded.secure_url);
      setPublicId(uploaded.public_id);
      setMessage("تم رفع الصورة بنجاح.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "حدث خطأ أثناء رفع الصورة.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-3 sm:col-span-2 xl:col-span-4">
      <label className="block text-sm font-bold" htmlFor="product-image">
        صورة المنتج
      </label>
      <input
        id="product-image"
        className="field mt-2"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={uploadImage}
        disabled={uploading}
      />
      <input type="hidden" name="image_url" value={imageUrl} />
      <input type="hidden" name="image_public_id" value={publicId} />
      <p className="muted mt-2 text-xs" aria-live="polite">
        {uploading ? "جاري رفع الصورة..." : message || "JPG أو PNG أو WebP — حتى 10 ميجابايت"}
      </p>
      {imageUrl ? (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="معاينة صورة المنتج"
            className="h-24 w-24 rounded-lg object-cover"
          />
          <span className="text-sm font-medium text-emerald-700">
            الصورة جاهزة للحفظ مع المنتج
          </span>
        </div>
      ) : null}
    </div>
  );
}
