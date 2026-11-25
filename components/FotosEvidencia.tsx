"use client";

import { useRef, useState } from "react";

// Selector de fotos de evidencia: abre la cámara en el celular, comprime cada foto a JPEG de
// máximo 1280 px (≈150–300 KB) antes de subirla y muestra las miniaturas. Entrega los archivos
// comprimidos con `onCambio`; quien lo usa los agrega al FormData como "fotos".

const LADO = 1280;

async function comprimir(f: File): Promise<File> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const k = Math.min(1, LADO / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.72));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } finally { URL.revokeObjectURL(url); }
}

export default function FotosEvidencia({ max = 3, onCambio, etiqueta = "Fotos (opcional)" }: { max?: number; onCambio: (f: File[]) => void; etiqueta?: string }) {
  const [fotos, setFotos] = useState<{ archivo: File; url: string }[]>([]);
  const [procesando, setProcesando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function agregar(lista: FileList | null) {
    if (!lista?.length) return;
    setProcesando(true);
    const nuevas = [];
    for (const f of Array.from(lista).slice(0, max - fotos.length)) {
      if (!f.type.startsWith("image/")) continue;
      const c = await comprimir(f);
      nuevas.push({ archivo: c, url: URL.createObjectURL(c) });
    }
    const todas = [...fotos, ...nuevas].slice(0, max);
    setFotos(todas); onCambio(todas.map((x) => x.archivo)); setProcesando(false);
    if (input.current) input.current.value = "";
  }
  function quitar(i: number) {
    const todas = fotos.filter((_, j) => j !== i);
    setFotos(todas); onCambio(todas.map((x) => x.archivo));
  }

  return (
    <div className="text-sm">
      <span className="block text-ranch-marron/70">{etiqueta}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {fotos.map((f, i) => (
          <div key={f.url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-ranch-marron/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => quitar(i)} aria-label="Quitar foto" className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-xs text-white">✕</button>
          </div>
        ))}
        {fotos.length < max && (
          <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-ranch-marron/30 text-center text-xs text-ranch-marron/60 hover:bg-ranch-crema/50">
            {procesando ? "…" : <>📷<br />Agregar</>}
            <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => agregar(e.target.files)} />
          </label>
        )}
      </div>
    </div>
  );
}
