import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";

export default async function Inventory() {
  const { supabase, user, profile } = await requirePermission("inventory.read");
  const { data, error } = await supabase
    .from("inventory")
    .select("quantity,reserved_quantity,product_variants(barcode,size,color,products(name,sku,image_url))")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black">المخزون والجرد</h2>
        <Link href="/inventory/matrix" className="btn btn-gold text-sm">مصفوفة المقاسات والنواقص</Link>
      </div>
      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>الصورة</th>
              <th>الصنف</th>
              <th>SKU</th>
              <th>باركود</th>
              <th>المقاس</th>
              <th>اللون</th>
              <th>الرصيد الفعلي</th>
              <th>محجوز لطلبات المتجر</th>
              <th>المتاح للبيع</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row, index) => {
              const variant = Array.isArray(row.product_variants)
                ? row.product_variants[0]
                : row.product_variants;
              const product = Array.isArray(variant?.products)
                ? variant.products[0]
                : variant?.products;

              return (
                <tr key={index}>
                  <td>
                    {product?.image_url ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={product.image_url} alt={product?.name || "صورة المنتج"} className="h-12 w-12 rounded-lg object-cover" />
                      </>
                    ) : "—"}
                  </td>
                  <td>{product?.name || "—"}</td>
                  <td>{product?.sku || "—"}</td>
                  <td>{variant?.barcode || "—"}</td>
                  <td>{variant?.size || "—"}</td>
                  <td>{variant?.color || "—"}</td>
                  <td>{row.quantity}</td>
                  <td>{row.reserved_quantity}</td>
                  <td className="font-bold">{Math.max(0, row.quantity - row.reserved_quantity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted mt-4 text-sm">
        الجرد الافتتاحي واعتماد تسويات فروق المخزون من صلاحية Admin فقط.
      </p>
    </Shell>
  );
}
