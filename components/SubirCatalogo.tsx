"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cargarCatalogoExcel, type ResultadoCargaCatalogo } from "@/app/admin/catalogos/actions";

const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const th = "px-3 py-1 text-left text-xs font-bold uppercase text-ranch-marron/60";

/**
 * Sube la plantilla de un catálogo: primero la revisa (no guarda nada) y muestra qué se crea, qué se
 * actualiza y qué filas tienen error; solo carga cuando la persona confirma y no hay errores.
 */
export default function SubirCatalogo({ tipo, titulo }: { tipo: string; titulo: string }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [r, setR] = useState<ResultadoCargaCatalogo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [clave, setClave] = useState(0);

  async function enviar(confirmar: boolean) {
    if (!archivo) return setR({ ok: false, error: "Elige el archivo de Excel." });
    const fd = new FormData();
    fd.set("tipo", tipo);
    fd.set("archivo", archivo);
    if (confirmar) fd.set("confirmar", "1");
    setOcupado(true);
    try {
      const res = await cargarCatalogoExcel(fd);
      setR(res);
      if (res.confirmado) { setArchivo(null); setClave((k) => k + 1); router.refresh(); }
    } catch {
      setR({ ok: false, error: "No se pudo enviar el archivo. Revisa la conexión e inténtalo de nuevo." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input key={clave} type="file" accept=".xlsx,.xls" className="max-w-full text-sm"
          aria-label={`Archivo de ${titulo.toLowerCase()}`}
          onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setR(null); }} />
        <button className={boton} disabled={ocupado || !archivo} onClick={() => enviar(false)}>{ocupado && !r ? "Revisando…" : "Revisar archivo"}</button>
      </div>

      {r && (
        <div className="space-y-3">
          {r.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{r.error}</p>}
          {r.confirmado && (
            <p className="rounded-lg bg-green-50 px-3 py-2 font-semibold text-green-700">
              Listo: {r.nuevos} creado(s) y {r.actualizar} actualizado(s) en {r.titulo?.toLowerCase()}.
            </p>
          )}
          {!r.confirmado && ((r.nuevos ?? 0) > 0 || (r.actualizar ?? 0) > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Lista titulo={`Se crean: ${r.nuevos}`} nombres={r.muestraNuevos} total={r.nuevos} />
              <Lista titulo={`Se actualizan: ${r.actualizar}`} nombres={r.muestraActualizar} total={r.actualizar} />
            </div>
          )}
          {r.avisos?.map((a) => <p key={a} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">{a}</p>)}

          {(r.errores?.length ?? 0) > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-red-200">
              <p className="bg-red-50 px-3 py-1.5 font-semibold text-red-700">{r.errores!.length} fila(s) con error: corrígelas en el Excel y vuelve a subirlo.</p>
              <table className="w-full">
                <thead className="sticky top-0 bg-red-50"><tr><th className={th}>Fila</th><th className={th}>Qué corregir</th></tr></thead>
                <tbody>
                  {r.errores!.map((e) => (
                    <tr key={e.fila} className="border-t border-red-100 align-top">
                      <td className="px-3 py-1 font-semibold text-red-700">{e.fila}</td>
                      <td className="px-3 py-1 text-red-700">{e.errores.join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!r.confirmado && r.ok && ((r.nuevos ?? 0) > 0 || (r.actualizar ?? 0) > 0) && (
            <button className={boton} disabled={ocupado} onClick={() => enviar(true)}>
              {ocupado ? "Cargando…" : `Confirmar: crear ${r.nuevos} y actualizar ${r.actualizar}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Lista({ titulo, nombres, total }: { titulo: string; nombres?: string[]; total?: number }) {
  if (!total) return <p className="rounded-lg border border-ranch-marron/15 px-3 py-2 text-ranch-marron/50">{titulo}</p>;
  return (
    <div className="rounded-lg border border-ranch-marron/15 px-3 py-2">
      <p className="font-semibold text-ranch-marron">{titulo}</p>
      <ul className="mt-1 list-inside list-disc text-xs text-ranch-marron/70">
        {nombres?.map((n) => <li key={n}>{n}</li>)}
        {total > (nombres?.length ?? 0) && <li>… y {total - (nombres?.length ?? 0)} más</li>}
      </ul>
    </div>
  );
}
