export type LedgerSale = { id: string; invoice_number: string | number; total: number | string; created_at: string };
export type LedgerPayment = { sale_id: string; method: string; amount: number | string; created_at: string };
export type LedgerEntry = {
  date: string;
  kind: "invoice" | "payment";
  label: string;
  debit: number;
  credit: number;
  balance: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Chronological customer statement: invoices add to the balance, payments reduce it. */
export function buildLedger(
  sales: LedgerSale[],
  payments: LedgerPayment[],
  methodNames: Record<string, string>,
): LedgerEntry[] {
  const num = new Map(sales.map((s) => [s.id, String(s.invoice_number)]));
  const raw = [
    ...sales.map((s) => ({
      date: s.created_at,
      order: 0,
      kind: "invoice" as const,
      label: `فاتورة #${s.invoice_number}`,
      debit: Number(s.total),
      credit: 0,
    })),
    ...payments.map((p) => ({
      date: p.created_at,
      order: 1,
      kind: "payment" as const,
      label: `دفعة ${methodNames[p.method] || p.method} · فاتورة #${num.get(p.sale_id) ?? "?"}`,
      debit: 0,
      credit: Number(p.amount),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  let balance = 0;
  return raw.map((e) => {
    balance = r2(balance + e.debit - e.credit);
    return { date: e.date, kind: e.kind, label: e.label, debit: e.debit, credit: e.credit, balance };
  });
}

export type AgingBucket = "0-30" | "31-60" | "61+";

export function agingBucket(createdAt: string, now: Date): AgingBucket {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86400000);
  return days <= 30 ? "0-30" : days <= 60 ? "31-60" : "61+";
}
