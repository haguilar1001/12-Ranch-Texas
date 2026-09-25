"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { registrarMovimiento, cerrarTurno } from "./actions";
import { DENOMINACIONES_COP, totalConteo } from "@/lib/caja/cierre";
import { formatearCOP, formatearMiles, parseCOP } from "@/lib/dinero/cop";
import type { ResumenTurno } from "@/lib/caja/resumen";

interface Turno { id: string; caja: string; base_inicial: number; abierto: string; estado: string }
interface Movimiento { id: string; tipo: "ingreso" | "egreso"; numero: number | null; tercero: string | null; monto: number; concepto: string; medio: string | null; hora: string }

/** Comprobante imprimible de un movimiento de caja. */
const urlComprobante = (id: string) => `/imprimir/movimiento/${id}`;

export default function CajaAbierta({
  cajero, turno, resumen, movimientos, medios, beneficiarios, puedeGestionarBeneficiarios = false,
}: {
  cajero: string; turno: Turno; resumen: ResumenTurno; movimientos: Movimiento[]; medios: { id: string; nombre: string }[];
  /** A quién se le puede entregar plata en un egreso (lista de /admin/beneficiarios). */
  beneficiarios: { id: string; nombre: string; documento: string | null }[];
  puedeGestionarBeneficiarios?: boolean;
}) {
  const router = useRouter();

  // Movimiento
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [tercero, setTercero] = useState("");
  const [beneficiarioId, setBeneficiarioId] = useState("");
  const [msgMov, setMsgMov] = useState<string | null>(null);
  const [guardandoMov, setGuardandoMov] = useState(false);

  // Cierre
  const [cant, setCant] = useState<Record<number, number>>({});
  const [observacion, setObservacion] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [cerrado, setCerrado] = useState<{ esperado: number; contado: number; diferencia: number } | null>(null);
  const [msgCierre, setMsgCierre] = useState<string | null>(null);

  const contado = useMemo(
    () => totalConteo(DENOMINACIONES_COP.map((d) => ({ denominacion: d, cantidad: cant[d] ?? 0 }))),
    [cant],
  );
  const diferencia = contado - resumen.esperadoEfectivo;

  async function agregarMovimiento() {
    setMsgMov(null);
    const m = parseCOP(monto);
    // En un egreso "Entregado a" es obligatorio: se avisa antes de abrir la ventana del comprobante.
    if (tipo === "egreso" && !beneficiarioId) { setMsgMov("Elige a quién se le entrega la plata."); return; }
    // La ventana del comprobante se abre YA, dentro del clic: si se abre después de esperar al
    // servidor, el navegador la trata como ventana emergente y la bloquea.
    const ventana = window.open("about:blank", "_blank");
    setGuardandoMov(true);
    try {
      const r = await registrarMovimiento({
        tipo, monto: m, concepto,
        beneficiario_id: tipo === "egreso" ? beneficiarioId : null,
        tercero: tipo === "ingreso" ? tercero : null,
      });
      if (r.ok && r.movimientoId) {
        if (ventana) ventana.location.href = urlComprobante(r.movimientoId);
        else setMsgMov("Movimiento guardado. Tu navegador bloqueó el comprobante: ábrelo con 🧾 en la lista.");
        setMonto(""); setConcepto(""); setTercero(""); setBeneficiarioId("");
        router.refresh();
      } else {
        ventana?.close();
        setMsgMov(r.error ?? "Error");
      }
    } catch {
      ventana?.close();
      setMsgMov("No se pudo guardar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setGuardandoMov(false);
    }
  }

  async function cerrar() {
    setMsgCierre(null);
    setCerrando(true);
    const conteos = DENOMINACIONES_COP.map((d) => ({ denominacion: d, cantidad: cant[d] ?? 0 })).filter((c) => c.cantidad > 0);
    const r = await cerrarTurno({ conteos, observacion });
    setCerrando(false);
    if (r.ok) setCerrado({ esperado: r.esperado!, contado: r.contado!, diferencia: r.diferencia! });
    else setMsgCierre(r.error ?? "Error");
  }

  if (cerrado) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <div className="rounded-2xl border-4 border-ranch-verde bg-white p-6">
          <h1 className="text-2xl font-black text-ranch-marron">Turno cerrado</h1>
          <p className="mt-2 text-sm text-ranch-marron/70">{turno.caja} · {cajero}</p>
          <div className="mt-4 space-y-1 text-left">
            <div className="flex justify-between"><span>Efectivo esperado</span><strong>{formatearCOP(cerrado.esperado)}</strong></div>
            <div className="flex justify-between"><span>Efectivo contado</span><strong>{formatearCOP(cerrado.contado)}</strong></div>
            <div className={`flex justify-between text-lg ${cerrado.diferencia === 0 ? "text-ranch-verde" : "text-red-600"}`}>
              <span>{cerrado.diferencia === 0 ? "Cuadra" : cerrado.diferencia > 0 ? "Sobrante" : "Faltante"}</span>
              <strong>{formatearCOP(Math.abs(cerrado.diferencia))}</strong>
            </div>
          </div>
          <a href={`/caja/cuadre/${turno.id}`} className="mt-4 block rounded-lg bg-ranch-marron px-4 py-3 font-semibold text-ranch-crema">
            Ver cuadre del turno →
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-ranch-marron">Caja — {turno.caja}</h1>
          <p className="text-sm text-ranch-marron/60">{cajero} · abierto {turno.abierto} {turno.estado === "reabierto" && "· REABIERTO"}</p>
        </div>
        <a href="/taquilla" className="rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema">Taquilla →</a>
      </header>

      {/* Resumen */}
      <section className="mb-4 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">Resumen del turno</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>Ventas: <strong>{resumen.numVentas}</strong> ({resumen.asistentes} asistentes)</div>
          <div className="text-right">Total: <strong>{formatearCOP(resumen.totalVentas)}</strong></div>
        </div>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {resumen.ventasPorMedio.map((m) => (
              <tr key={m.medio} className="border-t border-ranch-marron/10">
                <td className="py-1">{m.medio}{m.es_efectivo ? " 💵" : ""}</td>
                <td className="py-1 text-right">{formatearCOP(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 space-y-1 border-t border-ranch-marron/15 pt-2 text-sm">
          <div className="flex justify-between text-ranch-marron/70"><span>Base inicial</span><span>{formatearCOP(resumen.base_inicial)}</span></div>
          <div className="flex justify-between text-ranch-marron/70"><span>+ Ventas efectivo</span><span>{formatearCOP(resumen.ventasEfectivo)}</span></div>
          <div className="flex justify-between text-ranch-marron/70"><span>+ Otros ingresos</span><span>{formatearCOP(resumen.otrosIngresos)}</span></div>
          <div className="flex justify-between text-ranch-marron/70"><span>− Egresos</span><span>{formatearCOP(resumen.egresos)}</span></div>
          <div className="flex justify-between font-bold text-ranch-marron"><span>Efectivo esperado</span><span>{formatearCOP(resumen.esperadoEfectivo)}</span></div>
          {resumen.cortesias > 0 && <div className="flex justify-between text-ranch-dorado"><span>Cortesías (entraron gratis)</span><span>{formatearCOP(resumen.cortesias)}</span></div>}
          {resumen.descuentos > 0 && <div className="flex justify-between text-ranch-dorado"><span>Descuentos de tarifa</span><span>{formatearCOP(resumen.descuentos)}</span></div>}
          {resumen.anuladas > 0 && <div className="flex justify-between text-red-600"><span>Ventas anuladas</span><span>{resumen.anuladas}</span></div>}
        </div>
      </section>

      {/* Movimientos */}
      <section className="mb-4 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">Movimientos de caja</h2>
        <div className="flex flex-wrap gap-2">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "ingreso" | "egreso")} className="rounded border px-2 py-1 text-sm">
            <option value="egreso">Egreso</option>
            <option value="ingreso">Ingreso</option>
          </select>
          <input value={monto ? formatearMiles(parseCOP(monto)) : ""} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" placeholder="Monto" className="w-28 rounded border px-2 py-1 text-right text-sm" />
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto" className="flex-1 rounded border px-2 py-1 text-sm" />
          {tipo === "egreso" ? (
            <select
              value={beneficiarioId}
              onChange={(e) => setBeneficiarioId(e.target.value)}
              required
              className={`w-full rounded border px-2 py-1 text-sm sm:w-auto sm:flex-1 ${beneficiarioId ? "" : "text-ranch-marron/50"}`}
            >
              <option value="">Entregado a… (obligatorio)</option>
              {beneficiarios.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}{b.documento ? ` · ${b.documento}` : ""}</option>
              ))}
            </select>
          ) : (
            <input value={tercero} onChange={(e) => setTercero(e.target.value)} placeholder="Recibido de (opcional)" className="w-full rounded border px-2 py-1 text-sm sm:w-auto sm:flex-1" />
          )}
          <button onClick={agregarMovimiento} disabled={guardandoMov} className="rounded bg-ranch-marron px-3 py-1 text-sm font-semibold text-ranch-crema disabled:opacity-50">{guardandoMov ? "Guardando…" : "Agregar"}</button>
        </div>
        <p className="mt-1 text-xs text-ranch-marron/50">Al agregarlo se abre su comprobante para imprimir y firmar.</p>
        {tipo === "egreso" && beneficiarios.length === 0 && (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
            No hay beneficiarios en la lista.{" "}
            {puedeGestionarBeneficiarios
              ? <a href="/admin/beneficiarios" className="font-semibold underline">Agrégalos aquí</a>
              : "Pídele a un supervisor que los agregue en Administración → Beneficiarios de caja."}
          </p>
        )}
        {msgMov && <p className="mt-1 text-sm text-red-600">{msgMov}</p>}
        <ul className="mt-2 space-y-1 text-sm">
          {movimientos.map((m) => (
            <li key={m.id} className="flex justify-between border-t border-ranch-marron/10 py-1">
              <span>
                {m.tipo === "egreso" ? "−" : "+"} {m.numero != null && <span className="text-ranch-marron/50">N.° {m.numero} · </span>}{m.concepto}
                {m.tercero && <span className="text-ranch-marron/60"> · {m.tercero}</span>} <span className="text-ranch-marron/40">{m.hora}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={m.tipo === "egreso" ? "text-red-600" : "text-ranch-verde"}>{formatearCOP(m.monto)}</span>
                <a href={urlComprobante(m.id)} target="_blank" rel="noopener" title="Ver e imprimir el comprobante" className="rounded px-1 hover:bg-ranch-crema">🧾</a>
              </span>
            </li>
          ))}
          {movimientos.length === 0 && <li className="text-ranch-marron/40">Sin movimientos.</li>}
        </ul>
      </section>

      {/* Cierre */}
      <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">Cierre — conteo de efectivo</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DENOMINACIONES_COP.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <span className="w-16 text-right text-ranch-marron/70">{formatearMiles(d)}</span>
              <input
                value={cant[d] ?? ""}
                onChange={(e) => setCant((p) => ({ ...p, [d]: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0 }))}
                inputMode="numeric" placeholder="0"
                className="w-16 rounded border px-2 py-1 text-center"
              />
            </label>
          ))}
        </div>

        <div className="mt-3 space-y-1 border-t border-ranch-marron/15 pt-2 text-sm">
          <div className="flex justify-between"><span>Efectivo contado</span><strong>{formatearCOP(contado)}</strong></div>
          <div className="flex justify-between text-ranch-marron/70"><span>Efectivo esperado</span><span>{formatearCOP(resumen.esperadoEfectivo)}</span></div>
          <div className={`flex justify-between text-lg font-bold ${diferencia === 0 ? "text-ranch-verde" : "text-red-600"}`}>
            <span>{diferencia === 0 ? "Cuadra ✓" : diferencia > 0 ? "Sobrante" : "Faltante"}</span>
            <span>{formatearCOP(Math.abs(diferencia))}</span>
          </div>
        </div>

        {diferencia !== 0 && (
          <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Observación (obligatoria si hay diferencia)" className="mt-2 w-full rounded border px-2 py-1 text-sm" rows={2} />
        )}
        {msgCierre && <p className="mt-1 text-sm text-red-600">{msgCierre}</p>}

        <button onClick={cerrar} disabled={cerrando} className="mt-3 w-full rounded-xl bg-ranch-marron px-4 py-3 font-bold text-ranch-crema hover:bg-ranch-marron-oscuro disabled:opacity-50">
          {cerrando ? "Cerrando…" : "Cerrar turno"}
        </button>
      </section>
    </main>
  );
}
