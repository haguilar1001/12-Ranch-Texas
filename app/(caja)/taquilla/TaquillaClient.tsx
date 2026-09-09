"use client";

import { useMemo, useRef, useState } from "react";
import { registrarVenta } from "./actions";
import type { EntradaVenta } from "@/lib/ventas/tipos";
import { calcularTotales, validarVenta, type LineaVenta } from "@/lib/ventas/calculo";
import { formatearCOP, formatearMiles, parseCOP } from "@/lib/dinero/cop";

interface Tipo { id: string; nombre: string; codigo: string; requiere_pago: boolean; valor: number }
interface Medio { id: string; nombre: string; es_efectivo: boolean }
interface Motivo { id: string; nombre: string }
interface Supervisor { id: string; nombre: string }

interface Cortesia {
  key: number;
  tipo_visitante_id: string;
  cantidad: number;
  tipo_linea: "invitacion" | "atencion";
  motivo_cortesia_id: string;
  autorizado_por: string;
}
interface FilaPago { key: number; medio_pago_id: string; monto: string }

/** Descuento aplicado a un tipo de visitante: cuánto se cobra por unidad, con motivo y quién autoriza. */
interface Descuento { valor: string; motivo: string; autoriza: string }

export default function TaquillaClient({
  cajero, caja, tipos, medios, motivos, supervisores,
}: {
  cajero: string; caja: string; tipos: Tipo[]; medios: Medio[]; motivos: Motivo[]; supervisores: Supervisor[];
}) {
  const [cant, setCant] = useState<Record<string, number>>({});
  const [descuentos, setDescuentos] = useState<Record<string, Descuento>>({});
  const [comprador, setComprador] = useState({ nombre: "", documento: "" });
  const [cortesias, setCortesias] = useState<Cortesia[]>([]);
  const [pagos, setPagos] = useState<FilaPago[]>([{ key: 1, medio_pago_id: medios[0]?.id ?? "", monto: "" }]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<{ id: string; numero: number } | null>(null);
  const keyRef = useRef(2);
  const nextKey = () => keyRef.current++;

  const tipoPorId = useMemo(() => new Map(tipos.map((t) => [t.id, t])), [tipos]);

  // Construir el detalle (líneas) desde cantidades de pago + cortesías.
  const lineas: LineaVenta[] = useMemo(() => {
    const ls: LineaVenta[] = [];
    for (const t of tipos) {
      const c = cant[t.id] ?? 0;
      if (c <= 0) continue;
      const d = descuentos[t.id];
      // Sin descuento se cobra la tarifa; con descuento, lo que teclee el cajero (el servidor lo recorta).
      const cobrado = d ? Math.min(t.valor, Math.max(0, parseCOP(d.valor))) : t.valor;
      ls.push({
        tipo_visitante_id: t.id, codigo: t.codigo, cantidad: c,
        valor_lista: t.valor, valor_cobrado: cobrado, tipo_linea: "pago",
        motivo_descuento: d?.motivo || null,
        autorizado_por: d?.autoriza || null,
      });
    }
    for (const co of cortesias) {
      const t = tipoPorId.get(co.tipo_visitante_id);
      if (!t || co.cantidad <= 0) continue;
      ls.push({
        tipo_visitante_id: co.tipo_visitante_id, cantidad: co.cantidad, valor_lista: t.valor, valor_cobrado: 0,
        tipo_linea: co.tipo_linea, motivo_cortesia_id: co.motivo_cortesia_id || null, autorizado_por: co.autorizado_por || null,
      });
    }
    return ls;
  }, [cant, descuentos, cortesias, tipos, tipoPorId]);

  const totales = useMemo(() => calcularTotales(lineas), [lineas]);
  const pagosLimpios = useMemo(
    () => pagos.filter((p) => parseCOP(p.monto) > 0).map((p) => ({ medio_pago_id: p.medio_pago_id, monto: parseCOP(p.monto) })),
    [pagos],
  );
  const totalPagado = pagosLimpios.reduce((a, p) => a + p.monto, 0);
  const faltante = totales.total_cobrado - totalPagado;

  const validacion = useMemo(() => validarVenta(lineas, pagosLimpios), [lineas, pagosLimpios]);
  const puedeVender = lineas.length > 0 && validacion.ok && !enviando;

  function setCantidad(id: string, delta: number) {
    setCant((prev) => {
      const v = Math.max(0, (prev[id] ?? 0) + delta);
      return { ...prev, [id]: v };
    });
  }
  function setCantidadDirecta(id: string, valor: string) {
    const n = parseInt(valor.replace(/\D/g, ""), 10);
    setCant((prev) => ({ ...prev, [id]: Number.isNaN(n) ? 0 : n }));
  }

  function agregarCortesia() {
    setCortesias((prev) => [
      ...prev,
      { key: nextKey(), tipo_visitante_id: tipos[0]?.id ?? "", cantidad: 1, tipo_linea: "invitacion", motivo_cortesia_id: "", autorizado_por: "" },
    ]);
  }
  function actualizarCortesia(key: number, campo: keyof Cortesia, valor: string | number) {
    setCortesias((prev) => prev.map((c) => (c.key === key ? { ...c, [campo]: valor } : c)));
  }
  function quitarCortesia(key: number) {
    setCortesias((prev) => prev.filter((c) => c.key !== key));
  }

  function pagoExacto() {
    const efectivo = medios.find((m) => m.es_efectivo) ?? medios[0];
    setPagos([{ key: nextKey(), medio_pago_id: efectivo?.id ?? "", monto: String(totales.total_cobrado) }]);
  }
  function agregarPago() {
    setPagos((prev) => [...prev, { key: nextKey(), medio_pago_id: medios[0]?.id ?? "", monto: faltante > 0 ? String(faltante) : "" }]);
  }
  function actualizarPago(key: number, campo: "medio_pago_id" | "monto", valor: string) {
    setPagos((prev) => prev.map((p) => (p.key === key ? { ...p, [campo]: valor } : p)));
  }
  function quitarPago(key: number) {
    setPagos((prev) => (prev.length > 1 ? prev.filter((p) => p.key !== key) : prev));
  }

  function limpiar() {
    setCant({}); setCortesias([]); setDescuentos({}); setComprador({ nombre: "", documento: "" });
    setPagos([{ key: nextKey(), medio_pago_id: medios[0]?.id ?? "", monto: "" }]);
  }

  function alternarDescuento(tipoId: string, valorLista: number) {
    setDescuentos((prev) => {
      if (prev[tipoId]) {
        const { [tipoId]: _quitado, ...resto } = prev;
        return resto;
      }
      return { ...prev, [tipoId]: { valor: String(valorLista), motivo: "", autoriza: "" } };
    });
  }
  function actualizarDescuento(tipoId: string, campo: keyof Descuento, valor: string) {
    setDescuentos((prev) => (prev[tipoId] ? { ...prev, [tipoId]: { ...prev[tipoId], [campo]: valor } } : prev));
  }

  async function vender() {
    setEnviando(true);
    setResultado(null);
    const entrada: EntradaVenta = {
      lineas: lineas.map((l) => ({
        tipo_visitante_id: l.tipo_visitante_id, cantidad: l.cantidad, tipo_linea: l.tipo_linea,
        motivo_cortesia_id: l.motivo_cortesia_id ?? null, autorizado_por: l.autorizado_por ?? null,
        // Solo se manda si de verdad se cobró menos que la tarifa.
        valor_cobrado: l.valor_cobrado < l.valor_lista ? l.valor_cobrado : null,
        motivo_descuento: l.motivo_descuento ?? null,
      })),
      pagos: pagosLimpios,
      comprador_nombre: comprador.nombre,
      comprador_documento: comprador.documento,
    };
    const asistentes = totales.cantidad_asistentes;
    const r = await registrarVenta(entrada);
    setEnviando(false);
    if (r.ok) {
      setResultado({ ok: true, texto: `Venta #${r.numero_venta} registrada (${asistentes} manillas).` });
      setUltimaVenta({ id: r.venta_id, numero: r.numero_venta });
      limpiar();
    } else {
      setResultado({ ok: false, texto: r.error });
      setUltimaVenta(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-black text-ranch-marron">Taquilla</h1>
        <p className="text-sm text-ranch-marron/60">{caja} · {cajero}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_360px]">
        {/* Panel izquierdo: tipos + cortesías */}
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tipos.map((t) => {
              const c = cant[t.id] ?? 0;
              const d = descuentos[t.id];
              return (
                <div key={t.id} className={`rounded-xl border-2 p-3 ${c > 0 ? "border-ranch-dorado bg-white" : "border-ranch-marron/20 bg-white"}`}>
                  <p className="font-bold text-ranch-marron">{t.nombre}</p>
                  <p className="mb-2 text-sm text-ranch-marron/60">{t.valor > 0 ? formatearCOP(t.valor) : "Gratis"}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCantidad(t.id, -1)} className="h-10 w-10 rounded-lg bg-ranch-marron/10 text-xl font-bold text-ranch-marron hover:bg-ranch-marron/20">−</button>
                    <input
                      value={c || ""}
                      onChange={(e) => setCantidadDirecta(t.id, e.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      className="h-10 w-full rounded-lg border border-ranch-marron/20 text-center text-lg font-bold"
                    />
                    <button onClick={() => setCantidad(t.id, +1)} className="h-10 w-10 rounded-lg bg-ranch-marron text-xl font-bold text-ranch-crema hover:bg-ranch-marron-oscuro">+</button>
                  </div>

                  {/* Descuento: solo tiene sentido si el tipo cobra y hay unidades. */}
                  {t.requiere_pago && t.valor > 0 && c > 0 && (
                    <div className="mt-2 border-t border-ranch-marron/10 pt-2">
                      <button
                        onClick={() => alternarDescuento(t.id, t.valor)}
                        className={`text-xs font-semibold ${d ? "text-red-600" : "text-ranch-marron/60 hover:text-ranch-marron"}`}
                      >
                        {d ? "✕ Quitar descuento" : "% Aplicar descuento"}
                      </button>
                      {d && (
                        <div className="mt-2 space-y-1">
                          <input
                            value={d.valor ? formatearMiles(parseCOP(d.valor)) : ""}
                            onChange={(e) => actualizarDescuento(t.id, "valor", e.target.value)}
                            inputMode="numeric"
                            placeholder="Cobrar c/u"
                            className="w-full rounded border border-ranch-marron/25 px-2 py-1 text-right text-sm"
                          />
                          <input
                            value={d.motivo}
                            onChange={(e) => actualizarDescuento(t.id, "motivo", e.target.value)}
                            placeholder="Motivo (obligatorio)"
                            className="w-full rounded border border-ranch-marron/25 px-2 py-1 text-xs"
                          />
                          <select
                            value={d.autoriza}
                            onChange={(e) => actualizarDescuento(t.id, "autoriza", e.target.value)}
                            className="w-full rounded border border-ranch-marron/25 px-2 py-1 text-xs"
                          >
                            <option value="">Autoriza…</option>
                            {supervisores.map((sv) => <option key={sv.id} value={sv.id}>{sv.nombre}</option>)}
                          </select>
                          <p className="text-[11px] text-ranch-marron/50">
                            Descuento {formatearCOP(Math.max(0, t.valor - Math.min(t.valor, parseCOP(d.valor))))} c/u
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cortesías */}
          <div className="rounded-xl border-2 border-ranch-marron/20 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold text-ranch-marron">Cortesías (atención / invitación)</h2>
              <button onClick={agregarCortesia} className="rounded-lg bg-ranch-verde px-3 py-1 text-sm font-semibold text-white hover:opacity-90">+ Agregar</button>
            </div>
            {cortesias.length === 0 && <p className="text-sm text-ranch-marron/50">Sin cortesías. Requieren motivo y autorización.</p>}
            <div className="space-y-2">
              {cortesias.map((co) => (
                <div key={co.key} className="grid grid-cols-2 gap-2 rounded-lg bg-ranch-crema/40 p-2 sm:grid-cols-6">
                  <select value={co.tipo_linea} onChange={(e) => actualizarCortesia(co.key, "tipo_linea", e.target.value)} className="rounded border px-2 py-1 text-sm">
                    <option value="invitacion">Invitación</option>
                    <option value="atencion">Atención</option>
                  </select>
                  <select value={co.tipo_visitante_id} onChange={(e) => actualizarCortesia(co.key, "tipo_visitante_id", e.target.value)} className="rounded border px-2 py-1 text-sm">
                    {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                  <input value={co.cantidad} onChange={(e) => actualizarCortesia(co.key, "cantidad", parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)} inputMode="numeric" className="rounded border px-2 py-1 text-center text-sm" />
                  <select value={co.motivo_cortesia_id} onChange={(e) => actualizarCortesia(co.key, "motivo_cortesia_id", e.target.value)} className="rounded border px-2 py-1 text-sm">
                    <option value="">Motivo…</option>
                    {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                  <select value={co.autorizado_por} onChange={(e) => actualizarCortesia(co.key, "autorizado_por", e.target.value)} className="rounded border px-2 py-1 text-sm">
                    <option value="">Autoriza…</option>
                    {supervisores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                  <button onClick={() => quitarCortesia(co.key)} className="rounded bg-red-100 px-2 py-1 text-sm text-red-700 hover:bg-red-200">Quitar</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Panel derecho: totales + pagos */}
        <aside className="space-y-3 md:sticky md:top-4 md:self-start">
          <div className="rounded-xl border-4 border-ranch-marron bg-white p-4">
            <div className="flex justify-between text-sm text-ranch-marron/70"><span>Asistentes</span><span>{totales.cantidad_asistentes}</span></div>
            <div className="flex justify-between text-sm text-ranch-marron/70"><span>Valor lista</span><span>{formatearCOP(totales.total_lista)}</span></div>
            {totales.total_descuento > 0 && (
              <div className="flex justify-between text-sm text-ranch-marron/70"><span>Cortesías / descuento</span><span>−{formatearCOP(totales.total_descuento)}</span></div>
            )}
            <div className="mt-2 flex items-end justify-between border-t border-ranch-marron/15 pt-2">
              <span className="font-semibold text-ranch-marron">A cobrar</span>
              <span className="text-2xl font-black text-ranch-marron">{formatearCOP(totales.total_cobrado)}</span>
            </div>
          </div>

          {/* Comprador (opcional) */}
          <div className="rounded-xl border-2 border-ranch-marron/20 bg-white p-3">
            <h2 className="mb-2 font-bold text-ranch-marron">Comprador <span className="text-xs font-normal text-ranch-marron/50">(opcional)</span></h2>
            <div className="space-y-2">
              <input
                value={comprador.nombre}
                onChange={(e) => setComprador({ ...comprador, nombre: e.target.value })}
                placeholder="Nombre"
                className="w-full rounded border border-ranch-marron/25 px-2 py-1 text-sm"
              />
              <input
                value={comprador.documento}
                onChange={(e) => setComprador({ ...comprador, documento: e.target.value })}
                placeholder="Documento"
                className="w-full rounded border border-ranch-marron/25 px-2 py-1 text-sm"
              />
            </div>
          </div>

          {/* Pagos */}
          <div className="rounded-xl border-2 border-ranch-marron/20 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold text-ranch-marron">Pago</h2>
              <div className="flex gap-2">
                <button onClick={pagoExacto} className="rounded bg-ranch-verde px-2 py-1 text-xs font-semibold text-white">Efectivo exacto</button>
                <button onClick={agregarPago} className="rounded bg-ranch-marron/10 px-2 py-1 text-xs font-semibold text-ranch-marron">+ Medio</button>
              </div>
            </div>
            <div className="space-y-2">
              {pagos.map((p) => (
                <div key={p.key} className="flex gap-2">
                  <select value={p.medio_pago_id} onChange={(e) => actualizarPago(p.key, "medio_pago_id", e.target.value)} className="w-1/2 rounded border px-2 py-1 text-sm">
                    {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                  <input
                    value={p.monto ? formatearMiles(parseCOP(p.monto)) : ""}
                    onChange={(e) => actualizarPago(p.key, "monto", e.target.value)}
                    inputMode="numeric" placeholder="0"
                    className="w-1/2 rounded border px-2 py-1 text-right text-sm"
                  />
                  {pagos.length > 1 && <button onClick={() => quitarPago(p.key)} className="px-1 text-red-600">✕</button>}
                </div>
              ))}
            </div>
            <div className={`mt-2 flex justify-between text-sm ${faltante === 0 ? "text-ranch-verde" : "text-ranch-marron/70"}`}>
              <span>Pagado {formatearCOP(totalPagado)}</span>
              <span>{faltante > 0 ? `Falta ${formatearCOP(faltante)}` : faltante < 0 ? `Sobra ${formatearCOP(-faltante)}` : "Cuadra ✓"}</span>
            </div>
          </div>

          {resultado && (
            <p className={`rounded-lg px-3 py-2 text-sm ${resultado.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{resultado.texto}</p>
          )}
          {ultimaVenta && (
            <a
              href={`/imprimir/venta/${ultimaVenta.id}`}
              className="block rounded-lg bg-ranch-dorado px-4 py-3 text-center font-semibold text-white hover:opacity-90"
            >
              🖨️ Imprimir manillas (Venta #{ultimaVenta.numero})
            </a>
          )}
          {!validacion.ok && lineas.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{validacion.errores[0]}</p>
          )}

          <button
            onClick={vender}
            disabled={!puedeVender}
            className="w-full rounded-xl bg-ranch-marron px-4 py-4 text-lg font-bold text-ranch-crema hover:bg-ranch-marron-oscuro disabled:opacity-40"
          >
            {enviando ? "Registrando…" : "Registrar venta"}
          </button>
          <button onClick={limpiar} className="w-full rounded-lg border border-ranch-marron/20 px-4 py-2 text-sm text-ranch-marron/70 hover:bg-white">Limpiar</button>
        </aside>
      </div>
    </main>
  );
}
