import { hasPermission, requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { openCashSession, closeCashSession, addExpense } from "@/app/actions";

export default async function Cash() {
  const { supabase, user, profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  const canReadExpenses = await hasPermission(
    supabase,
    profile.role,
    "expenses.read",
  );

  const [{ data: sessions, error: sessionsError }, { data: expenses, error: expensesError }] =
    await Promise.all([
      supabase
        .from("cash_sessions")
        .select("id,seller_id,opening_cash,expected_cash,counted_cash,variance,status,opened_at,closed_at")
        .order("opened_at", { ascending: false })
        .limit(30),
      canReadExpenses
        ? supabase
            .from("expenses")
            .select("id,category,description,amount,payment_method,cash_session_id,created_at")
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (sessionsError || expensesError) {
    throw new Error(sessionsError?.message || expensesError?.message);
  }

  return (
    <Shell user={user.email || ""} role={profile.role}>
      <h2 className="mb-5 text-2xl font-black">الخزينة والورديات</h2>

      <form action={openCashSession} className="panel mb-5 flex flex-wrap items-end gap-3 p-5">
        <label className="min-w-52 flex-1 text-sm">
          رصيد بداية الوردية
          <input
            className="field mt-1"
            name="opening_cash"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
          />
        </label>
        <button className="btn btn-primary">فتح وردية جديدة</button>
      </form>

      <div className="panel table-wrap p-4">
        <h3 className="mb-3 font-black">الورديات</h3>
        <table>
          <thead>
            <tr>
              <th>البداية</th>
              <th>رصيد البداية</th>
              <th>المتوقع</th>
              <th>الفعلي</th>
              <th>الفرق</th>
              <th>الحالة</th>
              <th>إغلاق</th>
            </tr>
          </thead>
          <tbody>
            {(sessions || []).map((session) => (
              <tr key={session.id}>
                <td>{new Date(session.opened_at).toLocaleString("ar-EG")}</td>
                <td>{Number(session.opening_cash).toFixed(2)}</td>
                <td>{session.expected_cash === null ? "—" : Number(session.expected_cash).toFixed(2)}</td>
                <td>{session.counted_cash === null ? "—" : Number(session.counted_cash).toFixed(2)}</td>
                <td>{session.variance === null ? "—" : Number(session.variance).toFixed(2)}</td>
                <td>{session.status === "open" ? "مفتوحة" : "مغلقة"}</td>
                <td>
                  {session.status === "open" && (session.seller_id === user.id || isAdmin) ? (
                    <form action={closeCashSession} className="flex gap-2">
                      <input type="hidden" name="session_id" value={session.id} />
                      <input
                        className="field w-28"
                        name="counted_cash"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="النقد الفعلي"
                        required
                      />
                      <button className="btn btn-gold">إغلاق</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isAdmin && (
          <p className="muted mt-3 text-xs">
            يمكنك فتح وإغلاق ورديتك فقط. عرض ورديات بقية الموظفين يحتاج صلاحية cash.read_all.
          </p>
        )}
      </div>

      {isAdmin && (
        <form action={addExpense} className="panel my-5 grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <h3 className="font-black sm:col-span-2 xl:col-span-4">تسجيل مصروف</h3>
          <input className="field" name="category" placeholder="التصنيف" required />
          <input className="field" name="description" placeholder="وصف المصروف" required />
          <input className="field" name="amount" type="number" min="0.01" step="0.01" placeholder="القيمة" required />
          <select className="field" name="method">
            <option value="cash">كاش</option>
            <option value="instapay">InstaPay</option>
            <option value="visa">فيزا</option>
          </select>
          <select className="field" name="cash_session_id" defaultValue="">
            <option value="">مصروف عام من خزينة المحل</option>
            {(sessions || [])
              .filter((session) => session.status === "open")
              .map((session) => (
                <option key={session.id} value={session.id}>
                  وردية الموظف · {session.seller_id.slice(0, 8)}
                </option>
              ))}
          </select>
          <p className="muted text-xs sm:col-span-2 xl:col-span-4">
            المصروف العام لا يُخصم من درج أي بائع. اربط المصروف النقدي بورديّة محددة فقط عندما يكون المبلغ خارجًا من درجها.
          </p>
          <button className="btn btn-primary">حفظ المصروف</button>
        </form>
      )}

      {canReadExpenses && (
        <div className="panel table-wrap p-4">
          <h3 className="mb-3 font-black">المصروفات</h3>
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>التصنيف</th>
                <th>الوصف</th>
                <th>القيمة</th>
                <th>الدفع</th>
                <th>مصدر النقدية</th>
              </tr>
            </thead>
            <tbody>
              {(expenses || []).map((expense) => (
                <tr key={expense.id}>
                  <td>{new Date(expense.created_at).toLocaleDateString("ar-EG")}</td>
                  <td>{expense.category}</td>
                  <td>{expense.description}</td>
                  <td>{Number(expense.amount).toFixed(2)}</td>
                  <td>{expense.payment_method}</td>
                  <td>
                    {expense.cash_session_id
                      ? `وردية · ${expense.cash_session_id.slice(0, 8)}`
                      : "خزينة المحل"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
