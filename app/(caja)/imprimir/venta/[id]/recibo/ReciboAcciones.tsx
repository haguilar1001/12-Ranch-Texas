"use client";

export default function ReciboAcciones() {
  return (
    <div className="no-print flex gap-2">
      <button
        onClick={() => window.print()}
        className="rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro"
      >
        🖨️ Imprimir
      </button>
      <button onClick={() => window.close()} className="rounded-lg border border-ranch-marron/30 px-5 py-2 font-semibold text-ranch-marron hover:bg-white">
        Cerrar
      </button>
    </div>
  );
}
