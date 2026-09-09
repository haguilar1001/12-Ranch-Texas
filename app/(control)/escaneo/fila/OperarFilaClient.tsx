"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { llamar, atendido, noSePresento, anotarPorManilla } from "./actions";

interface TurnoVista {
  id: string;
  numero: number;
  personas: number;
  estado: string;
  manilla: string;
  tomado: string;
}

interface Props {
  atracciones: { id: string; nombre: string }[];
  actual: { id: string; nombre: string };
  resumen: { esperando: number; personasEsperando: number; llamado: number | null; atendidosHoy: number; noSePresentaron: number };
  esperaActual: string;
  turnos: TurnoVista[];
}

const REFRESCO_MS = 15_000;

const COLOR: Record<string, string> = {
  esperando: "bg-ranch-crema text-ranch-marron/70",
  llamado: "bg-ranch-verde/20 text-ranch-verde",
  atendido: "bg-ranch-marron/10 text-ranch-marron/50",
  no_se_presento: "bg-red-100 text-red-700",
  cancelado: "bg-ranch-marron/5 text-ranch-marron/40",
};
const ETIQUETA: Record<string, string> = {
  esperando: "Esperando",
  llamado: "Llamado",
  atendido: "Atendido",
  no_se_presento: "No se presentó",
  cancelado: "Cancelado",
};

export default function OperarFilaClient({ atracciones, actual, resumen, esperaActual, turnos }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [personas, setPersonas] = useState(1);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);

  async function correr(fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito?: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg({ ok: r.ok, t: r.ok ? (r.aviso ?? exito ?? "Listo.") : r.error ?? "Error" });
    if (r.ok) router.refresh();
    return r.ok;
  }

  const llamados = turnos.filter((t) => t.estado === "llamado");
  const esperando = turnos.filter((t) => t.estado === "esperando");
  const cerrados = turnos.filter((t) => ["atendido", "no_se_presento", "cancelado"].includes(t.estado));

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">Fila · {actual.nombre}</h1>
        <p className="text-sm text-ranch-marron/60">La pantalla se actualiza sola cada 15 segundos.</p>
      </header>

      {atracciones.length > 1 && (
        <nav className="mb-4 flex flex-wrap gap-2">
          {atracciones.map((a) => (
            <a
              key={a.id}
              href={`/escaneo/fila?atraccion=${a.id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${a.id === actual.id ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/25 text-ranch-marron"}`}
            >
              {a.nombre}
            </a>
          ))}
        </nav>
      )}

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Esperando" valor={String(resumen.esperando)} sub={`${resumen.personasEsperando} personas`} />
        <Kpi label="Espera actual" valor={esperaActual} />
        <Kpi label="Atendidos hoy" valor={String(resumen.atendidosHoy)} />
        <Kpi label="No se presentaron" valor={String(resumen.noSePresentaron)} />
      </div>

      <button
        onClick={() => correr(() => llamar(actual.id))}
        disabled={busy || esperando.length === 0}
        className="mb-4 w-full rounded-2xl bg-ranch-marron px-4 py-5 text-xl font-black text-ranch-crema disabled:opacity-40"
      >
        {esperando.length === 0 ? "No hay nadie esperando" : `Llamar al siguiente (${esperando[0].numero})`}
      </button>

      {llamados.length > 0 && (
        <section className="mb-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Llamados</h2>
          {llamados.map((t) => (
            <div key={t.id} className="rounded-2xl border-4 border-ranch-verde bg-ranch-verde/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-black text-ranch-marron">{t.numero}</p>
                  <p className="text-xs text-ranch-marron/55">
                    Manilla {t.manilla}{t.personas > 1 ? ` · ${t.personas} personas` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => correr(() => atendido(t.id), "Turno atendido.")}
                    disabled={busy}
                    className="rounded-xl bg-ranch-verde px-5 py-3 font-bold text-white disabled:opacity-50"
                  >Atendido</button>
                  <button
                    onClick={() => correr(() => noSePresento(t.id), "Marcado como no presentado.")}
                    disabled={busy}
                    className="rounded-xl border-2 border-red-300 px-4 py-3 text-sm font-bold text-red-700 disabled:opacity-50"
                  >No llegó</button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="mb-4 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-1 font-bold text-ranch-marron">Anotar a alguien sin celular</h2>
        <p className="mb-3 text-xs text-ranch-marron/55">Escanea el QR de su manilla; queda en la misma fila con su número.</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={async (e) => {
              // El lector USB manda Enter al final.
              if (e.key === "Enter" && codigo.trim()) {
                if (await correr(() => anotarPorManilla(actual.id, codigo, personas))) setCodigo("");
              }
            }}
            placeholder="Escanea o pega el código de la manilla"
            className="flex-1 rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm"
            autoFocus
          />
          <select value={personas} onChange={(e) => setPersonas(parseInt(e.target.value, 10))} className="rounded-lg border border-ranch-marron/30 px-2 py-2 text-sm">
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            onClick={async () => { if (await correr(() => anotarPorManilla(actual.id, codigo, personas))) setCodigo(""); }}
            disabled={busy || !codigo.trim()}
            className="rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50"
          >Anotar</button>
        </div>
      </section>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">
        En espera ({esperando.length})
      </h2>
      <div className="mb-4 overflow-hidden rounded-2xl border-2 border-ranch-marron/15 bg-white">
        {esperando.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-ranch-marron/10 px-4 py-2 last:border-b-0">
            <span className="text-xl font-black text-ranch-marron">{t.numero}</span>
            <span className="text-xs text-ranch-marron/55">
              {t.manilla}{t.personas > 1 ? ` · ${t.personas} pers.` : ""} · {t.tomado}
            </span>
          </div>
        ))}
        {esperando.length === 0 && <p className="px-4 py-6 text-center text-ranch-marron/50">Fila vacía.</p>}
      </div>

      {cerrados.length > 0 && (
        <details className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-ranch-marron/60">Historial de hoy ({cerrados.length})</summary>
          <div className="mt-2 space-y-1">
            {cerrados.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="font-semibold text-ranch-marron/70">{t.numero}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR[t.estado]}`}>{ETIQUETA[t.estado]}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-3 text-center">
      <p className="text-xl font-black text-ranch-marron">{valor}</p>
      <p className="text-[11px] uppercase tracking-wide text-ranch-marron/50">{label}</p>
      {sub && <p className="text-[10px] text-ranch-marron/40">{sub}</p>}
    </div>
  );
}
