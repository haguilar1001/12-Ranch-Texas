"use client";

// Puente con Zebra Browser Print (app local que el cajero instala en el equipo del parque).
// La app corre en la nube (Railway) y la impresora está en la LAN del parque, así que la
// impresión sale desde el NAVEGADOR del cajero usando el SDK de Zebra (window.BrowserPrint).
//
// El SDK es propietario de Zebra: descárgalo del portal de Zebra Browser Print y guárdalo en
// `public/vendor/BrowserPrint.min.js` (ver public/vendor/README-zebra.md). Se carga bajo demanda
// solo al pulsar "Imprimir en Zebra", así no pesa en el resto de la app.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ResultadoImpresion {
  ok: boolean;
  error?: string;
}

declare global {
  interface Window {
    BrowserPrint?: any;
  }
}

const SDK_SRC = "/vendor/BrowserPrint.min.js";

/** Carga el SDK de Zebra bajo demanda. Devuelve false si no está disponible. */
function cargarSdk(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.BrowserPrint) return resolve(true);

    const previo = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (previo) {
      previo.addEventListener("load", () => resolve(!!window.BrowserPrint));
      previo.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => resolve(!!window.BrowserPrint);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function dispositivoPorDefecto(): Promise<any> {
  return new Promise((resolve, reject) => {
    window.BrowserPrint.getDefaultDevice(
      "printer",
      (device: any) => (device ? resolve(device) : reject(new Error("sin_impresora"))),
      () => reject(new Error("error_dispositivo")),
    );
  });
}

function enviar(device: any, zpl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    device.send(zpl, () => resolve(), () => reject(new Error("error_envio")));
  });
}

/**
 * Envía una o varias manillas (ZPL ya construido) a la impresora Zebra predeterminada.
 * Degrada con mensaje claro si Browser Print no está instalado o no hay impresora.
 */
export async function imprimirZpl(zpls: string[]): Promise<ResultadoImpresion> {
  if (zpls.length === 0) return { ok: false, error: "No hay manillas para imprimir." };

  const listo = await cargarSdk();
  if (!listo || !window.BrowserPrint) {
    return { ok: false, error: "No se detectó Zebra Browser Print. Instálalo en este equipo y conecta la impresora ZD411d." };
  }

  try {
    const device = await dispositivoPorDefecto();
    for (const z of zpls) await enviar(device, z);
    return { ok: true };
  } catch (e) {
    const cual = e instanceof Error ? e.message : "";
    if (cual === "sin_impresora") {
      return { ok: false, error: "No hay una impresora Zebra marcada como predeterminada en Browser Print." };
    }
    return { ok: false, error: "No se pudo enviar a la impresora. Verifica que Browser Print esté abierto y la ZD411d encendida." };
  }
}

export interface DispositivoZebra {
  nombre: string;
  uid: string;
  conexion: string;
}

export interface DiagnosticoImpresion {
  /** ¿Está instalado y cargado el SDK de Zebra Browser Print? */
  sdk: boolean;
  dispositivos: DispositivoZebra[];
  predeterminada: string | null;
  error?: string;
}

function listarDispositivos(): Promise<DispositivoZebra[]> {
  return new Promise((resolve) => {
    window.BrowserPrint.getLocalDevices(
      (lista: any) => {
        const impresoras = (lista?.printer ?? lista ?? []) as any[];
        resolve(
          impresoras.map((d) => ({
            nombre: String(d?.name ?? d?.uid ?? "(sin nombre)"),
            uid: String(d?.uid ?? ""),
            conexion: String(d?.connection ?? "?"),
          })),
        );
      },
      () => resolve([]),
      "printer",
    );
  });
}

/**
 * Revisa el estado de la impresión en ESTE equipo: si Browser Print está instalado,
 * qué impresoras ve y cuál es la predeterminada. Es lo primero que hay que mirar
 * cuando "no imprime" — dice si el problema es el SDK, el cable o la configuración.
 */
export async function diagnosticarImpresoras(): Promise<DiagnosticoImpresion> {
  const listo = await cargarSdk();
  if (!listo) {
    return {
      sdk: false,
      dispositivos: [],
      predeterminada: null,
      error: "Zebra Browser Print no está instalado en este equipo, o falta el SDK en public/vendor/BrowserPrint.min.js.",
    };
  }

  const dispositivos = await listarDispositivos();
  let predeterminada: string | null = null;
  try {
    const d = await dispositivoPorDefecto();
    predeterminada = String(d?.name ?? d?.uid ?? "(sin nombre)");
  } catch {
    predeterminada = null;
  }

  return {
    sdk: true,
    dispositivos,
    predeterminada,
    error: dispositivos.length === 0 ? "Browser Print responde, pero no ve ninguna impresora conectada." : undefined,
  };
}
