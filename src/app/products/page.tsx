import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { addProduct } from "@/app/actions";
import { CloudinaryProductImage } from "@/components/cloudinary-product-image";

export default async function Products() {
  const { supabase, user, profile } = await getSessionContext();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/");

  const { data, error } = await supabase
    .from("products")
    .select(
      "id,name,sku,category,sale_price,image_url,product_variants(id,barcode,size,color,inventory(quantity))",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <Shell user={user.email || ""} role="admin">
      <h2 className="mb-5 text-2xl font-black">إدارة المنتجات</h2>
      <form
        action={addProduct}
        className="panel mb-6 grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4"
      >
        <h3 className="font-black sm:col-span-2 xl:col-span-4">
          إضافة صنف / متغير
        </h3>
        <input className="field" name="name" placeholder="اسم الصنف" required />
        <input className="field" name="sku" placeholder="كود SKU" required />
        <input
          className="field"
          name="barcode"
          placeholder="باركود يدوي (اتركه فارغًا للتوليد التلقائي)"
        />
        <input className="field" name="category" placeholder="القسم" />
        <input className="field" name="size" placeholder="المقاس" />
        <input className="field" name="color" placeholder="اللون" />
        <label className="text-sm">
          سعر التكلفة / الشراء
          <input
            className="field mt-1"
            name="cost"
            type="number"
            step="0.01"
            min="0"
            placeholder="جنيه مصري"
            required
          />
        </label>
        <label className="text-sm">
          سعر البيع
          <input
            className="field mt-1"
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="جنيه مصري"
            required
          />
        </label>
        <label className="text-sm">
          الكمية الافتتاحية
          <input
            className="field mt-1"
            name="qty"
            type="number"
            min="0"
            placeholder="الكمية"
            required
          />
        </label>
        <CloudinaryProductImage />
        <button className="btn btn-primary self-end">حفظ الصنف</button>
      </form>

      <div className="panel table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>الصورة</th>
              <th>الصنف</th>
              <th>SKU</th>
              <th>سعر البيع</th>
              <th>المتغيرات</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((product) => (
              <tr key={product.id}>
                <td>
                  {product.image_url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={product.image_url} alt={product.name} className="h-14 w-14 rounded-lg object-cover" />
                    </>
                  ) : "—"}
                </td>
                <td>{product.name}</td>
                <td>{product.sku}</td>
                <td>{Number(product.sale_price).toFixed(2)} ج.م</td>
                <td>
                  {product.product_variants.map((variant) => (
                    <div key={variant.id} className="text-sm">
                      {variant.barcode} · {variant.size || "—"} · {variant.color || "—"} ·
                      مخزون:{" "}
                      {variant.inventory.reduce(
                        (quantity, entry) => quantity + Number(entry.quantity),
                        0,
                      )}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
