import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { QrGallery, type QrEntry } from "@/components/qr-gallery";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bartika-jeans.vercel.app";

export default async function QrPage() {
  const { supabase, user, profile } = await getSessionContext();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/");

  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("facebook_url,instagram_url,tiktok_url,whatsapp_url,instapay_ipa,instapay_url")
    .eq("id", 1)
    .single();
  if (error || !settings) throw new Error(error?.message || "تعذر تحميل روابط QR");

  const candidates: QrEntry[] = [
    { id: "links", label: "كل روابط BARTIKA", value: siteUrl + "/links", note: "صفحة موحدة تضم منصات التواصل والدفع والمتجر" },
    { id: "shop", label: "المتجر الإلكتروني", value: siteUrl + "/shop", note: "فتح كتالوج المنتجات والطلبات" },
    { id: "facebook", label: "Facebook", value: settings.facebook_url || "", note: "صفحة المحل" },
    { id: "instagram", label: "Instagram", value: settings.instagram_url || "", note: "حساب المحل" },
    { id: "tiktok", label: "TikTok", value: settings.tiktok_url || "", note: "حساب المحل" },
    { id: "whatsapp", label: "WhatsApp", value: settings.whatsapp_url || "", note: "مراسلة BARTIKA" },
    { id: "instapay", label: "InstaPay", value: settings.instapay_url || "", note: settings.instapay_ipa || "رابط الدفع المعتمد" },
  ];
  const entries = candidates.filter((entry) => entry.value.startsWith("https://"));

  return (
    <Shell user={user.email || ""} role="admin">
      <div className="mb-5">
        <h2 className="text-2xl font-black">مركز أكواد QR</h2>
        <p className="muted mt-2 text-sm leading-6">
          أكواد التواصل والدفع والمتجر تُنشأ من روابط إعدادات المحل الحالية. عدّل الروابط من إعدادات المتجر ثم ارجع لهذه الصفحة لتوليد الأكواد الجديدة.
        </p>
      </div>
      <QrGallery entries={entries} />
    </Shell>
  );
}
