import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { BarcodeLabels, type BarcodeLabelItem } from "@/components/barcode-labels";

export default async function BarcodesPage() {
  const { supabase, user } = await requireAdmin();

  const { data, error } = await supabase
    .from("products")
    .select("id,name,sku,product_variants(id,barcode,size,color,inventory(quantity))")
    .order("created_at", { ascending: false });

  if (error) throw new Error("تعذر تحميل الباركود: " + error.message);

  const items: BarcodeLabelItem[] = (data || []).flatMap((product) =>
    (product.product_variants || []).map((variant) => ({
      id: variant.id,
      barcode: variant.barcode,
      product_name: product.name,
      sku: product.sku,
      size: variant.size,
      color: variant.color,
      stock: variant.inventory?.quantity ?? 0,
    })),
  );

  return (
    <Shell user={user.email || ""} role="admin">
      <div className="mb-5">
        <h2 className="text-2xl font-black">إدارة الباركود وملصقات المنتجات</h2>
        <p className="muted mt-2 text-sm leading-6">
          لكل لون ومقاس باركود مستقل. عند ترك خانة الباركود فارغة أثناء إضافة المنتج،
          تنشئ قاعدة البيانات كودًا فريدًا تلقائيًا بصيغة BJK. ويمكن إدخال باركود المورد يدويًا.
        </p>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="muted text-xs">إجمالي المتغيرات</p>
          <p className="mt-2 text-2xl font-black text-emerald-950">{items.length}</p>
        </div>
        <div className="panel p-4">
          <p className="muted text-xs">باركودات تلقائية</p>
          <p className="mt-2 text-2xl font-black text-emerald-950">{items.filter((item) => item.barcode.startsWith("BJK-")).length}</p>
        </div>
        <div className="panel p-4">
          <p className="muted text-xs">إجمالي القطع المتاحة</p>
          <p className="mt-2 text-2xl font-black text-emerald-950">{items.reduce((sum, item) => sum + item.stock, 0)}</p>
        </div>
      </div>
      <BarcodeLabels items={items} />
    </Shell>
  );
}
