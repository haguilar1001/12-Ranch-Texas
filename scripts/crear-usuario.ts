import "dotenv/config";
import { prisma } from "../lib/db";
import { Rol } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

// Crea (o actualiza la contraseña de) un usuario. Idempotente por `usuario`.
// Uso: tsx scripts/crear-usuario.ts <usuario> <password> [rol] [nombre]
//   rol: administrador | supervisor | cajero | control_acceso | granja | consulta  (por defecto administrador)

const ROLES = ["administrador", "supervisor", "cajero", "control_acceso", "granja", "consulta"];

async function main() {
  const usuario = process.argv[2];
  const password = process.argv[3];
  const rol = (process.argv[4] || "administrador") as Rol;
  const nombre = process.argv[5] || usuario;

  if (!usuario || !password) {
    console.error("Uso: tsx scripts/crear-usuario.ts <usuario> <password> [rol] [nombre]");
    process.exit(1);
  }
  if (!ROLES.includes(rol)) {
    console.error(`Rol inválido: ${rol}. Válidos: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const u = await prisma.usuario.upsert({
    where: { usuario },
    update: { hash_password: hash, rol, nombre, activo: true, actualizado_por: "admin" },
    create: { usuario, hash_password: hash, rol, nombre, creado_por: "admin" },
  });
  console.log(`✓ Usuario "${u.usuario}" (${u.rol}) listo. Nombre: ${u.nombre}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
