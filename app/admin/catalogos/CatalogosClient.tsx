"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP } from "@/lib/dinero/cop";
import SubirCatalogo from "@/components/SubirCatalogo";
import { CONDICIONES_PAGO, TIPOS_PROVEEDOR, UNIDADES, etiquetaCondicion } from "@/lib/catalogos/validar";
import {
  guardarProveedor, cambiarEstadoProveedor, guardarMateriaPrima, cambiarEstadoMateriaPrima,
  guardarRubro, cambiarEstadoRubro, guardarArea, cambiarEstadoArea,
  guardarAlimento, cambiarEstadoAlimento, guardarGrupoEquipo, cambiarEstadoGrupoEquipo,
  type Resultado,
} from "./actions";

type Valores = Record<string, string>;
interface FilaBase { id: string; activo: boolean; nombre: string }

interface Proveedor extends FilaBase {
  nit_cedula: string; contacto: string; telefono: string; email: string; direccion: string; ciudad: string; tipo: string;
  suministra: string; condiciones_pago: string; observaciones: string; usos: number;
}
interface Materia extends FilaBase { categoria: string; unidad_medida: string; costo_referencia: string; proveedor_id: string; proveedor: string; observaciones: string }
interface Rubro extends FilaBase { nivel: string; padre_id: string; orden: string; ruta: string; usos: number; hijos: number }
interface Alimento extends FilaBase { tipo: string; unidad_medida: string; costo_unitario: string; equivalencia_g: string }
interface Grupo extends FilaBase { descripcion: string; usos: number }
interface Area extends FilaBase { descripcion: string; empleados: number; usos: number }

interface Props {
  tabInicial?: string;
  proveedores: Proveedor[]; materias: Materia[]; rubros: Rubro[]; alimentos: Alimento[]; grupos: Grupo[]; areas: Area[];
}

const input = "w-full rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm";
const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const botonSec = "rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60 disabled:opacity-50";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";

interface Campo {
  k: string;
  label: string;
  tipo?: "texto" | "area" | "select" | "numero";
  opciones?: (v: Valores) => { id: string; label: string }[];
  sugerencias?: string[];
  ancho?: boolean;
  obligatorio?: boolean;
  ayuda?: string;
  /** Se muestra solo si devuelve true. */
  ver?: (v: Valores) => boolean;
}

interface Config<F extends FilaBase> {
  id: string;
  titulo: string;
  singular: string;
  ayuda: string;
  filas: F[];
  campos: Campo[];
  columnas: { label: string; valor: (f: F) => ReactNode; derecha?: boolean }[];
  vacio: Valores;
  guardar: (id: string | null, v: Valores) => Promise<Resultado>;
  estado: (id: string, activo: boolean) => Promise<Resultado>;
  /** Texto extra para el buscador. */
  buscar?: (f: F) => string;
  sangria?: (f: F) => number;
}

const NIVELES = [{ id: "grupo", label: "Grupo" }, { id: "rubro", label: "Rubro (dentro de un grupo)" }, { id: "subrubro", label: "Subrubro (dentro de un rubro)" }];

