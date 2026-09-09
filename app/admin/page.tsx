import { redirect } from "next/navigation";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const enlaces = [
    ["📊 Dashboard de ventas", "/admin/dashboard", true],
    ["📈 Comparativo año vs año", "/admin/reportes/comparativo", true],
    ["📋 Reporte de ventas", "/admin/reportes/ventas", true],
    ["🎁 Relación de atenciones e invitaciones", "/admin/reportes/cortesias", tieneRol(s.rol, "supervisor")],
    ["🧾 Gastos", "/admin/gastos", tieneRol(s.rol, "supervisor")],
    ["💰 Reporte de gastos / P&G", "/admin/reportes/gastos", true],
    ["👤 Usuarios y perfiles", "/admin/usuarios", tieneRol(s.rol, "administrador")],
    ["🖨️ Diagnóstico de impresora", "/admin/impresora", tieneRol(s.rol, "supervisor")],
  ] as const;

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Administración</h1>
      <p className="mb-6 text-sm text-ranch-marron/60">{s.nombre} ({s.rol})</p>
      <nav className="space-y-3">
        {enlaces.filter(([, , ver]) => ver).map(([label, href]) => (
          <a key={href} href={href} className="block rounded-lg bg-ranch-marron px-5 py-3 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">{label}</a>
        ))}
      </nav>
    </main>
  );
}
