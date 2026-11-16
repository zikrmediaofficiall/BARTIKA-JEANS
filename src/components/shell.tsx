import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/app/actions";
import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  Package,
  Warehouse,
  ChartNoAxesCombined,
  Users,
  Settings,
  Receipt,
  LogOut,
  ClipboardCheck,
  Truck,
  Wallet,
} from "lucide-react";

const links = [
  ["/", "الرئيسية", LayoutDashboard],
  ["/pos", "الكاشير", ShoppingCart],
  ["/products", "المنتجات", Package],
  ["/inventory", "المخزون والجرد", Warehouse],
  ["/purchases", "المشتريات", Truck],
  ["/online-orders", "طلبات المتجر", ShoppingBag],
  ["/customers", "العملاء", Users],
  ["/invoices", "الفواتير", Receipt],
  ["/cash", "الخزينة والورديات", Wallet],
  ["/reports", "التقارير", ChartNoAxesCombined],
  ["/stocktake", "الجرد", ClipboardCheck],
  ["/exchanges", "الاستبدال", ClipboardCheck],
  ["/staff", "الموظفون", Users],
  ["/settings", "الإعدادات", Settings],
] as const;

const roleNames: Record<string, string> = {
  admin: "مدير النظام",
  manager: "مدير المحل",
  seller: "بائع",
};

export function Shell({
  children,
  user,
  role,
}: {
  children: React.ReactNode;
  user: string;
  role: string;
}) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-emerald-950 p-4 text-white md:sticky md:top-0 md:h-screen md:w-64">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="h-12 w-12 overflow-hidden rounded-xl border border-gold-400 bg-emerald-950">
            <Image
              src="https://res.cloudinary.com/dcuveyab9/image/upload/v1794812757/bartika-jeans/general/bartika-brand-logo.webp"
              alt="شعار BARTIKA JEANS"
              width={48}
              height={48}
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>
          <div>
            <b className="tracking-wider">BARTIKA</b>
            <div className="text-xs text-gold-300">JEANS MANAGEMENT</div>
          </div>
        </div>
        <nav className="grid grid-cols-2 gap-2 md:grid-cols-1">
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-emerald-50 hover:bg-white/10"
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-white/15 pt-4">
          <div className="text-xs text-emerald-200">{user}</div>
          <div className="mb-3 text-xs text-gold-300">
            {roleNames[role] || "مستخدم"}
          </div>
          <form action={signOut}>
            <button className="flex items-center gap-2 text-sm text-white/80">
              <LogOut size={16} /> تسجيل الخروج
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <header className="app-shell-header mb-7 flex items-center justify-between">
          <div>
            <p className="text-sm text-emerald-800">BARTIKA JEANS</p>
            <h1 className="text-xl font-black">إدارة المحل</h1>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-900">
            فرع رئيسي
          </span>
        </header>
        {children}
      </main>
    </div>
  );
}
