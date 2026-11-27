import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { Shell } from "@/components/shell";

type Cell = { available: number; onHand: number };
type ProductGrid = {
  id: string;
  name: string;
  sku: string;
  sizes: Set<string>;
  colors: Set<string>;
  cells: Map<string, Cell>;
  total: number;
};

const NO_VALUE = "—";

function sizeOrder(a: string, b: string) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const letters = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  const ia = letters.indexOf(a.toUpperCase());
  const ib = letters.indexOf(b.toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  return a.localeCompare(b, "ar");
}

export default async function SizeMatrix({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const parsed = Number(t);
  const threshold = Number.isFinite(parsed) && parsed >= 0 && parsed <= 50 ? Math.floor(parsed) : 2;

  const { supabase, user, profile } = await requirePermission("inventory.read");
  const { data, error } = await supabase
    .from("inventory")
    .select("quantity,reserved_quantity,product_variants(id,size,color,products(id,name,sku))")
    .limit(5000);
  if (error) throw new Error("تعذر تحميل المخزون: " + error.message);

  const products = new Map<string, ProductGrid>();
  const lowRows: { name: string; sku: string; size: string; color: string; available: number }[] = [];

  for (const row of data || []) {
    const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
    const product = Array.isArray(variant?.products) ? variant?.products[0] : variant?.products;
    if (!variant || !product) continue;
    const size = variant.size || NO_VALUE;
    const color = variant.color || NO_VALUE;
    const available = Math.max(0, Number(row.quantity) - Number(row.reserved_quantity));
    let grid = products.get(product.id);
    if (!grid) {
      grid = { id: product.id, name: product.name, sku: product.sku, sizes: new Set(), colors: new Set(), cells: new Map(), total: 0 };
      products.set(product.id, grid);
    }
    grid.sizes.add(size);
    grid.colors.add(color);
    grid.cells.set(size + "|" + color, { available, onHand: Number(row.quantity) });
    grid.total += available;
    if (available <= threshold) lowRows.push({ name: product.name, sku: product.sku, size, color, available });
  }

  const grids = Array.from(products.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  lowRows.sort((a, b) => a.available - b.available || a.name.localeCompare(b.name, "ar"));

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black">مصفوفة المقاسات والألوان</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
          <span>حد التنبيه (القطع المتاحة):</span>
          {[0, 1, 2, 3, 5].map((value) => (
            <Link
              key={value}
              href={"/inventory/matrix?t=" + value}
              className={"btn text-xs " + (value === threshold ? "btn-gold" : "border")}
            >
              {value === 0 ? "نفد فقط" : "≤ " + value}
            </Link>
          ))}
          <Link href="/inventory" className="btn border text-xs">قائمة المخزون</Link>
        </div>
      </div>

      <section className="panel mb-6 p-5">
        <h3 className="mb-3 font-black">
          نواقص تحتاج إعادة طلب ({lowRows.length})
        </h3>
        {lowRows.length === 0 ? (
          <p className="muted text-sm">لا توجد أصناف عند حد التنبيه الحالي (≤ {threshold}).</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>الصنف</th><th>SKU</th><th>المقاس</th><th>اللون</th><th>المتاح</th></tr>
              </thead>
              <tbody>
                {lowRows.map((row, index) => (
                  <tr key={index}>
                    <td>{row.name}</td>
                    <td>{row.sku}</td>
                    <td>{row.size}</td>
                    <td>{row.color}</td>
                    <td className={row.available === 0 ? "font-black text-red-700" : "font-bold text-amber-700"}>
                      {row.available === 0 ? "نفد" : row.available}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted mt-3 text-xs print:hidden">للطباعة اضغط Ctrl+P.</p>
      </section>

      {grids.length === 0 ? (
        <p className="muted">لا توجد أصناف في المخزون بعد.</p>
      ) : (
        grids.map((grid) => {
          const sizes = Array.from(grid.sizes).sort(sizeOrder);
          const colors = Array.from(grid.colors).sort((a, b) => a.localeCompare(b, "ar"));
          return (
            <section key={grid.id} className="panel mb-5 p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-black">{grid.name} <span className="muted text-xs">{grid.sku}</span></h3>
                <span className="muted text-sm">إجمالي المتاح: <b>{grid.total}</b></span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>اللون / المقاس</th>
                      {sizes.map((size) => <th key={size}>{size}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {colors.map((color) => (
                      <tr key={color}>
                        <td className="font-bold">{color}</td>
                        {sizes.map((size) => {
                          const cell = grid.cells.get(size + "|" + color);
                          if (!cell) return <td key={size} className="muted">·</td>;
                          const cls =
                            cell.available === 0
                              ? "bg-red-100 font-black text-red-800"
                              : cell.available <= threshold
                                ? "bg-amber-100 font-bold text-amber-900"
                                : "bg-emerald-50 text-emerald-900";
                          return <td key={size} className={"text-center " + cls}>{cell.available}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
      <p className="muted text-xs">
        الأرقام هي المتاح للبيع (الرصيد ناقص المحجوز لطلبات المتجر). الخلية الفارغة (·) تعني أن هذه التركيبة غير معرّفة للصنف. أحمر = نفد، أصفر = عند حد التنبيه أو أقل.
      </p>
    </Shell>
  );
}
