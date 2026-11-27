"use client";

import { useEffect, useState } from "react";
import { type DatosResumenFalla, PRIORIDAD_FALLA, filasResumen, numeroReporte, textoWhatsApp } from "@/lib/equipos/resumen-falla";

const MARRON = "#3B2416";
const CREMA = "#F4EAD7";
const DORADO = "#C79A3C";
const W = 720;
const PAD = 36;
const FUENTE = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

function cargarImagen(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
}

function partir(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split(/\n/)) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = palabra; }
      else actual = prueba;
    }
    lineas.push(actual);
  }
  return lineas;
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Dibuja la tarjeta del reporte y la devuelve como PNG. */
async function dibujar(d: DatosResumenFalla, foto?: File | string | null): Promise<Blob> {
  const urlFoto = foto instanceof File ? URL.createObjectURL(foto) : foto ?? null;
  const [logo, img] = await Promise.all([cargarImagen("/logo.png"), urlFoto ? cargarImagen(urlFoto) : Promise.resolve(null)]);
  if (foto instanceof File && urlFoto) URL.revokeObjectURL(urlFoto);
  const medir = document.createElement("canvas").getContext("2d")!;
  const anchoValor = W - PAD * 2 - 200;
  const filas = filasResumen(d).map((f) => {
    medir.font = `600 22px ${FUENTE}`;
    return { ...f, lineas: partir(medir, f.valor, anchoValor) };
  });
  medir.font = `22px ${FUENTE}`;
  const desc = partir(medir, d.descripcion, W - PAD * 2 - 32).slice(0, 10);

  const altoEnc = 150;
  const altoFilas = filas.reduce((a, f) => a + f.lineas.length * 30 + 14, 0);
  const altoDesc = 52 + desc.length * 30 + 20;
  const altoFoto = img ? 300 : 0;
  const H = altoEnc + 24 + altoFilas + 16 + altoDesc + altoFoto + 70;

  const c = document.createElement("canvas");
  const esc = 2; // nitidez en pantallas de celular
  c.width = W * esc; c.height = H * esc;
  const ctx = c.getContext("2d")!;
  ctx.scale(esc, esc);
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);

  // Encabezado
  ctx.fillStyle = MARRON; ctx.fillRect(0, 0, W, altoEnc);
  ctx.fillStyle = DORADO; ctx.fillRect(0, altoEnc - 6, W, 6);
  let xTxt = PAD;
  if (logo) {
    const h = 96, w = (logo.width / logo.height) * h;
    ctx.fillStyle = CREMA; rect(ctx, PAD - 6, (altoEnc - h) / 2 - 9, w + 12, h + 12, 14); ctx.fill();
    ctx.drawImage(logo, PAD, (altoEnc - h) / 2 - 3, w, h);
    xTxt = PAD + w + 28;
  }
  ctx.fillStyle = CREMA;
  ctx.font = `800 34px ${FUENTE}`; ctx.fillText("REPORTE DE FALLA", xTxt, 54);
  ctx.font = `500 20px ${FUENTE}`; ctx.globalAlpha = 0.8;
  ctx.fillText(`N.° ${numeroReporte(d.id)} · Mantenimiento de equipos`, xTxt, 86);
  ctx.globalAlpha = 1;

  // Prioridad (insignia debajo del título)
  const p = PRIORIDAD_FALLA[d.prioridad] ?? { label: d.prioridad, color: DORADO };
  ctx.font = `800 16px ${FUENTE}`;
  const tp = `PRIORIDAD ${p.label.toUpperCase()}${d.detenido ? " · EQUIPO DETENIDO" : ""}`;
  const wp = ctx.measureText(tp).width + 24;
  ctx.fillStyle = p.color; rect(ctx, xTxt, 108, wp, 28, 14); ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.fillText(tp, xTxt + 12, 128);

  // Filas
  let y = altoEnc + 24;
  for (const f of filas) {
    ctx.fillStyle = MARRON; ctx.globalAlpha = 0.55; ctx.font = `500 19px ${FUENTE}`;
    ctx.fillText(f.etiqueta, PAD, y + 22);
    ctx.globalAlpha = 1;
    const resaltar = f.etiqueta === "Estado del equipo" && d.detenido;
    ctx.fillStyle = resaltar ? "#D93025" : f.etiqueta === "Prioridad" ? p.color : MARRON;
    ctx.font = `${f.etiqueta === "Equipo" || resaltar ? 800 : 600} 22px ${FUENTE}`;
    f.lineas.forEach((l, i) => ctx.fillText(l, PAD + 200, y + 22 + i * 30));
    y += f.lineas.length * 30 + 14;
    ctx.fillStyle = "#EADFCB"; ctx.fillRect(PAD, y - 7, W - PAD * 2, 1);
  }

  // Descripción
  y += 16;
  ctx.fillStyle = "#FBF6EC"; rect(ctx, PAD, y, W - PAD * 2, altoDesc - 20, 16); ctx.fill();
  ctx.fillStyle = DORADO; ctx.fillRect(PAD, y + 12, 5, altoDesc - 44);
  ctx.fillStyle = MARRON; ctx.font = `800 18px ${FUENTE}`; ctx.fillText("¿QUÉ LE PASA?", PAD + 16, y + 34);
  ctx.font = `22px ${FUENTE}`;
  desc.forEach((l, i) => ctx.fillText(l, PAD + 16, y + 68 + i * 30));
  y += altoDesc;

  // Foto (la primera, si hay)
  if (img) {
    const maxH = 270, maxW = W - PAD * 2;
    const r = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * r, h = img.height * r;
    ctx.save(); rect(ctx, (W - w) / 2, y, w, h, 14); ctx.clip();
    ctx.drawImage(img, (W - w) / 2, y, w, h); ctx.restore();
    y += altoFoto;
  }

  // Pie
  ctx.fillStyle = CREMA; ctx.fillRect(0, H - 50, W, 50);
  ctx.fillStyle = MARRON; ctx.globalAlpha = 0.7; ctx.font = `500 16px ${FUENTE}`;
  ctx.fillText("Parque Ranch Texas · Reporte generado desde la app", PAD, H - 19);
  ctx.globalAlpha = 1;

  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo generar la imagen."))), "image/png"));
}

