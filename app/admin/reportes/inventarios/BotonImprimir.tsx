"use client";

export default function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-ranch-marron px-4 py-1.5 text-sm font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro"
    >
      🖨️ Imprimir / Guardar PDF
    </button>
  );
}
