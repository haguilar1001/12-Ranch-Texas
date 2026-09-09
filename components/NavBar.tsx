import Link from "next/link";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { logout } from "@/lib/auth/actions";
import NavLinks, { type GrupoNav } from "./NavLinks";

export default async function NavBar() {
  const s = await obtenerSesion();
  if (!s) return null;

  const cajero = tieneRol(s.rol, "cajero");
  const control = tieneRol(s.rol, "control_acceso");
  const consulta = tieneRol(s.rol, "consulta");
  const supervisor = tieneRol(s.rol, "supervisor");
  const admin = tieneRol(s.rol, "administrador");

  // El menú se agrupa por ÁREA, no por pantalla: antes eran 14 enlaces sueltos en una fila.
  // Cada enlace lleva su permiso; un grupo que queda vacío no se muestra.
  const definicion: { label: string; href?: string; enlaces?: [string, string, string, boolean][] }[] = [
    { label: "Inicio", href: "/" },
    {
      label: "Operación",
      enlaces: [
        ["Taquilla", "/taquilla", "Vender manillas", cajero],
        ["Caja y turno", "/caja/turno", "Abrir, movimientos y cierre", cajero],
        ["Escaneo", "/escaneo", "Control de acceso en puerta", control],
      ],
    },
    {
      label: "Parque",
      enlaces: [
        ["Accesos y atracciones", "/admin/accesos", "Condiciones y conteo del día", consulta],
        ["Animales", "/admin/animales", "Inventario, ubicación y alimentación", puedeOperarGranja(s.rol)],
        ["Equipos", "/admin/equipos", "Inventario y mantenimientos", supervisor],
        ["Personal", "/admin/personal", "Empleados, áreas y cargos", supervisor],
      ],
    },
    {
      label: "Reportes",
      enlaces: [
        ["Dashboard de ventas", "/admin/dashboard", "Indicadores del día", consulta],
        ["Reporte de ventas", "/admin/reportes/ventas", "Por tipo, medio, día y hora", consulta],
        ["Comparativo año vs año", "/admin/reportes/comparativo", "Contra la venta histórica", consulta],
        ["Atenciones e invitaciones", "/admin/reportes/cortesias", "Lo que no se cobró y quién lo autorizó", supervisor],
        ["Gastos y P&G", "/admin/reportes/gastos", "Presupuesto vs. ejecutado", consulta],
        ["Cuadre diario", "/admin/cuadre", "Consolidado de todos los turnos", supervisor],
      ],
    },
    {
      label: "Administración",
      enlaces: [
        ["Gastos", "/admin/gastos", "Registrar por rubro con soporte", supervisor],
        ["Manillas", "/admin/manillas", "Buscar, reimprimir y anular", supervisor],
        ["Tarifas", "/admin/tarifas", "Tipos de visitante y precios", admin],
        ["Usuarios y perfiles", "/admin/usuarios", "Crear, activar y resetear clave", admin],
        ["Diagnóstico de impresora", "/admin/impresora", "Probar la Zebra", supervisor],
      ],
    },
  ];

  const grupos: GrupoNav[] = definicion
    .map((g) => ({
      label: g.label,
      href: g.href,
      enlaces: g.enlaces?.filter(([, , , ver]) => ver).map(([label, href, desc]) => ({ label, href, desc })),
    }))
    .filter((g) => g.href || (g.enlaces && g.enlaces.length > 0));

  return (
    <header className="sticky top-0 z-20 border-b-2 border-ranch-marron/15 bg-ranch-crema/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Ranch Texas" className="h-9 w-auto" />
        </Link>

        <NavLinks grupos={grupos} usuario={{ nombre: s.nombre, rol: s.rol }} />

        <div className="flex items-center gap-3 md:ml-auto">
          <Link href="/perfil" title="Mi cuenta" className="hidden text-right text-xs leading-tight text-ranch-marron/60 hover:text-ranch-marron sm:block">
            {s.nombre}<br />
            <span className="text-ranch-marron/40">{s.rol}</span>
          </Link>
          <form action={logout}>
            <button className="rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-sm font-semibold text-ranch-marron hover:bg-ranch-marron/10">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
