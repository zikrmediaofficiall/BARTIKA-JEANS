import { randomUUID } from "crypto";
import { collectSaleDue } from "@/app/actions";

export function CustomerCollectionForm({
  saleId,
  due,
}: {
  saleId: string;
  due: number;
}) {
  const idempotencyKey = randomUUID();

  return (
    <form action={collectSaleDue} className="mt-3 grid min-w-[18rem] gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
      <input type="hidden" name="sale_id" value={saleId} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <label className="text-xs font-bold">
        المبلغ (ج.م)
        <input
          className="field mt-1"
          name="amount"
          type="number"
          min="0.01"
          max={due}
          step="0.01"
          defaultValue={due.toFixed(2)}
          required
        />
      </label>
      <label className="text-xs font-bold">
        طريقة التحصيل
        <select className="field mt-1" name="method" defaultValue="cash">
          <option value="cash">كاش</option>
          <option value="instapay">InstaPay</option>
          <option value="visa">Visa</option>
        </select>
      </label>
      <label className="text-xs font-bold">
        مرجع التحويل (لغير النقدي)
        <input className="field mt-1" name="reference" maxLength={120} />
      </label>
      <div className="flex items-end">
        <button className="btn btn-primary w-full">تحصيل الرصيد</button>
      </div>
    </form>
  );
}