/** Tarjeta con la imagen del reporte y botones para mandarla por WhatsApp. */
/** `foto`: el archivo recién tomado o la dirección de una foto ya guardada. */
export default function ResumenFallaWhatsApp({ datos, foto, onCerrar }: { datos: DatosResumenFalla; foto?: File | string | null; onCerrar?: () => void }) {
  const [png, setPng] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const nombre = `falla-${numeroReporte(datos.id)}.png`;

  useEffect(() => {
    let u: string | null = null;
    dibujar(datos, foto).then((b) => { setPng(b); u = URL.createObjectURL(b); setUrl(u); }).catch((e) => setAviso(String(e.message ?? e)));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [datos, foto]);

  function descargar() {
    if (!url) return;
    const a = document.createElement("a"); a.href = url; a.download = nombre; a.click();
  }

  async function compartir() {
    if (!png) return;
    const archivo = new File([png], nombre, { type: "image/png" });
    const texto = textoWhatsApp(datos);
    if (navigator.canShare?.({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], text: texto }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    // Computador o navegador sin "compartir archivos": se descarga la imagen y se abre WhatsApp con el texto.
    descargar();
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    setAviso("La imagen se descargó: adjúntala en el chat de WhatsApp que se abrió.");
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-green-600/30 bg-green-50/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-green-900">Resumen listo para WhatsApp</p>
        {onCerrar && <button type="button" onClick={onCerrar} className="text-sm text-ranch-marron underline">Cerrar</button>}
      </div>
      {url ? <img src={url} alt={`Resumen del reporte de falla de ${datos.equipo}`} className="mx-auto w-full max-w-sm rounded-xl border border-ranch-marron/15 shadow" /> : !aviso && <p className="text-sm text-ranch-marron/60">Generando imagen…</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={compartir} disabled={!png} className="rounded-xl bg-[#25D366] py-3 font-bold text-white disabled:opacity-50">Enviar por WhatsApp</button>
        <button type="button" onClick={descargar} disabled={!url} className="rounded-xl border-2 border-ranch-marron/20 py-3 font-bold text-ranch-marron disabled:opacity-50">Descargar imagen</button>
      </div>
      {aviso && <p className="text-xs text-ranch-marron/70">{aviso}</p>}
    </div>
  );
}
