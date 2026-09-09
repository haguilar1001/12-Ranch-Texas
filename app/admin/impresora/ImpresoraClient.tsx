"use client";

import { useState } from "react";
import { diagnosticarImpresoras, imprimirZpl, type DiagnosticoImpresion } from "@/lib/impresion/browserPrint";

interface Geo { dpi: number; ancho: number; largo: number }

export default function ImpresoraClient({ zplPrueba, geo }: { zplPrueba: string; geo: Geo }) {
  const [diag, setDiag] = useState<DiagnosticoImpresion | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [verZpl, setVerZpl] = useState(false);

  async function revisar() {
    setBusy(true); setMsg(null);
    setDiag(await diagnosticarImpresoras());
    setBusy(false);
  }

  async function imprimirPrueba() {
    setBusy(true); setMsg(null);
    const r = await imprimirZpl([zplPrueba]);
    setBusy(false);
    setMsg({ ok: r.ok, t: r.ok ? "Enviado a la impresora. Revisa que haya salido la manilla de PRUEBA." : r.error ?? "No se pudo imprimir." });
  }

  async function copiarZpl() {
    try {
      await navigator.clipboard.writeText(zplPrueba);
      setMsg({ ok: true, t: "ZPL copiado. Puedes pegarlo en Zebra Setup Utilities para probar sin el navegador." });
    } catch {
      setMsg({ ok: false, t: "No se pudo copiar. Muestra el ZPL y cópialo a mano." });
    }
  }

  const mmAncho = Math.round((geo.ancho / geo.dpi) * 25.4);
  const mmLargo = Math.round((geo.largo / geo.dpi) * 25.4);

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Diagnóstico de impresora</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        Para la Zebra ZD411d con manilla Z-Band Splash. Corre esto <strong>en el equipo del cajero</strong>,
        no en otro: Browser Print es local a cada máquina.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={revisar} disabled={busy} className="rounded-lg bg-ranch-marron px-4 py-2 font-semibold text-ranch-crema disabled:opacity-50">
          1. Revisar impresoras
        </button>
        <button onClick={imprimirPrueba} disabled={busy} className="rounded-lg bg-ranch-dorado px-4 py-2 font-semibold text-white disabled:opacity-50">
          2. Imprimir manilla de prueba
        </button>
        <button onClick={copiarZpl} className="rounded-lg border border-ranch-marron/30 px-4 py-2 text-sm font-semibold text-ranch-marron hover:bg-white">
          Copiar ZPL
        </button>
      </div>

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {diag && (
        <section className="mb-4 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <h2 className="mb-2 font-bold text-ranch-marron">Estado</h2>
          <ul className="space-y-1 text-sm">
            <li>
              <Semaforo ok={diag.sdk} /> Zebra Browser Print{" "}
              <span className="text-ranch-marron/60">{diag.sdk ? "instalado y respondiendo" : "no disponible"}</span>
            </li>
            <li>
              <Semaforo ok={diag.dispositivos.length > 0} /> Impresoras detectadas{" "}
              <span className="text-ranch-marron/60">{diag.dispositivos.length}</span>
            </li>
            <li>
              <Semaforo ok={!!diag.predeterminada} /> Predeterminada{" "}
              <span className="text-ranch-marron/60">{diag.predeterminada ?? "ninguna"}</span>
            </li>
          </ul>

          {diag.dispositivos.length > 0 && (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase text-ranch-marron/50">
                <tr><th className="py-1">Impresora</th><th className="py-1">Conexión</th></tr>
              </thead>
              <tbody>
                {diag.dispositivos.map((d) => (
                  <tr key={d.uid} className="border-t border-ranch-marron/10">
                    <td className="py-1 font-semibold text-ranch-marron">{d.nombre}</td>
                    <td className="py-1 text-ranch-marron/60">{d.conexion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {diag.error && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-semibold">{diag.error}</p>
              {!diag.sdk && (
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs">
                  <li>Instala <strong>Zebra Browser Print</strong> en el equipo del cajero (portal de Zebra).</li>
                  <li>Guarda el SDK en <code>public/vendor/BrowserPrint.min.js</code> del proyecto.</li>
                  <li>Verifica que el servicio esté corriendo y vuelve a revisar.</li>
                </ol>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-ranch-marron">Etiqueta</h2>
          <button onClick={() => setVerZpl(!verZpl)} className="text-xs font-semibold text-ranch-marron/60 hover:text-ranch-marron">
            {verZpl ? "Ocultar ZPL" : "Ver ZPL"}
          </button>
        </div>
        <p className="mt-1 text-sm text-ranch-marron/60">
          {geo.dpi} dpi · {geo.ancho} × {geo.largo} puntos (≈ {mmAncho} × {mmLargo} mm).
          Si sale corrida o cortada, se ajusta <code>ZPL_GEO</code> en <code>lib/impresion/zpl.ts</code>.
        </p>
        <p className="mt-2 rounded-lg bg-ranch-crema/50 px-3 py-2 text-xs text-ranch-marron/70">
          La manilla de prueba lleva una firma <strong>inválida</strong> a propósito: si alguien la escanea
          en la puerta, el lector la rechaza. Sirve para ver la calidad de impresión, no para entrar.
        </p>
        {verZpl && (
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-ranch-marron/5 p-3 text-[11px] leading-relaxed text-ranch-marron/80">{zplPrueba}</pre>
        )}
      </section>
    </main>
  );
}

function Semaforo({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-ranch-verde" : "text-red-600"}>{ok ? "●" : "●"}</span>;
}
