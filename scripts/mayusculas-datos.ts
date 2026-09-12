// Sube a MAYÚSCULAS lo que YA estaba guardado antes de la regla.
//
// Recorre exactamente los mismos campos que la extensión de Prisma aplica de aquí en
// adelante (lib/db/mayusculas.ts), así que lo viejo y lo nuevo quedan iguales. Nada
// más se toca: ni códigos, ni correos, ni firmas de QR, ni ids.
//
// Por defecto SOLO INFORMA:
//   npm run mayusculas:datos               → muestra cuántas filas cambiarían
//   npm run mayusculas:datos -- --confirmar → las actualiza
import "dotenv/config";
import { prisma } from "../lib/db";
import { CAMPOS_MAYUSCULAS, mayus } from "../lib/db/mayusculas";

const CONFIRMAR = process.argv.includes("--confirmar");

/** "TipoVisitante" → "tipoVisitante", que es como se llama el delegado en el cliente. */
const delegado = (modelo: string) => modelo.charAt(0).toLowerCase() + modelo.slice(1);

type Delegado = {
  findMany: (args: object) => Promise<Record<string, unknown>[]>;
  update: (args: object) => Promise<unknown>;
};

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const destino = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n🔠 Datos existentes a mayúsculas · base ${destino}\n`);

  let filasTotales = 0;
  const cliente = prisma as unknown as Record<string, Delegado>;

  for (const [modelo, campos] of Object.entries(CAMPOS_MAYUSCULAS)) {
    const tabla = cliente[delegado(modelo)];
    if (!tabla?.findMany) {
      console.log(`  ! ${modelo}: no existe en el cliente (se omite)`);
      continue;
    }

    const filas = await tabla.findMany({ select: { id: true, ...Object.fromEntries(campos.map((c) => [c, true])) } });

    let cambiadas = 0;
    const ejemplos: string[] = [];
    for (const fila of filas) {
      const data: Record<string, string> = {};
      for (const campo of campos) {
        const v = fila[campo];
        if (typeof v !== "string") continue;
        const nuevo = mayus(v);
        if (nuevo !== v) data[campo] = nuevo;
      }
      if (Object.keys(data).length === 0) continue;

      cambiadas++;
      if (ejemplos.length < 2) ejemplos.push(Object.entries(data).map(([c, v]) => `${c}: "${fila[c]}" → "${v}"`).join(", "));
      // La extensión ya sube el texto, pero se pasa explícito para no depender de ella.
      if (CONFIRMAR) await tabla.update({ where: { id: fila.id }, data });
    }

    filasTotales += cambiadas;
    if (cambiadas > 0) {
      console.log(`  ${CONFIRMAR ? "→" : "?"} ${modelo.padEnd(22)} ${String(cambiadas).padStart(5)} de ${filas.length}`);
      for (const e of ejemplos) console.log(`      ${e}`);
    }
  }

  console.log(
    CONFIRMAR
      ? `\n✅ ${filasTotales} fila(s) actualizadas.\n`
      : `\n⚠ Simulación: ${filasTotales} fila(s) cambiarían. Corre con -- --confirmar para aplicarlo.\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
