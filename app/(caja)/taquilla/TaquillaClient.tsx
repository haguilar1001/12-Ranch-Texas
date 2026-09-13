"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registrarVenta, corregirVenta } from "./actions";
import IconoTipo from "@/components/IconoTipo";
import type { EntradaVenta, ResultadoVenta } from "@/lib/ventas/tipos";
import { calcularTotales, validarVenta, type LineaVenta } from "@/lib/ventas/calculo";
import { formatearCOP, formatearMiles, parseCOP } from "@/lib/dinero/cop";

interface Tipo {
  id: string;
  nombre: string;
  codigo: string;
  requiere_pago: boolean;
  valor: number;
  /** Emoji o ruta de imagen; ver components/IconoTipo. */
  icono: string | null;
  requiere_carnet: boolean;
  /** Bono o compra web: hay que verificarlo en la aplicación de bonos antes de vender. */
  requiere_escaneo: boolean;
}
interface Medio { id: string; nombre: string; es_efectivo: boolean }
interface Motivo { id: string; nombre: string }
interface Autorizador { id: string; nombre: string; cargo: string | null }

interface Cortesia {
  key: number;
  tipo_visitante_id: string;
  cantidad: number;
  tipo_linea: "invitacion" | "atencion" | "cortesia";
  motivo_cortesia_id: string;
  /** A nombre de quién entra. El motivo dice por qué; esto dice a quién. */
  beneficiario: string;
  autorizado_por: string;
}
interface FilaPago { key: number; medio_pago_id: string; monto: string }

/** Descuento aplicado a un tipo de visitante: cuánto se cobra por unidad, con motivo y quién autoriza. */
interface Descuento { valor: string; motivo: string; autoriza: string }

/** Si el servidor no contesta en este tiempo, se le avisa al cajero en vez de dejarlo esperando. */
const ESPERA_MAXIMA_MS = 20_000;

