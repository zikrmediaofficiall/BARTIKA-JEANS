import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";

export default async function Inventory() {
  const { supabase, user, profile } = await requirePermission("inventory.read");
  const { data, error } = await supabase
    .from("inventory")
    .select("quantity,product_variants(barcode,size,color,products(name,sku))")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <h2 className="mb-5 text-2xl font-black">المخزون والجرد</h2>
      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>SKU</th>
              <th>باركود</th>
              <th>المقاس</th>
              <th>اللون</th>
              <th>الرصيد</th>
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
                  <td>{product?.name || "—"}</td>
                  <td>{product?.sku || "—"}</td>
                  <td>{variant?.barcode || "—"}</td>
                  <td>{variant?.size || "—"}</td>
                  <td>{variant?.color || "—"}</td>
                  <td className="font-bold">{row.quantity}</td>
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
