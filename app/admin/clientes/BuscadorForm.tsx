"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Formulario de búsqueda de clientes: navega con ?q= (el server component filtra). */
export default function BuscadorForm({ q }: { q: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);

  function buscar() {
    const p = new URLSearchParams();
    if (texto.trim()) p.set("q", texto.trim());
    router.push(`/admin/clientes${p.toString() ? `?${p}` : ""}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && buscar()}
        placeholder="Nombre, celular o documento"
        autoFocus
        className="min-w-[240px] flex-1 rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm"
      />
      <button onClick={buscar} className="rounded-lg bg-ranch-marron px-5 py-2 text-sm font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">Buscar</button>
      {q && (
        <button onClick={() => { setTexto(""); router.push("/admin/clientes"); }} className="rounded-lg border border-ranch-marron/20 px-3 py-2 text-sm text-ranch-marron/60 hover:bg-ranch-crema">
          Limpiar
        </button>
      )}
    </div>
  );
}
