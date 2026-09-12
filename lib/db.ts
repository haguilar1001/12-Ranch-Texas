import { PrismaClient } from "@prisma/client";
import { aMayusculas } from "./db/mayusculas";

/**
 * Cliente Prisma con una sola regla transversal: el texto que escribe una persona
 * se guarda en MAYÚSCULAS (ver lib/db/mayusculas.ts para el qué y el por qué).
 *
 * Va aquí y no en cada formulario para que aplique igual a la app, a los server
 * actions y a los scripts de importación.
 */
function crearCliente() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  }).$extends({
    name: "mayusculas",
    query: {
      $allModels: {
        create({ model, args, query }) {
          return query({ ...args, data: aMayusculas(model, args.data) } as typeof args);
        },
        update({ model, args, query }) {
          return query({ ...args, data: aMayusculas(model, args.data) } as typeof args);
        },
        updateMany({ model, args, query }) {
          return query({ ...args, data: aMayusculas(model, args.data) } as typeof args);
        },
        upsert({ model, args, query }) {
          return query({
            ...args,
            create: aMayusculas(model, args.create),
            update: aMayusculas(model, args.update),
          } as typeof args);
        },
        createMany({ model, args, query }) {
          const data = Array.isArray(args.data)
            ? args.data.map((d) => aMayusculas(model, d))
            : aMayusculas(model, args.data);
          return query({ ...args, data } as typeof args);
        },
      },
    },
  });
}

// Singleton para evitar múltiples conexiones en dev (hot reload).
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof crearCliente> };

export const prisma = globalForPrisma.prisma ?? crearCliente();

/** El cliente que recibe un callback de $transaction (ya extendido). */
export type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
