import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only backup export. Row access still goes through Supabase RLS with the admin session.
const EXPORT_TABLES = [
  "store_settings",
  "products",
  "product_variants",
  "product_costs",
  "inventory",
  "stock_movements",
  "customers",
  "customer_credit_accounts",
  "suppliers",
  "purchase_invoices",
  "purchase_items",
  "supplier_payments",
  "sales",
  "sale_items",
  "sale_item_costs",
  "payments",
  "exchanges",
  "exchange_items",
  "exchange_settlements",
  "cash_sessions",
  "expenses",
  "online_orders",
  "online_order_items",
  "online_order_payments",
  "online_order_refunds",
  "shipping_companies",
  "shipping_zones",
  "stocktakes",
  "stocktake_items",
  "audit_logs",
] as const;

type Row = Record<string, unknown>;
type Query = {
  select: (columns: string) => {
    order: (column: string) => { range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }> };
    range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
  };
};
type Client = { from: (table: string) => Query };

const PAGE = 1000;

async function readTable(client: Client, table: string): Promise<Row[]> {
  const rows: Row[] = [];
  let order = true;
  for (let from = 0; ; from += PAGE) {
    const base = client.from(table).select("*");
    let result = await (order ? base.order("id").range(from, from + PAGE - 1) : base.range(from, from + PAGE - 1));
    if (result.error && order && from === 0) {
      // Some tables have no "id" column; read them unordered.
      order = false;
      result = await client.from(table).select("*").range(from, from + PAGE - 1);
    }
    if (result.error) throw new Error(table + ": " + result.error.message);
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(","));
  return lines.join("\r\n");
}

export async function GET(request: Request) {
  const { supabase } = await requireAdmin();
  const client = supabase as unknown as Client;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    if (format === "csv") {
      const table = url.searchParams.get("table") || "";
      if (!(EXPORT_TABLES as readonly string[]).includes(table)) {
        return NextResponse.json({ error: "جدول غير معروف" }, { status: 400 });
      }
      const rows = await readTable(client, table);
      // BOM so Excel opens Arabic text correctly.
      return new NextResponse("\uFEFF" + toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bartika-${table}-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const data: Record<string, Row[]> = {};
    const counts: Record<string, number> = {};
    for (const table of EXPORT_TABLES) {
      data[table] = await readTable(client, table);
      counts[table] = data[table].length;
    }
    const body = JSON.stringify({ exported_at: new Date().toISOString(), app: "BARTIKA JEANS", counts, data });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="bartika-backup-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر التصدير" }, { status: 500 });
  }
}
