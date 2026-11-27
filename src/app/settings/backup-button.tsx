"use client";

import { useState } from "react";

type Result = {
  ok?: boolean;
  error?: string;
  publicId?: string;
  bytes?: number;
  privateOk?: boolean;
  unsignedStatus?: number | null;
  deleted?: number;
  kept?: number;
};

export function BackupToCloudinaryButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/backup/cloudinary", { method: "POST" });
      const out = (await res.json()) as Result;
      if (!res.ok || !out.ok) throw new Error(out.error || "فشلت النسخة");
      setMsg(
        `تمت النسخة: ${out.publicId} (${((out.bytes || 0) / 1024).toFixed(0)} KB مضغوط). ` +
          `الرابط العام مرفوض (HTTP ${out.unsignedStatus}). النسخ المحفوظة: ${out.kept}، المحذوف القديم: ${out.deleted}.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "فشلت النسخة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <button type="button" className="btn btn-primary text-sm" onClick={run} disabled={busy}>
        {busy ? "جاري النسخ..." : "نسخة احتياطية الآن إلى Cloudinary (خاصة)"}
      </button>
      {msg ? <p className="mt-2 text-sm leading-6">{msg}</p> : null}
    </div>
  );
}
