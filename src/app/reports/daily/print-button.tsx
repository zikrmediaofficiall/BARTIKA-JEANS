"use client";

export function PrintButton({ target = "z-report" }: { target?: "z-report" | "statement" }) {
  const print = () => {
    document.body.dataset.printMode = target;
    const done = () => {
      delete document.body.dataset.printMode;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <button type="button" className="btn btn-primary" onClick={print}>
      طباعة
    </button>
  );
}
