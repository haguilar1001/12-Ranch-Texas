"use client";

// Planilla de alimentación por turno: la app propone lo TEÓRICO de la dieta y el
// operario confirma con el chulito o corrige lo REAL. Solo se guarda lo marcado.

import { useCallback, useEffect, useMemo, useState } from "react";
import { cargarPlanilla, guardarPlanilla, type Planilla } from "./actions";

const input = "rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm";
const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const botonSec = "rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const th = "px-3 py-2 text-xs uppercase text-ranch-marron/60";

type Fila = { cantidad: string; nota: string; marcada: boolean };

export default function PlanillaAlimentacion({
  hoy, busy, correr, empleados, version,
}: {
  hoy: string;
  busy: boolean;
  correr: (fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito: string) => Promise<boolean>;
  empleados: { id: string; nombre: string }[];
  /** Cambia cuando algo se anula en la bitácora, para recargar. */
  version: number;
}) {
  const [fecha, setFecha] = useState(hoy);
  const [franja, setFranja] = useState<string>("07:00");
  const [planilla, setPlanilla] = useState<Planilla | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const [empleado, setEmpleado] = useState("");

  const recargar = useCallback(async (f: string) => {
    setCargando(true);
    const p = await cargarPlanilla(f);
    setCargando(false);
    setPlanilla(p);
    // Lo real arranca igual a lo teórico: si se dio lo que tocaba, basta el chulito.
    const nuevas: Record<string, Fila> = {};
    for (const t of p.turnos) for (const x of t.filas) nuevas[`${t.franja}|${x.racion_id}`] = { cantidad: x.sugerido, nota: "", marcada: false };
    setFilas(nuevas);
    if (p.turnos.length > 0 && !p.turnos.some((t) => t.franja === franja)) setFranja(p.turnos[0].franja);
  }, [franja]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void recargar(fecha); }, [fecha, version]);

  const turno = planilla?.turnos.find((t) => t.franja === franja) ?? null;
  const pendientes = useMemo(() => (turno ? turno.filas.filter((x) => !x.registrado) : []), [turno]);
  const marcadas = pendientes.filter((x) => filas[`${franja}|${x.racion_id}`]?.marcada);

  const cambiar = (id: string, c: Partial<Fila>) =>
    setFilas((prev) => ({ ...prev, [`${franja}|${id}`]: { ...prev[`${franja}|${id}`], ...c } }));

  const marcarTodas = (v: boolean) =>
    setFilas((prev) => {
      const n = { ...prev };
      for (const x of pendientes) n[`${franja}|${x.racion_id}`] = { ...n[`${franja}|${x.racion_id}`], marcada: v };
      return n;
    });

  async function guardar() {
    const ok = await correr(
      () => guardarPlanilla({
        fecha, franja, empleado_id: empleado || null,
        filas: marcadas.map((x) => {
          const f = filas[`${franja}|${x.racion_id}`];
          return { racion_id: x.racion_id, cantidad: f.cantidad, nota: f.nota || null };
        }),
      }),
      `Turno guardado: ${marcadas.length} entrega(s).`,
    );
    if (ok) await recargar(fecha);
  }

  return (
    <section className={`mb-4 ${card} p-4`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold text-ranch-marron">Planilla de alimentación</h2>
          <p className="text-xs text-ranch-marron/55">
            La app trae lo teórico de la dieta. Escriba lo real que se dio y marque el chulito; solo se guarda lo marcado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="date" className={input} max={hoy} value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
          <select className={input} value={empleado} onChange={(e) => setEmpleado(e.target.value)}>
            <option value="">¿Quién alimentó? (opcional)</option>
            {empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </div>
      </div>

      {planilla && !planilla.ok && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{planilla.error}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
        {planilla?.turnos.map((t) => {
          const hechas = t.filas.filter((x) => x.registrado).length;
          const activo = t.franja === franja;
          return (
            <button
              key={t.franja}
              onClick={() => setFranja(t.franja)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${activo ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/30 text-ranch-marron"}`}
            >
              {t.etiqueta} <span className={`ml-1 text-xs ${activo ? "text-ranch-crema/80" : "text-ranch-marron/50"}`}>{hechas}/{t.filas.length}</span>
            </button>
          );
        })}
        {cargando && <span className="self-center text-xs text-ranch-marron/50">Cargando…</span>}
      </div>

      {turno && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-ranch-crema/60">
              <tr>
                <th className={`${th} w-10 text-center`}>
                  <input
                    type="checkbox" aria-label="Marcar todas"
                    checked={pendientes.length > 0 && marcadas.length === pendientes.length}
                    onChange={(e) => marcarTodas(e.target.checked)}
                    disabled={pendientes.length === 0}
                  />
                </th>
                <th className={th}>Destino</th>
                <th className={th}>Alimento</th>
                <th className={`${th} text-right`}>Teórico</th>
                <th className={th}>Real</th>
                <th className={th}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {turno.filas.map((x) => {
                const f = filas[`${franja}|${x.racion_id}`];
                const distinto = f && f.cantidad.trim() !== x.sugerido;
                if (x.registrado) {
                  return (
                    <tr key={x.racion_id} className="border-t border-ranch-marron/10 bg-ranch-verde/5">
                      <td className="px-3 py-2 text-center text-ranch-verde">✔</td>
                      <td className="px-3 py-2 font-semibold text-ranch-marron">{x.destino}</td>
                      <td className="px-3 py-2 text-ranch-marron/70">{x.alimento}</td>
                      <td className="px-3 py-2 text-right text-ranch-marron/60">{x.teoricoTexto}</td>
                      <td className="px-3 py-2 font-semibold text-ranch-marron">
                        {x.registrado.realTexto}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${x.registrado.estado === "realizada" ? "bg-ranch-verde/15 text-ranch-verde" : x.registrado.estado === "parcial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                          {x.registrado.automatico ? "auto" : x.registrado.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-ranch-marron/50">{x.registrado.motivo}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={x.racion_id} className={`border-t border-ranch-marron/10 ${f?.marcada ? "bg-ranch-crema/40" : ""}`}>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" aria-label={`Confirmar ${x.destino} ${x.alimento}`} checked={f?.marcada ?? false} onChange={(e) => cambiar(x.racion_id, { marcada: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 font-semibold text-ranch-marron">
                      {x.destino}
                      {x.consumoLibre && <span className="block text-[11px] font-normal text-ranch-marron/45">consumo libre · una vez al día</span>}
                    </td>
                    <td className="px-3 py-2 text-ranch-marron/70">
                      {x.alimento}
                      {x.bodegaTexto !== null && (
                        <span className={`block text-[11px] ${x.faltaEnBodega ? "font-semibold text-red-600" : "text-ranch-marron/45"}`}>
                          bodega: {x.bodegaTexto}{x.faltaEnBodega ? " · no alcanza" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-ranch-marron/70">{x.teoricoTexto}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          className={`${input} w-24 text-right ${distinto ? "border-amber-400 bg-amber-50" : ""}`}
                          inputMode="decimal"
                          value={f?.cantidad ?? ""}
                          // Cambiar el número ya es confirmar la fila.
                          onChange={(e) => cambiar(x.racion_id, { cantidad: e.target.value, marcada: true })}
                        />
                        <span className="text-xs text-ranch-marron/60">{x.unidad === "paca" ? "pacas" : x.unidad}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input className={`${input} w-40`} placeholder={distinto ? "¿Por qué cambió?" : "Opcional"} value={f?.nota ?? ""} onChange={(e) => cambiar(x.racion_id, { nota: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {turno && pendientes.length === 0 && (
        <p className="mt-3 text-sm font-semibold text-ranch-verde">Este turno ya quedó registrado completo.</p>
      )}
      {turno && pendientes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className={boton} disabled={busy || marcadas.length === 0} onClick={guardar}>
            Guardar {marcadas.length} de {pendientes.length}
          </button>
          <button className={botonSec} onClick={() => marcarTodas(true)}>Marcar todo</button>
          <span className="text-xs text-ranch-marron/50">Si no se dio nada, escriba 0. Lo guardado descuenta de bodega.</span>
        </div>
      )}
    </section>
  );
}