export default function CatalogosClient(p: Props) {
  const proveedoresActivos = p.proveedores.filter((x) => x.activo).map((x) => ({ id: x.id, label: x.nombre }));

  const configs = [
    {
      id: "proveedores", titulo: "Proveedores", singular: "proveedor",
      ayuda: "A quién le compramos. También se crean solos al registrar un gasto o un equipo con un proveedor nuevo; aquí se completan sus datos.",
      filas: p.proveedores,
      campos: [
        { k: "nombre", label: "Nombre o razón social", obligatorio: true, ancho: true },
        { k: "nit_cedula", label: "NIT o cédula" },
        { k: "tipo", label: "Tipo de proveedor", sugerencias: TIPOS_PROVEEDOR, ayuda: "Escoge uno o escribe otro" },
        { k: "contacto", label: "Persona de contacto" },
        { k: "telefono", label: "Teléfono" },
        { k: "email", label: "Correo" },
        { k: "direccion", label: "Dirección" },
        { k: "ciudad", label: "Ciudad" },
        { k: "condiciones_pago", label: "Condiciones de pago", tipo: "select", opciones: () => CONDICIONES_PAGO },
        { k: "suministra", label: "Qué nos suministra", tipo: "area", ancho: true, ayuda: "Productos o servicios que le compramos" },
        { k: "observaciones", label: "Observaciones", tipo: "area", ancho: true },
      ],
      columnas: [
        { label: "Proveedor", valor: (f: Proveedor) => <><b>{f.nombre}</b>{f.nit_cedula && <span className="block text-xs text-ranch-marron/60">NIT/CC {f.nit_cedula}</span>}</> },
        { label: "Tipo · suministra", valor: (f: Proveedor) => <>{f.tipo}{f.suministra && <span className="block text-xs text-ranch-marron/60">{f.suministra}</span>}</> },
        { label: "Contacto", valor: (f: Proveedor) => <>{f.contacto}{(f.telefono || f.email) && <span className="block text-xs text-ranch-marron/60">{[f.telefono, f.email].filter(Boolean).join(" · ")}</span>}</> },
        { label: "Ciudad", valor: (f: Proveedor) => f.ciudad },
        { label: "Pago", valor: (f: Proveedor) => etiquetaCondicion(f.condiciones_pago) },
        { label: "Usos", valor: (f: Proveedor) => f.usos || "—", derecha: true },
      ],
      vacio: { nombre: "", nit_cedula: "", tipo: "", contacto: "", telefono: "", email: "", direccion: "", ciudad: "", condiciones_pago: "", suministra: "", observaciones: "" },
      guardar: (id: string | null, v: Valores) => guardarProveedor(id, { ...v, nombre: v.nombre }),
      estado: cambiarEstadoProveedor,
      buscar: (f: Proveedor) => [f.nit_cedula, f.tipo, f.suministra, f.contacto, f.ciudad, f.telefono].join(" "),
    } satisfies Config<Proveedor>,
    {
      id: "materias", titulo: "Materias primas", singular: "materia prima",
      ayuda: "Insumos que compra el parque, con su unidad, un costo de referencia y el proveedor habitual. Por ahora es solo la lista, sin existencias.",
      filas: p.materias,
      campos: [
        { k: "nombre", label: "Nombre", obligatorio: true, ancho: true },
        { k: "categoria", label: "Categoría", ayuda: "Ej.: cocina, aseo, piscina, papelería" },
        { k: "unidad_medida", label: "Unidad de medida", obligatorio: true, sugerencias: UNIDADES },
        { k: "costo_referencia", label: "Costo de referencia ($ por unidad)", tipo: "numero" },
        { k: "proveedor_id", label: "Proveedor habitual", tipo: "select", opciones: () => proveedoresActivos },
        { k: "observaciones", label: "Observaciones", tipo: "area", ancho: true },
      ],
      columnas: [
        { label: "Materia prima", valor: (f: Materia) => <b>{f.nombre}</b> },
        { label: "Categoría", valor: (f: Materia) => f.categoria },
        { label: "Unidad", valor: (f: Materia) => f.unidad_medida },
        { label: "Costo ref.", valor: (f: Materia) => (f.costo_referencia ? formatearCOP(Number(f.costo_referencia)) : "—"), derecha: true },
        { label: "Proveedor habitual", valor: (f: Materia) => f.proveedor },
      ],
      vacio: { nombre: "", categoria: "", unidad_medida: "unidad", costo_referencia: "", proveedor_id: "", observaciones: "" },
      guardar: (id: string | null, v: Valores) => guardarMateriaPrima(id, { ...v, nombre: v.nombre, unidad_medida: v.unidad_medida }),
      estado: cambiarEstadoMateriaPrima,
      buscar: (f: Materia) => [f.categoria, f.proveedor, f.observaciones].join(" "),
    } satisfies Config<Materia>,
    {
      id: "rubros", titulo: "Rubros de gasto", singular: "rubro",
      ayuda: "Plan de gastos en tres niveles: grupo › rubro › subrubro. Es la lista que sale al registrar un gasto y en el presupuesto.",
      filas: p.rubros,
      campos: [
        { k: "nombre", label: "Nombre", obligatorio: true, ancho: true },
        { k: "nivel", label: "Nivel", tipo: "select", opciones: () => NIVELES, obligatorio: true },
        {
          k: "padre_id", label: "Va dentro de", tipo: "select", obligatorio: true, ver: (v) => v.nivel !== "grupo",
          opciones: (v) => p.rubros.filter((r) => r.activo && r.nivel === (v.nivel === "subrubro" ? "rubro" : "grupo")).map((r) => ({ id: r.id, label: r.ruta })),
        },
        { k: "orden", label: "Orden en la lista", tipo: "numero", ayuda: "Opcional; los de número menor salen primero" },
      ],
      columnas: [
        { label: "Rubro", valor: (f: Rubro) => <span className={f.nivel === "grupo" ? "font-bold" : ""}>{f.nombre}</span> },
        { label: "Nivel", valor: (f: Rubro) => f.nivel },
        { label: "Gastos", valor: (f: Rubro) => f.usos || "—", derecha: true },
      ],
      vacio: { nombre: "", nivel: "rubro", padre_id: "", orden: "" },
      guardar: (id: string | null, v: Valores) => guardarRubro(id, { nombre: v.nombre, nivel: v.nivel, padre_id: v.nivel === "grupo" ? null : v.padre_id, orden: v.orden }),
      estado: cambiarEstadoRubro,
      buscar: (f: Rubro) => f.ruta,
      sangria: (f: Rubro) => (f.nivel === "grupo" ? 0 : f.nivel === "rubro" ? 1 : 2),
    } satisfies Config<Rubro>,
    {
      id: "alimentos", titulo: "Alimentos", singular: "alimento",
      ayuda: "Alimentos de los animales. Las existencias, compras y raciones se manejan en Animales.",
      filas: p.alimentos,
      campos: [
        { k: "nombre", label: "Nombre", obligatorio: true, ancho: true },
        { k: "tipo", label: "Tipo", sugerencias: ["concentrado", "forraje", "fruta", "verdura", "suplemento"] },
        { k: "unidad_medida", label: "Unidad de compra", obligatorio: true, sugerencias: ["bulto", "kg", "litro", "unidad", "paca"] },
        { k: "costo_unitario", label: "Costo por unidad de compra ($)", tipo: "numero" },
        { k: "equivalencia_g", label: "Gramos (o ml) por unidad de compra", tipo: "numero", ayuda: "Ej.: un bulto de 40 kg = 40000" },
      ],
      columnas: [
        { label: "Alimento", valor: (f: Alimento) => <b>{f.nombre}</b> },
        { label: "Tipo", valor: (f: Alimento) => f.tipo },
        { label: "Unidad", valor: (f: Alimento) => f.unidad_medida },
        { label: "Costo", valor: (f: Alimento) => (f.costo_unitario ? formatearCOP(Number(f.costo_unitario)) : "—"), derecha: true },
      ],
      vacio: { nombre: "", tipo: "", unidad_medida: "bulto", costo_unitario: "", equivalencia_g: "" },
      guardar: (id: string | null, v: Valores) => guardarAlimento(id, { nombre: v.nombre, tipo: v.tipo, unidad_medida: v.unidad_medida, costo_unitario: v.costo_unitario, equivalencia_g: v.equivalencia_g }),
      estado: cambiarEstadoAlimento,
      buscar: (f: Alimento) => f.tipo,
    } satisfies Config<Alimento>,
    {
      id: "grupos", titulo: "Grupos de equipos", singular: "grupo",
      ayuda: "Cómo se agrupan los equipos del inventario (karts, motobombas, arcade…).",
      filas: p.grupos,
      campos: [
        { k: "nombre", label: "Nombre", obligatorio: true, ancho: true },
        { k: "descripcion", label: "Descripción", tipo: "area", ancho: true },
      ],
      columnas: [
        { label: "Grupo", valor: (f: Grupo) => <b>{f.nombre}</b> },
        { label: "Descripción", valor: (f: Grupo) => f.descripcion },
        { label: "Equipos", valor: (f: Grupo) => f.usos || "—", derecha: true },
      ],
      vacio: { nombre: "", descripcion: "" },
      guardar: (id: string | null, v: Valores) => guardarGrupoEquipo(id, { nombre: v.nombre, descripcion: v.descripcion }),
      estado: cambiarEstadoGrupoEquipo,
    } satisfies Config<Grupo>,
    {
      id: "areas", titulo: "Áreas de trabajo", singular: "área",
      ayuda: "Áreas del parque: se usan en el personal, los equipos y los gastos.",
      filas: p.areas,
      campos: [
        { k: "nombre", label: "Nombre", obligatorio: true, ancho: true },
        { k: "descripcion", label: "Descripción", tipo: "area", ancho: true },
      ],
      columnas: [
        { label: "Área", valor: (f: Area) => <b>{f.nombre}</b> },
        { label: "Descripción", valor: (f: Area) => f.descripcion },
        { label: "Empleados", valor: (f: Area) => f.empleados || "—", derecha: true },
      ],
      vacio: { nombre: "", descripcion: "" },
      guardar: (id: string | null, v: Valores) => guardarArea(id, { nombre: v.nombre, descripcion: v.descripcion }),
      estado: cambiarEstadoArea,
    } satisfies Config<Area>,
  ];

  const valida = (t?: string) => (configs.some((c) => c.id === t) ? t! : "proveedores");
  const [tab, setTab] = useState(valida(p.tabInicial));
  const actual = configs.find((c) => c.id === tab)!;

  function cambiar(id: string) {
    setTab(id);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", id);
    window.history.replaceState(null, "", u);
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="text-3xl font-black text-ranch-marron">Catálogos</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Las listas que usa toda la app, en un solo lugar. Nada se borra: lo que ya no se use se desactiva.</p>

      <nav className="mb-4 flex flex-wrap gap-2">
        {configs.map((c) => (
          <button key={c.id} onClick={() => cambiar(c.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === c.id ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/25 text-ranch-marron hover:bg-ranch-crema/60"}`}>
            {c.titulo} <span className="opacity-60">{c.filas.filter((f) => f.activo).length}</span>
          </button>
        ))}
      </nav>

      {/* key: cada pestaña arranca con su buscador y formulario limpios */}
      <ListaCatalogo key={actual.id} c={actual as unknown as Config<FilaBase>} />
    </main>
  );
}

function ListaCatalogo({ c }: { c: Config<FilaBase> }) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [ficha, setFicha] = useState<{ id: string | null; v: Valores } | null>(null);
  const [subir, setSubir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const visibles = useMemo(() => {
    const q = norm(buscar.trim());
    return c.filas.filter((f) => (verInactivos || f.activo) && (!q || norm(`${f.nombre} ${c.buscar?.(f) ?? ""}`).includes(q)));
  }, [c, buscar, verInactivos]);
  const inactivos = c.filas.filter((f) => !f.activo).length;

  async function correr(fn: () => Promise<Resultado>, ok: string) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: ok } : { ok: false, t: r.error ?? "No se pudo." });
    if (r.ok) router.refresh();
    return r.ok;
  }

  function editar(f: FilaBase) {
    const v: Valores = {};
    for (const k of Object.keys(c.vacio)) v[k] = String((f as unknown as Record<string, unknown>)[k] ?? "");
    setFicha({ id: f.id, v }); setMsg(null);
  }

  return (
    <section>
      <p className="mb-3 text-sm text-ranch-marron/70">{c.ayuda}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${input} max-w-md flex-1`} placeholder={`Buscar ${c.titulo.toLowerCase()}…`} value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {inactivos > 0 && (
          <label className="flex items-center gap-1 text-xs text-ranch-marron/70">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver desactivados ({inactivos})
          </label>
        )}
        <button className={boton} onClick={() => { setFicha(ficha?.id === null ? null : { id: null, v: { ...c.vacio } }); setMsg(null); }}>
          {ficha?.id === null ? "Cerrar" : `+ Nuevo ${c.singular}`}
        </button>
        <button className={botonSec} onClick={() => setSubir(!subir)}>{subir ? "Cerrar carga" : "⬆ Subir Excel"}</button>
        <a className={botonSec} href={`/admin/catalogos/plantilla/${c.id}`} title="Plantilla vacía con listas y ayudas">⬇ Plantilla</a>
        <a className={botonSec} href={`/admin/catalogos/plantilla/${c.id}?datos=1`} title="Lo que hay hoy en la app, para corregirlo en Excel y volver a subirlo">⬇ Excel con los datos actuales</a>
      </div>

      {subir && (
        <section className={`mb-4 ${card} p-4`}>
          <h2 className="mb-1 font-bold text-ranch-marron">Subir {c.titulo.toLowerCase()} desde Excel</h2>
          <p className="mb-3 text-xs text-ranch-marron/60">
            Usa la plantilla. Si el nombre ya existe, la fila actualiza ese registro (las celdas vacías no borran nada); si no, lo crea.
            Primero se revisa y no se guarda nada hasta que confirmes.
          </p>
          <SubirCatalogo tipo={c.id} titulo={c.titulo} />
        </section>
      )}

      {msg && <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {ficha && (
        <Formulario
          c={c} ficha={ficha} setFicha={setFicha} busy={busy}
          onGuardar={async () => {
            if (await correr(() => c.guardar(ficha.id, ficha.v), ficha.id ? "Cambios guardados." : `${cap(c.singular)} creado.`)) setFicha(null);
          }}
        />
      )}

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ranch-marron/15 text-left text-xs uppercase text-ranch-marron/50">
              {c.columnas.map((col) => <th key={col.label} className={`px-3 py-2 ${col.derecha ? "text-right" : ""}`}>{col.label}</th>)}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={c.columnas.length + 1} className="px-3 py-6 text-center text-ranch-marron/50">{buscar ? `Nada coincide con «${buscar}».` : `Todavía no hay ${c.titulo.toLowerCase()}.`}</td></tr>
            )}
            {visibles.map((f) => (
              <tr key={f.id} className={`border-b border-ranch-marron/10 last:border-0 ${f.activo ? "" : "bg-ranch-crema/30 text-ranch-marron/50"} ${ficha?.id === f.id ? "bg-ranch-crema/60" : ""}`}>
                {c.columnas.map((col, i) => (
                  <td key={col.label} className={`px-3 py-2 align-top ${col.derecha ? "text-right tabular-nums" : ""}`}
                    style={i === 0 && c.sangria ? { paddingLeft: `${0.75 + c.sangria(f) * 1.25}rem` } : undefined}>
                    {col.valor(f)}{i === 0 && !f.activo && <span className="ml-1 text-xs">(desactivado)</span>}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                  <button className={botonSec} onClick={() => editar(f)}>Editar</button>{" "}
                  <button className={botonSec} disabled={busy}
                    onClick={() => correr(() => c.estado(f.id, !f.activo), f.activo ? "Desactivado." : "Activado.")}>
                    {f.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Formulario({ c, ficha, setFicha, busy, onGuardar }: {
  c: Config<FilaBase>; ficha: { id: string | null; v: Valores }; setFicha: (f: { id: string | null; v: Valores } | null) => void; busy: boolean; onGuardar: () => void;
}) {
  const { v } = ficha;
  const set = (k: string, val: string) => setFicha({ ...ficha, v: { ...v, [k]: val } });
  return (
    <section className={`mb-4 ${card} p-4`}>
      <h2 className="mb-3 font-bold text-ranch-marron">{ficha.id ? `Editar: ${v.nombre}` : `Nuevo ${c.singular}`}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {c.campos.filter((k) => !k.ver || k.ver(v)).map((k) => {
          const id = `${c.id}-${k.k}`;
          const lista = k.sugerencias ? `${id}-lista` : undefined;
          return (
            <label key={k.k} htmlFor={id} className={`block text-xs text-ranch-marron/70 ${k.ancho ? "sm:col-span-3" : ""}`}>
              {k.label}{k.obligatorio && " *"}{k.ayuda && <span className="text-ranch-marron/40"> · {k.ayuda}</span>}
              {k.tipo === "area" ? (
                <textarea id={id} rows={2} className={`${input} mt-1`} value={v[k.k] ?? ""} onChange={(e) => set(k.k, e.target.value)} />
              ) : k.tipo === "select" ? (
                <select id={id} className={`${input} mt-1`} value={v[k.k] ?? ""} onChange={(e) => set(k.k, e.target.value)}>
                  <option value="">—</option>
                  {k.opciones?.(v).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              ) : (
                <>
                  <input id={id} list={lista} inputMode={k.tipo === "numero" ? "numeric" : undefined} className={`${input} mt-1`} value={v[k.k] ?? ""} onChange={(e) => set(k.k, e.target.value)} />
                  {lista && <datalist id={lista}>{k.sugerencias!.map((s) => <option key={s} value={s} />)}</datalist>}
                </>
              )}
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <button className={boton} disabled={busy} onClick={onGuardar}>{busy ? "Guardando…" : ficha.id ? "Guardar" : "Crear"}</button>
        <button className={botonSec} onClick={() => setFicha(null)}>Cancelar</button>
      </div>
    </section>
  );
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
