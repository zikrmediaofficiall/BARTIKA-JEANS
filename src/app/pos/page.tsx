import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Shell } from "@/components/shell";
import POSClient from "./pos-client";

export default async function POS() {
  const { supabase, user, profile } = await getSessionContext();
  if (!user || !profile?.is_active) redirect("/login");

  const { data, error } = await supabase
    .from("seller_catalog")
    .select("variant_id,product_name,sku,barcode,size,color,sale_price,stock")
    .order("product_name")
    .limit(500);

  if (error) throw new Error("تعذر تحميل كتالوج البيع: " + error.message);

  const catalog = (data || []).map((item) => ({
    variant_id: item.variant_id,
    product_name: item.product_name,
    sku: item.sku,
    barcode: item.barcode,
    size: item.size,
    color: item.color,
    price: Number(item.sale_price),
    stock: Number(item.stock),
  }));

  const maxDiscount =
    profile.role === "admin" ? 100 : Number(profile.max_discount_percent || 0);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <POSClient catalog={catalog} maxDiscount={maxDiscount} />
    </Shell>
  );
}