function nuevaClave(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Venta que se está corrigiendo: llega con sus líneas, pagos y comprador ya cargados. */
export interface VentaACorregir {
  id: string;
  numero: number;
  cajeroOriginal: string;
  lineas: {
    tipo_visitante_id: string;
    cantidad: number;
    tipo_linea: "pago" | "atencion" | "invitacion" | "cortesia";
    valor_lista: number;
    valor_cobrado: number;
    motivo_cortesia_id: string | null;
    beneficiario: string | null;
    escaneado: boolean;
    motivo_descuento: string | null;
    autorizado_por: string | null;
  }[];
  pagos: { medio_pago_id: string; monto: number }[];
  comprador: { nombre: string; documento: string; celular: string; email: string };
}

export default function TaquillaClient({
  cajero, caja, tipos, medios, motivos, autorizadores, correccion, puedeCorregir = false,
}: {
  cajero: string; caja: string; tipos: Tipo[]; medios: Medio[]; motivos: Motivo[];
  autorizadores: Autorizador[]; correccion?: VentaACorregir | null;
  /** Solo supervisor y administrador ven el atajo para arreglar una venta ya hecha. */
  puedeCorregir?: boolean;
}) {
  const [cant, setCant] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    for (const l of correccion?.lineas ?? []) {
      if (l.tipo_linea === "pago") inicial[l.tipo_visitante_id] = (inicial[l.tipo_visitante_id] ?? 0) + l.cantidad;
    }
    return inicial;
  });
  const [descuentos, setDescuentos] = useState<Record<string, Descuento>>(() => {
    const inicial: Record<string, Descuento> = {};
    for (const l of correccion?.lineas ?? []) {
      if (l.tipo_linea !== "pago" || l.valor_cobrado >= l.valor_lista) continue;
      inicial[l.tipo_visitante_id] = {
        valor: String(l.valor_cobrado),
        motivo: l.motivo_descuento ?? "",
        autoriza: l.autorizado_por ?? "",
      };
    }
    return inicial;
  });
  // Qué bonos ya pasó el cajero por la aplicación de bonos. Se marca por TIPO, no por
  // línea: la pregunta que se hace el cajero es "¿ya escaneé los bonos de Coomeva?".
  const [escaneados, setEscaneados] = useState<Record<string, boolean>>(() => {
    const inicial: Record<string, boolean> = {};
    for (const l of correccion?.lineas ?? []) if (l.escaneado) inicial[l.tipo_visitante_id] = true;
    return inicial;
  });
  const [comprador, setComprador] = useState(
    correccion?.comprador ?? { nombre: "", documento: "", celular: "", email: "" },
  );
  const [cortesias, setCortesias] = useState<Cortesia[]>(() =>
    (correccion?.lineas ?? [])
      .filter((l) => l.tipo_linea !== "pago")
      .map((l, i) => ({
        key: -(i + 1),
        tipo_visitante_id: l.tipo_visitante_id,
        cantidad: l.cantidad,
        tipo_linea: l.tipo_linea as Cortesia["tipo_linea"],
        motivo_cortesia_id: l.motivo_cortesia_id ?? "",
        beneficiario: l.beneficiario ?? "",
        autorizado_por: l.autorizado_por ?? "",
      })),
  );
  const [motivoCorreccion, setMotivoCorreccion] = useState("");
  const [pagos, setPagos] = useState<FilaPago[]>(() =>
    correccion?.pagos.length
      ? correccion.pagos.map((p, i) => ({ key: -(i + 1), medio_pago_id: p.medio_pago_id, monto: String(p.monto) }))
      : [{ key: 1, medio_pago_id: medios[0]?.id ?? "", monto: "" }],
  );
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<{ id: string; numero: number } | null>(null);
  /** Comprobante de la venta que acaba de entrar: se queda en pantalla hasta que el cajero lo cierra. */
  const [confirmacion, setConfirmacion] = useState<
    { numero: number; ventaId: string; total: number; asistentes: number; manillas: number; comprador: string } | null
  >(null);
  /** Cuando el servidor no contesta (internet caído), se avisa fuerte y se puede reintentar. */
  const [sinRespuesta, setSinRespuesta] = useState(false);
  const router = useRouter();
  const keyRef = useRef(2);
  const nextKey = () => keyRef.current++;

  /**
   * Llave de ESTE intento de venta. Se mantiene igual mientras el cajero reintente,
   * para que el servidor reconozca el reintento y no cree la venta dos veces. Se
   * renueva cuando la venta queda registrada o cuando se limpia la pantalla.
   */
  const claveRef = useRef<string>(nuevaClave());

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
        escaneado: !!escaneados[t.id],
      });
    }
    for (const co of cortesias) {
      const t = tipoPorId.get(co.tipo_visitante_id);
      if (!t || co.cantidad <= 0) continue;
      ls.push({
        tipo_visitante_id: co.tipo_visitante_id, cantidad: co.cantidad, valor_lista: t.valor, valor_cobrado: 0,
        tipo_linea: co.tipo_linea, motivo_cortesia_id: co.motivo_cortesia_id || null,
        beneficiario: co.beneficiario || null, autorizado_por: co.autorizado_por || null,
        escaneado: !!escaneados[co.tipo_visitante_id],
      });
    }
    return ls;
  }, [cant, descuentos, cortesias, tipos, tipoPorId, escaneados]);

  const totales = useMemo(() => calcularTotales(lineas), [lineas]);
  const pagosLimpios = useMemo(
    () => pagos.filter((p) => parseCOP(p.monto) > 0).map((p) => ({ medio_pago_id: p.medio_pago_id, monto: parseCOP(p.monto) })),
    [pagos],
  );
  const totalPagado = pagosLimpios.reduce((a, p) => a + p.monto, 0);

  // El cajero escribe lo que le ENTREGAN. Si el efectivo se pasa del total, la diferencia
  // es el vuelto: sale de la caja otra vez, así que no se registra como pago. Lo que se
  // guarda es lo que QUEDA en el cajón, que es contra lo que cuadra el arqueo de la noche.
  const efectivoIds = useMemo(() => new Set(medios.filter((m) => m.es_efectivo).map((m) => m.id)), [medios]);
  const pagosAjustados = useMemo(() => {
    let porDevolver = Math.max(0, totalPagado - totales.total_cobrado);
    const ajustados = pagosLimpios.map((p) => ({ ...p }));
    // Se devuelve de las líneas de efectivo, de la última hacia atrás.
    for (let i = ajustados.length - 1; i >= 0 && porDevolver > 0; i--) {
      if (!efectivoIds.has(ajustados[i].medio_pago_id)) continue;
      const quita = Math.min(ajustados[i].monto, porDevolver);
      ajustados[i].monto -= quita;
      porDevolver -= quita;
    }
    return ajustados.filter((p) => p.monto > 0);
  }, [pagosLimpios, totalPagado, totales.total_cobrado, efectivoIds]);

  const totalEnCaja = pagosAjustados.reduce((a, p) => a + p.monto, 0);
  const vuelto = totalPagado - totalEnCaja;
  const faltante = totales.total_cobrado - totalEnCaja;
  /** Sobró plata que no es efectivo: una transferencia o un datáfono tiene que ir exacto. */
  const sobraElectronico = faltante < 0;

  const validacion = useMemo(() => validarVenta(lineas, pagosAjustados), [lineas, pagosAjustados]);

  // El nombre y el celular del comprador son obligatorios: sin eso no hay a quién
  // buscar si después toca corregir la venta o reponer una manilla.
  const faltaNombre = comprador.nombre.trim() === "";
  const faltaCelular = comprador.celular.replace(/D/g, "").length < 7;
  const faltaComprador = faltaNombre || faltaCelular;

  // Una cortesía sin beneficiario no sirve de control: hay que saber quién entró gratis.
  const faltaBeneficiario = cortesias.some((c) => c.cantidad > 0 && !c.beneficiario.trim());

  // Los bonos y la compra por la web se verifican en la aplicación de bonos del PC antes
  // de entregar la manilla. Sin esa marca no se puede vender: un bono ya usado entraría
  // igual y el parque lo descubriría cuando Coomeva no lo pague.
  const enUso = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, c] of Object.entries(cant)) if (c > 0) ids.add(id);
    for (const co of cortesias) if (co.cantidad > 0) ids.add(co.tipo_visitante_id);
    return ids;
  }, [cant, cortesias]);
  const porEscanear = useMemo(
    () => tipos.filter((t) => t.requiere_escaneo && enUso.has(t.id) && !escaneados[t.id]),
    [tipos, enUso, escaneados],
  );
  const faltaEscaneo = porEscanear.length > 0;

  const puedeVender =
    lineas.length > 0 && validacion.ok && !faltaComprador && !faltaBeneficiario && !faltaEscaneo && !enviando;

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
      { key: nextKey(), tipo_visitante_id: tipos[0]?.id ?? "", cantidad: 1, tipo_linea: "invitacion", motivo_cortesia_id: "", beneficiario: "", autorizado_por: "" },
    ]);
  }
  function actualizarCortesia(key: number, campo: keyof Cortesia, valor: string | number) {
    setCortesias((prev) => prev.map((c) => (c.key === key ? { ...c, [campo]: valor } : c)));
  }
  function quitarCortesia(key: number) {
    setCortesias((prev) => prev.filter((c) => c.key !== key));
  }

  const hayEfectivo = pagos.some((p) => efectivoIds.has(p.medio_pago_id));

  /**
   * Los botones de billete SUMAN sobre la línea de efectivo: el cajero va contando lo
   * que recibe tal cual se lo entregan (dos de veinte = dos toques en 20.000).
   * `monto` en null vuelve la línea a cero, para cuando se pasó contando.
   */
  function sumarEnEfectivo(monto: number | null) {
    setPagos((prev) => {
      const i = prev.findIndex((p) => efectivoIds.has(p.medio_pago_id));
      if (i < 0) return prev;
      return prev.map((p, k) =>
        k === i ? { ...p, monto: monto === null ? "" : String(parseCOP(p.monto) + monto) } : p,
      );
    });
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
    setCant({}); setCortesias([]); setDescuentos({}); setEscaneados({});
    setComprador({ nombre: "", documento: "", celular: "", email: "" });
    setPagos([{ key: nextKey(), medio_pago_id: medios[0]?.id ?? "", monto: "" }]);
    // Nueva llave: lo que venga es una venta distinta, no un reintento de la anterior.
    claveRef.current = nuevaClave();
    setSinRespuesta(false);
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
    setSinRespuesta(false);
    const entrada: EntradaVenta = {
      clave_idempotencia: claveRef.current,
      lineas: lineas.map((l) => ({
        tipo_visitante_id: l.tipo_visitante_id, cantidad: l.cantidad, tipo_linea: l.tipo_linea,
        motivo_cortesia_id: l.motivo_cortesia_id ?? null, beneficiario: l.beneficiario ?? null,
        escaneado: !!l.escaneado,
        autorizado_por: l.autorizado_por ?? null,
        // Solo se manda si de verdad se cobró menos que la tarifa.
        valor_cobrado: l.valor_cobrado < l.valor_lista ? l.valor_cobrado : null,
        motivo_descuento: l.motivo_descuento ?? null,
      })),
      // Lo que de verdad entra a la caja: el vuelto ya está descontado.
      pagos: pagosAjustados,
      comprador_nombre: comprador.nombre,
      comprador_documento: comprador.documento,
      comprador_celular: comprador.celular,
      comprador_email: comprador.email,
    };
    const asistentes = totales.cantidad_asistentes;
    // Los bebés entran en brazos: cuentan como asistentes pero no llevan manilla.
    const bebes = lineas
      .filter((l) => tipoPorId.get(l.tipo_visitante_id)?.codigo === "bebe")
      .reduce((a, l) => a + l.cantidad, 0);
    const manillas = asistentes - bebes;

    // Si el internet se cae, la petición se queda colgada y antes el botón se quedaba
    // en "Registrando…" para siempre: el cajero entregaba las manillas creyendo que la
    // venta entró. Ahora se le pone un tope de espera y se avisa.
    let r: ResultadoVenta;
    try {
      r = await Promise.race([
        correccion ? corregirVenta(correccion.id, entrada, motivoCorreccion) : registrarVenta(entrada),
        new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("sin respuesta")), ESPERA_MAXIMA_MS)),
      ]);
    } catch {
      setEnviando(false);
      setSinRespuesta(true);
      setUltimaVenta(null);
      return; // No se limpia nada: la venta queda armada para volver a intentarla.
    }

    setEnviando(false);
    if (r.ok) {
      const detalle = bebes > 0
        ? `${asistentes} asistentes · ${manillas} manillas (${bebes} bebé${bebes > 1 ? "s" : ""} sin manilla)`
        : `${manillas} manillas`;
      setResultado({
        ok: true,
        texto: r.repetida
          ? `Esta venta ya estaba registrada con el número #${r.numero_venta}: no se duplicó.`
          : correccion
            ? `Venta #${correccion.numero} corregida: queda anulada y la reemplaza la #${r.numero_venta} · ${detalle}.`
            : `Venta #${r.numero_venta} registrada · ${detalle}.`,
      });
      setUltimaVenta({ id: r.venta_id, numero: r.numero_venta });
      // Comprobante en pantalla: el cajero tiene que VER que la venta quedó, con su
      // consecutivo, antes de entregar las manillas.
      setConfirmacion({
        numero: r.numero_venta,
        ventaId: r.venta_id,
        total: totales.total_cobrado,
        asistentes,
        manillas,
        comprador: comprador.nombre.trim(),
      });
      limpiar();
      // Corrigiendo ya no hay nada que hacer en esta URL (la venta original quedó
      // anulada): se pasa a la venta nueva, que es la que hay que imprimir.
      if (correccion) router.replace(`/imprimir/venta/${r.venta_id}`);
    } else {
      setResultado({ ok: false, texto: r.error });
      setUltimaVenta(null);
    }
  }

  const exigenCarnet = tipos.some((t) => t.requiere_carnet);

  return (
    <main className="mx-auto max-w-7xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-ranch-marron">
          {correccion ? `Corregir venta #${correccion.numero}` : "Taquilla"}
        </h1>
        <div className="flex items-center gap-2">
          {/* Atajo para arreglar una venta ya hecha, sin salir a buscarla en el menú. */}
          {puedeCorregir && !correccion && (
            <a
              href="/caja/ventas"
              className="rounded-full border-2 border-ranch-dorado px-3 py-1 text-sm font-semibold text-ranch-marron hover:bg-ranch-dorado/10"
            >
              ✏️ Corregir una venta
            </a>
          )}
          <p className="rounded-full bg-white px-3 py-1 text-sm text-ranch-marron/70 ring-1 ring-ranch-marron/10">
            🏛️ {caja} · 👤 {cajero}
          </p>
        </div>
      </header>

      {correccion && (
        <div className="mb-4 rounded-2xl border-2 border-ranch-dorado bg-ranch-dorado/10 p-3">
          <p className="text-sm font-semibold text-ranch-marron">
            ✏️ Estás corrigiendo la venta #{correccion.numero} de {correccion.cajeroOriginal}.
          </p>
          <p className="mb-2 text-xs text-ranch-marron/70">
            Al guardar, esa venta y sus manillas quedan anuladas y nacen unas nuevas con lo que dejes
            aquí. Las manillas que ya se imprimieron hay que recogerlas.
          </p>
          <input
            value={motivoCorreccion}
            onChange={(e) => setMotivoCorreccion(e.target.value)}
            placeholder="Motivo de la corrección (obligatorio)"
            className="w-full rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm focus:border-ranch-dorado focus:outline-none"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Panel izquierdo: comprador + tipos + cortesías */}
        <section className="space-y-4">
          {/* Comprador — a la izquierda, antes de contar entradas. */}
          <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-ranch-marron">
              🧾 Comprador
              <span className="text-xs font-normal text-ranch-marron/45">es quien paga y firma</span>
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <input
                value={comprador.nombre}
                onChange={(e) => setComprador({ ...comprador, nombre: e.target.value })}
                placeholder="Nombre *"
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none ${faltaNombre ? "border-red-400 bg-red-50/50 focus:border-red-500" : "border-ranch-marron/25 focus:border-ranch-dorado"}`}
              />
              <input
                value={comprador.documento}
                onChange={(e) => setComprador({ ...comprador, documento: e.target.value })}
                placeholder="Documento"
                inputMode="numeric"
                className="rounded-lg border border-ranch-marron/25 px-3 py-2 text-sm focus:border-ranch-dorado focus:outline-none"
              />
              <input
                value={comprador.celular}
                onChange={(e) => setComprador({ ...comprador, celular: e.target.value })}
                placeholder="Celular *"
                inputMode="tel"
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none ${faltaCelular ? "border-red-400 bg-red-50/50 focus:border-red-500" : "border-ranch-marron/25 focus:border-ranch-dorado"}`}
              />
              <input
                value={comprador.email}
                onChange={(e) => setComprador({ ...comprador, email: e.target.value })}
                placeholder="Correo electrónico"
                inputMode="email"
                type="email"
                className="rounded-lg border border-ranch-marron/25 px-3 py-2 text-sm focus:border-ranch-dorado focus:outline-none"
              />
            </div>
            {faltaComprador && (
              <p className="mt-2 text-xs font-semibold text-red-600">
                * El nombre y el celular son obligatorios para registrar la venta.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tipos.map((t) => {
              const c = cant[t.id] ?? 0;
              const d = descuentos[t.id];
              return (
                <div
                  key={t.id}
                  className={`relative flex flex-col rounded-2xl border-2 p-3 shadow-sm transition ${
                    // Fondo según el tipo de cliente: particular en blanco, convenio con
                    // carnet en azul. El borde dorado solo marca lo que ya se escogió.
                    t.requiere_carnet ? "bg-sky-50" : "bg-white"
                  } ${
                    c > 0
                      ? "border-ranch-dorado ring-2 ring-ranch-dorado/20"
                      : t.requiere_carnet
                        ? "border-sky-200 hover:border-sky-300 hover:shadow"
                        : "border-ranch-marron/15 hover:border-ranch-marron/30 hover:shadow"
                  }`}
                >
                  {c > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-ranch-dorado px-1.5 text-xs font-black text-white shadow">
                      {c}
                    </span>
                  )}

                  <div className="mb-3 flex items-start gap-2">
                    <IconoTipo icono={t.icono} nombre={t.nombre} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-tight text-ranch-marron">
                        {t.nombre}
                        {t.requiere_carnet && <sup className="ml-0.5 text-base font-black text-ranch-dorado">*</sup>}
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          t.valor > 0 ? "bg-ranch-crema text-ranch-marron/75" : "bg-ranch-verde/15 text-ranch-verde"
                        }`}
                      >
                        {t.valor > 0 ? formatearCOP(t.valor) : "Gratis"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-1.5">
                    <button
                      onClick={() => setCantidad(t.id, -1)}
                      aria-label={`Quitar un ${t.nombre}`}
                      className="h-10 w-10 shrink-0 rounded-xl bg-ranch-marron/10 text-xl font-bold text-ranch-marron hover:bg-ranch-marron/20 active:scale-95"
                    >−</button>
                    <input
                      value={c || ""}
                      onChange={(e) => setCantidadDirecta(t.id, e.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={`Cantidad de ${t.nombre}`}
                      className="h-10 w-full min-w-0 rounded-xl border border-ranch-marron/20 text-center text-lg font-bold focus:border-ranch-dorado focus:outline-none"
                    />
                    <button
                      onClick={() => setCantidad(t.id, +1)}
                      aria-label={`Agregar un ${t.nombre}`}
                      className="h-10 w-10 shrink-0 rounded-xl bg-ranch-marron text-xl font-bold text-ranch-crema hover:bg-ranch-marron-oscuro active:scale-95"
                    >+</button>
                  </div>

                  {/* Bonos y web: el cajero confirma que ya lo pasó por la aplicación de bonos. */}
                  {t.requiere_escaneo && enUso.has(t.id) && (
                    <label
                      className={`mt-2 flex cursor-pointer items-center gap-2 rounded-lg border-2 px-2 py-1.5 text-xs font-semibold transition ${
                        escaneados[t.id]
                          ? "border-ranch-verde bg-ranch-verde/10 text-ranch-verde"
                          : "border-red-300 bg-red-50 text-red-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!escaneados[t.id]}
                        onChange={(e) => setEscaneados((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                        className="h-4 w-4 shrink-0 accent-ranch-verde"
                      />
                      {escaneados[t.id] ? "Escaneado ✓" : "Escanear el bono"}
                    </label>
                  )}

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
                            {autorizadores.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.cargo ? ` · ${a.cargo}` : ""}</option>)}
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

          {/* Qué significa cada color de tarjeta, a la vista del cajero. */}
          {exigenCarnet && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-ranch-marron/10 bg-white/70 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="h-4 w-6 shrink-0 rounded border-2 border-ranch-marron/20 bg-white" />
                <span className="text-ranch-marron/75">Cliente particular</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-4 w-6 shrink-0 rounded border-2 border-sky-200 bg-sky-50" />
                <span className="font-semibold text-ranch-marron">
                  <span className="text-ranch-dorado">*</span> Debe presentar carnet
                </span>
              </span>
            </div>
          )}

          {/* Cortesías */}
          <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold text-ranch-marron">Cortesías (atención / invitación / cortesía)</h2>
              <button onClick={agregarCortesia} className="rounded-lg bg-ranch-verde px-3 py-1 text-sm font-semibold text-white hover:opacity-90">+ Agregar</button>
            </div>
            {cortesias.length === 0 && <p className="text-sm text-ranch-marron/50">Sin cortesías. Requieren beneficiario, motivo y autorización.</p>}
            {faltaBeneficiario && <p className="mb-2 text-xs font-semibold text-red-600">* Falta el nombre del beneficiario: a nombre de quién entra la cortesía.</p>}
            <div className="space-y-2">
              {cortesias.map((co) => (
                <div key={co.key} className="grid grid-cols-2 gap-2 rounded-lg bg-ranch-crema/40 p-2 sm:grid-cols-7">
                  <select value={co.tipo_linea} onChange={(e) => actualizarCortesia(co.key, "tipo_linea", e.target.value)} className="rounded border px-2 py-1 text-sm">
                    <option value="invitacion">Invitación</option>
                    <option value="atencion">Atención</option>
                    <option value="cortesia">Cortesía</option>
                  </select>
                  <select value={co.tipo_visitante_id} onChange={(e) => actualizarCortesia(co.key, "tipo_visitante_id", e.target.value)} className="rounded border px-2 py-1 text-sm">
                    {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                  <input value={co.cantidad} onChange={(e) => actualizarCortesia(co.key, "cantidad", parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)} inputMode="numeric" className="rounded border px-2 py-1 text-center text-sm" />
                  <select value={co.motivo_cortesia_id} onChange={(e) => actualizarCortesia(co.key, "motivo_cortesia_id", e.target.value)} className="rounded border px-2 py-1 text-sm">
                    <option value="">Motivo…</option>
                    {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                  {/* A nombre de quién entra. El motivo dice POR QUÉ; esto dice A QUIÉN. */}
                  <input
                    value={co.beneficiario}
                    onChange={(e) => actualizarCortesia(co.key, "beneficiario", e.target.value)}
                    placeholder="Beneficiario *"
                    className={`rounded border px-2 py-1 text-sm ${co.beneficiario.trim() ? "" : "border-red-400 bg-red-50/50"}`}
                  />
                  <select value={co.autorizado_por} onChange={(e) => actualizarCortesia(co.key, "autorizado_por", e.target.value)} className="rounded border px-2 py-1 text-sm">
                    <option value="">Autoriza…</option>
                    {autorizadores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                  <button onClick={() => quitarCortesia(co.key)} className="rounded bg-red-100 px-2 py-1 text-sm text-red-700 hover:bg-red-200">Quitar</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Panel derecho: totales + pagos */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border-4 border-ranch-marron bg-white p-4 shadow-sm">
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

          {/* Pagos */}
          <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-3 shadow-sm">
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
            {/* Los billetes que circulan: se va sumando uno por cada uno que recibe. */}
            {hayEfectivo && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {[10000, 20000, 50000, 100000].map((b) => (
                  <button
                    key={b}
                    onClick={() => sumarEnEfectivo(b)}
                    title={`Sumar un billete de ${formatearCOP(b)}`}
                    className="rounded bg-ranch-marron/10 px-2 py-1 text-xs font-semibold text-ranch-marron hover:bg-ranch-marron/20 active:scale-95"
                  >
                    +{formatearMiles(b)}
                  </button>
                ))}
                <button
                  onClick={() => sumarEnEfectivo(null)}
                  title="Volver el efectivo a cero"
                  className="rounded px-2 py-1 text-xs font-semibold text-ranch-marron/50 hover:bg-red-50 hover:text-red-600"
                >
                  ↺
                </button>
              </div>
            )}

            <div className="mt-2 flex justify-between text-sm text-ranch-marron/70">
              <span>Entregan {formatearCOP(totalPagado)}</span>
              {faltante > 0 ? (
                <span>Falta {formatearCOP(faltante)}</span>
              ) : sobraElectronico ? (
                <span className="text-amber-700">Sobra {formatearCOP(-faltante)}</span>
              ) : (
                <span className="text-ranch-verde">Cuadra ✓</span>
              )}
            </div>

            {/* El vuelto es la plata que vuelve a salir: no se registra como pago. */}
            {vuelto > 0 && (
              <div className="mt-2 rounded-lg bg-ranch-verde/10 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ranch-marron">Vuelto a entregar</span>
                  <span className="text-2xl font-black text-ranch-verde">{formatearCOP(vuelto)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ranch-marron/55">
                  Entra a la caja {formatearCOP(totalEnCaja)}.
                </p>
              </div>
            )}

            {sobraElectronico && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Sobran {formatearCOP(-faltante)} que no son efectivo: un datáfono o una transferencia
                tienen que ir por el valor exacto, porque de ahí no se devuelve vuelto.
              </p>
            )}
          </div>

          {/* El internet se cayó a mitad del registro: hay que decirlo fuerte, porque el
              cajero está a punto de entregar manillas de una venta que puede no existir. */}
          {sinRespuesta && (
            <div className="rounded-xl border-4 border-red-600 bg-red-50 p-3">
              <p className="font-black text-red-700">⚠ NO SE PUDO CONFIRMAR LA VENTA</p>
              <p className="mt-1 text-sm text-red-800">
                El servidor no contestó: seguramente se cayó el internet. <strong>No entregues las manillas todavía.</strong>
              </p>
              <p className="mt-1 text-sm text-red-800">
                Revisa la conexión y vuelve a darle <strong>Registrar venta</strong>. La venta quedó armada tal como
                estaba y la app no la va a duplicar: si el primer intento sí había entrado, te lo dice y te da su número.
              </p>
            </div>
          )}

          {/* Comprobante de la venta que acabó de entrar. Se queda hasta que el cajero
              lo cierra: es la prueba de que quedó registrada, con su consecutivo. */}
          {confirmacion && (
            <div className="rounded-2xl border-4 border-ranch-verde bg-white p-4 text-center shadow">
              <p className="text-sm font-bold uppercase tracking-wide text-ranch-verde">✓ Venta registrada</p>
              <p className="my-1 text-5xl font-black leading-none text-ranch-marron">#{confirmacion.numero}</p>
              <p className="text-xs uppercase tracking-wide text-ranch-marron/50">Consecutivo</p>

              <div className="mt-3 space-y-0.5 border-t border-ranch-marron/10 pt-3 text-sm text-ranch-marron/80">
                <p className="text-lg font-black text-ranch-marron">{formatearCOP(confirmacion.total)}</p>
                <p>
                  {confirmacion.asistentes} asistente{confirmacion.asistentes === 1 ? "" : "s"} ·{" "}
                  {confirmacion.manillas} manilla{confirmacion.manillas === 1 ? "" : "s"}
                </p>
                {/* En mayúsculas, igual que quedó guardado. */}
                {confirmacion.comprador && <p className="uppercase text-ranch-marron/60">{confirmacion.comprador}</p>}
              </div>

              <a
                href={`/imprimir/venta/${confirmacion.ventaId}`}
                className="mt-3 block rounded-lg bg-ranch-dorado px-4 py-3 font-semibold text-white hover:opacity-90"
              >
                🖨️ Imprimir manillas
              </a>
              <button
                onClick={() => { setConfirmacion(null); setResultado(null); }}
                className="mt-2 w-full rounded-lg border border-ranch-marron/25 px-4 py-2 text-sm font-semibold text-ranch-marron hover:bg-ranch-crema/60"
              >
                Entendido, siguiente venta
              </button>
            </div>
          )}

          {resultado && !confirmacion && (
            <p className={`rounded-lg px-3 py-2 text-sm ${resultado.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{resultado.texto}</p>
          )}
          {ultimaVenta && !confirmacion && (
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
          {faltaEscaneo && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              Falta escanear en la aplicación de bonos: {porEscanear.map((t) => t.nombre).join(", ")}. Marca el
              cuadrito de la tarjeta cuando lo hayas verificado.
            </p>
          )}

          <button
            onClick={vender}
            disabled={!puedeVender}
            className={`w-full rounded-xl px-4 py-4 text-lg font-bold text-ranch-crema disabled:opacity-40 ${
              sinRespuesta ? "bg-red-600 hover:bg-red-700" : "bg-ranch-marron hover:bg-ranch-marron-oscuro"
            }`}
          >
            {enviando
              ? correccion ? "Corrigiendo…" : "Registrando…"
              : sinRespuesta ? "Volver a intentar" : correccion ? "Guardar corrección" : "Registrar venta"}
          </button>
          {correccion ? (
            <a href="/caja/ventas" className="block w-full rounded-lg border border-ranch-marron/20 px-4 py-2 text-center text-sm text-ranch-marron/70 hover:bg-white">
              Cancelar y volver a las ventas
            </a>
          ) : (
            <button onClick={limpiar} className="w-full rounded-lg border border-ranch-marron/20 px-4 py-2 text-sm text-ranch-marron/70 hover:bg-white">Limpiar</button>
          )}
        </aside>
      </div>
    </main>
  );
}
