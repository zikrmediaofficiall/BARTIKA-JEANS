import { randomUUID } from "crypto";
import { recordSupplierPayment } from "@/app/actions";

type TillOption = { id: string; label: string };

export function SupplierPaymentForm({
  invoiceId,
  due,
  tills,
}: {
  invoiceId: string;
  due: number;
  tills: TillOption[];
}) {
  return (
    <form action={recordSupplierPayment} className="grid min-w-[19rem] gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
      <input type="hidden" name="purchase_invoice_id" value={invoiceId} />
      <input type="hidden" name="idempotency_key" value={randomUUID()} />
      <label className="text-xs font-bold">
        مبلغ السداد (ج.م)
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
        وسيلة الدفع
        <select className="field mt-1" name="method" defaultValue="cash">
          <option value="cash">كاش</option>
          <option value="instapay">InstaPay</option>
          <option value="visa">Visa</option>
        </select>
      </label>
      <label className="text-xs font-bold">
        مصدر النقدية (اختياري)
        <select className="field mt-1" name="cash_session_id" defaultValue="">
          <option value="">الخزينة المركزية</option>
          {tills.map((till) => (
            <option key={till.id} value={till.id}>{till.label}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold">
        مرجع التحويل / الفيزا
        <input className="field mt-1" name="reference" maxLength={120} />
      </label>
      <button className="btn btn-primary sm:col-span-2">تسجيل السداد</button>
      <p className="muted text-[11px] sm:col-span-2">
        اترك مصدر النقدية على الخزينة المركزية ما لم يكن المبلغ خارجًا فعليًا من درج وردية محددة.
      </p>
    </form>
  );
}
