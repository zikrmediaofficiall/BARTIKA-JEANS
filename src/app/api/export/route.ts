import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { EXPORT_TABLES, buildBackupJson, readTable, type Client, type Row } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const { body } = await buildBackupJson(client);
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
