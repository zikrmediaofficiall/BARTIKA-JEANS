"use client";

import { QRCodeSVG } from "qrcode.react";

export type QrEntry = { id: string; label: string; value: string; note?: string };

export function QrGallery({ entries }: { entries: QrEntry[] }) {
  function download(entry: QrEntry) {
    const element = document.getElementById(`bartika-qr-${entry.id}`);
    if (!(element instanceof SVGElement)) return;
    const source = new XMLSerializer().serializeToString(element);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bartika-${entry.id}-qr.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printAll() {
    document.body.dataset.printMode = "qr-codes";
    window.print();
  }

  return (
    <section className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-sm">الأكواد تُنشأ محليًا داخل المتصفح ولا تحتاج إرسال الروابط إلى خدمة توليد خارجية.</p>
        <button className="btn btn-primary" type="button" onClick={printAll}>طباعة كل أكواد QR</button>
      </div>
      <div id="bartika-qr-print" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <article key={entry.id} className="qr-card panel flex flex-col items-center gap-3 p-5 text-center">
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG
                id={`bartika-qr-${entry.id}`}
                value={entry.value}
                size={190}
                level="H"
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#032B22"
              />
            </div>
            <div className="w-full">
              <h3 className="font-black text-emerald-950">{entry.label}</h3>
              {entry.note ? <p className="muted mt-1 text-xs">{entry.note}</p> : null}
              <p className="mt-2 break-all text-[11px] text-slate-600" dir="ltr">{entry.value}</p>
            </div>
            <button className="btn btn-gold no-print w-full" type="button" onClick={() => download(entry)}>تنزيل SVG</button>
          </article>
        ))}
      </div>
      <p className="no-print muted text-xs leading-6">
        استخدم QR الصفحة الموحدة على الأكياس والفواتير؛ يمكنك تحديث روابط الحسابات من إعدادات المتجر دون تغيير الكود المطبوع إذا ظل رابط صفحة /links ثابتًا.
      </p>
    </section>
  );
}
