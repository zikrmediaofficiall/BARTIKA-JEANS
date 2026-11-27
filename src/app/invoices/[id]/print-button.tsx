"use client";

import { useEffect, useRef, useState } from "react";

export type PrintFormat = "a4" | "t80" | "t58";

const STORAGE_KEY = "bartika-print-format";
const PAGE_RULES: Record<PrintFormat, string> = {
  a4: "@page { size: A4; margin: 10mm; }",
  t80: "@page { size: 80mm auto; margin: 0; }",
  t58: "@page { size: 58mm auto; margin: 0; }",
};

function isFormat(value: unknown): value is PrintFormat {
  return value === "a4" || value === "t80" || value === "t58";
}

function applyFormat(format: PrintFormat) {
  document.body.dataset.print = format;
  let style = document.getElementById("bartika-page-size");
  if (!style) {
    style = document.createElement("style");
    style.id = "bartika-page-size";
    document.head.appendChild(style);
  }
  style.textContent = PAGE_RULES[format];
}

export function PrintButton() {
  const [format, setFormat] = useState<PrintFormat>("t80");
  const autoPrinted = useRef(false);

  function print(next: PrintFormat) {
    setFormat(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyFormat(next);
    window.print();
  }

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const initial: PrintFormat = isFormat(saved) ? saved : "t80";
    setFormat(initial);
    applyFormat(initial);

    const wantsAutoPrint = new URLSearchParams(window.location.search).get("autoprint") === "1";
    if (wantsAutoPrint && !autoPrinted.current) {
      autoPrinted.current = true;
      // Wait for logo and QR to render so the receipt is not printed half empty.
      const timer = window.setTimeout(() => window.print(), 800);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const base = "btn text-sm ";
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" className={base + (format === "t80" ? "btn-gold" : "border")} onClick={() => print("t80")}>
        طباعة إيصال 80mm
      </button>
      <button type="button" className={base + (format === "t58" ? "btn-gold" : "border")} onClick={() => print("t58")}>
        طباعة إيصال 58mm
      </button>
      <button type="button" className={base + (format === "a4" ? "btn-gold" : "border")} onClick={() => print("a4")}>
        طباعة A4 / PDF
      </button>
    </div>
  );
}
