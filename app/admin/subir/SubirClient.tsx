"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SubirCatalogo from "@/components/SubirCatalogo";
import { CargaExcel } from "@/app/admin/equipos/EquiposClient";

const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const botonSec = "rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60";

const ICONOS: Record<string, string> = { equipos: "🔧", proveedores: "🏪", materias: "🧴", rubros: "🧾", alimentos: "🌾", grupos: "🗂️", areas: "🏢", insumos: "🧴" };

interface Props {
  inicial?: string;
  catalogos: { tipo: string; titulo: string; columnas: string[] }[];
  financieros: string[] | null;
}

export default function SubirClient({ inicial, catalogos, financieros }: Props) {
  const router = useRouter();
  const opciones = [{ tipo: "equipos", titulo: "Equipos (inventario)" }, ...catalogos];
  const [que, setQue] = useState(opciones.some((o) => o.tipo === inicial) ? inicial! : "");

  function escoger(t: string) {
    setQue(t === que ? "" : t);
    const u = new URL(window.location.href);
    if (t === que) u.searchParams.delete("que"); else u.searchParams.set("que", t);
    window.history.replaceState(null, "", u);
  }
  const cat = catalogos.find((c) => c.tipo === que);

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-3xl font-black text-ranch-marron">Subir archivos</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        Escoge qué vas a subir, descarga su plantilla de Excel, llénala y súbela aquí. Antes de guardar se revisa fila por fila y nada se carga hasta que confirmes.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {opciones.map((o) => (
          <button key={o.tipo} onClick={() => escoger(o.tipo)} aria-pressed={que === o.tipo}
            className={`${card} flex flex-col items-start gap-1 p-3 text-left transition ${que === o.tipo ? "border-ranch-marron bg-ranch-crema/60" : "hover:border-ranch-marron/40"}`}>
            <span className="text-2xl">{ICONOS[o.tipo] ?? "📄"}</span>
            <span className="font-bold text-ranch-marron">Subir {o.titulo.toLowerCase()}</span>
          </button>
        ))}
        {financieros && (
          <a href="/admin/archivos" className={`${card} flex flex-col items-start gap-1 p-3 hover:border-ranch-marron/40`}>
            <span className="text-2xl">💰</span>
            <span className="font-bold text-ranch-marron">Archivos financieros</span>
            <span className="text-xs text-ranch-marron/60">{financieros.join(", ")}</span>
          </a>
        )}
      </div>

      {que === "equipos" && (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            <a className={botonSec} href="/admin/equipos/plantilla">⬇ Plantilla de equipos</a>
          </div>
          <CargaExcel onListo={() => router.refresh()} />
          <p className="text-xs text-ranch-marron/60">La carga de equipos crea equipos nuevos y registra su entrada (compra, donación o “ya estaba”). Para cambiar unidades de un equipo que ya existe usa Novedades.</p>
        </>
      )}

      {cat && (
        <section className={`${card} p-4`}>
          <h2 className="mb-1 text-lg font-bold text-ranch-marron">{ICONOS[cat.tipo]} Subir {cat.titulo.toLowerCase()}</h2>
          <p className="mb-2 text-xs text-ranch-marron/60">
            Columnas: {cat.columnas.join(" · ")}. Las que tienen * son obligatorias. Si el nombre ya existe, la fila actualiza ese registro (las celdas
            vacías no borran nada); si no, lo crea.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <a className={botonSec} href={`/admin/catalogos/plantilla/${cat.tipo}`}>⬇ Plantilla vacía</a>
            <a className={botonSec} href={`/admin/catalogos/plantilla/${cat.tipo}?datos=1`}>⬇ Excel con los datos actuales</a>
            <a className={botonSec} href={`/admin/catalogos?tab=${cat.tipo}`}>Ver {cat.titulo.toLowerCase()}</a>
          </div>
          <SubirCatalogo key={cat.tipo} tipo={cat.tipo} titulo={cat.titulo} />
        </section>
      )}
    </main>
  );
}
