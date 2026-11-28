import { tieneRol, puedeOperarGranja, puedeConducir } from "./auth/sesion";
import type { SeccionMenu } from "./menu-activo";

export type { EnlaceMenu, GrupoMenu, SeccionMenu } from "./menu-activo";

// Menú lateral de la app. Una sola definición para escritorio y celular.
//
// Orden pensado por FRECUENCIA DE USO y por QUIÉN lo usa:
//   Inicio → lo operativo del día (taquilla, accesos, equipos, animales, vehículos) →
//   lo que se consulta (reportes) → lo que se registra en oficina (administración) →
//   lo que se toca poco (configuración).
// Cada enlace lleva su permiso; una sección o grupo que queda vacío no se muestra.

type Fila = [icono: string, label: string, href: string, desc: string, ver: boolean];

export function construirMenu(rol: string): SeccionMenu[] {
  const cajero = tieneRol(rol, "cajero");
  const control = tieneRol(rol, "control_acceso");
  const consulta = tieneRol(rol, "consulta");
  const supervisor = tieneRol(rol, "supervisor");
  const admin = tieneRol(rol, "administrador");
  const granja = puedeOperarGranja(rol);
  const chofer = puedeConducir(rol);

  const definicion: { id: string; icono: string; label: string; href?: string; grupos?: { titulo?: string; filas: Fila[] }[] }[] = [
    { id: "inicio", icono: "🏠", label: "Inicio", href: "/" },
    {
      id: "taquilla",
      icono: "🎟️",
      label: "Taquilla y accesos",
      grupos: [
        {
          titulo: "Venta",
          filas: [
            ["🎟️", "Taquilla", "/taquilla", "Vender manillas", cajero],
            ["💵", "Caja y turno", "/caja/turno", "Abrir, movimientos y cierre", cajero],
            ["🧾", "Corregir y reimprimir ventas", "/caja/ventas", "Buscar una venta ya hecha y arreglarla", cajero],
            ["🏷️", "Manillas", "/admin/manillas", "Buscar, reimprimir y anular", supervisor],
            ["🏛️", "Estado de las cajas", "/admin/cajas", "Cómo van las cajas ahora mismo", supervisor],
            ["📅", "Eventos del día", "/eventos", "Qué llega hoy, desde Cotizaciones", consulta],
          ],
        },
        {
          titulo: "Accesos",
          filas: [
            ["🚪", "Escaneo de entrada", "/escaneo", "Control de acceso en puerta", control],
            ["🎢", "Fila de atracciones", "/escaneo/fila", "Llamar turnos y marcar atendidos", control],
            ["🎡", "Accesos y atracciones", "/admin/accesos", "Condiciones, fila y conteo del día", consulta],
          ],
        },
      ],
    },
    {
      id: "equipos",
      icono: "🔧",
      label: "Equipos parque",
      grupos: [
        {
          titulo: "Mantenimiento",
          filas: [
            ["🛠️", "Tablero de mantenimiento", "/admin/equipos/mantenimiento", "Fallas, preventivos, órdenes e indicadores", supervisor],
            ["🗓️", "Planes preventivos", "/admin/equipos/planes", "Qué se hace y cada cuánto", supervisor],
            ["⚠️", "Reportar falla", "/reportar-falla", "Un equipo no funciona bien", true],
          ],
        },
        {
          titulo: "Inventario",
          filas: [
            ["📋", "Inventario", "/admin/equipos?tab=inventario", "Equipos, estado y ubicación", supervisor],
            ["📝", "Novedades", "/admin/equipos?tab=novedades", "Compras, bajas, traslados y ajustes", supervisor],
            ["🗂️", "Grupos", "/admin/equipos?tab=grupos", "Categorías de equipos", supervisor],
          ],
        },
      ],
    },
    {
      id: "animales",
      icono: "🐄",
      label: "Granja",
      grupos: [
        {
          filas: [
            ["📋", "Inventario", "/admin/animales?tab=inventario", "Censo por categoría y estado", granja],
            ["📝", "Novedades", "/admin/animales?tab=novedades", "Nacimientos, compras, muertes, ventas y ajustes", granja],
            ["📍", "Ubicación", "/admin/animales?tab=ubicacion", "Recintos y traslados", granja],
            ["🌾", "Alimentos", "/admin/animales?tab=alimentos", "Existencias y kardex", granja],
            ["🛒", "Compras", "/admin/animales?tab=compras", "Compras de alimento", granja],
            ["🥕", "Dieta", "/admin/animales?tab=dieta", "Raciones por grupo", granja],
            ["📖", "Bitácora", "/admin/animales?tab=bitacora", "Registro de alimentación", granja],
          ],
        },
        {
          titulo: "Producción",
          filas: [
            ["🥚", "Producción y ventas", "/admin/granja/produccion", "Huevos, queso y suero: producción, ventas, donaciones y egresos", granja],
          ],
        },
        {
          titulo: "Sanidad e insumos",
          filas: [
            ["🩺", "Tratamientos", "/admin/granja/tratamientos", "Reporte médico: diagnóstico, medicamentos, fotos y seguimiento", granja],
            ["🧴", "Insumos y medicamentos", "/admin/granja/insumos", "Aseo, desinfección, venenos y medicamentos: existencias y kardex", granja],
            ["🪰", "Fumigación", "/admin/granja/fumigacion", "Dónde, con qué producto, cuánto, quién y fotos", granja],
          ],
        },
        {
          titulo: "Equipos e implementos",
          filas: [
            ["🐴", "Equipos de la granja", "/admin/equipos?tab=inventario&area=GRANJA,CABALLOS,VETERINARIA", "Sillas, frenos, herramientas y maquinaria de la granja, con su mantenimiento", supervisor],
          ],
        },
      ],
    },
    {
      id: "vehiculos",
      icono: "🚚",
      label: "Vehículos",
      grupos: [
        {
          filas: [
            ["📝", "Solicitar vehículo", "/vehiculos/solicitar", "Registrar una solicitud a nombre de quien la pide", supervisor],
            ["✅", "Aprobar solicitudes", "/vehiculos/aprobar", "Asignar vehículo y chofer, o rechazar", supervisor],
            ["📅", "Calendario", "/vehiculos/calendario", "Solicitudes pendientes y aprobadas del mes", supervisor],
            ["🚗", "Mis viajes", "/vehiculos/mis-viajes", "Cerrar un viaje con el kilometraje", chofer],
          ],
        },
      ],
    },
    {
      id: "reportes",
      icono: "📊",
      label: "Reportes",
      grupos: [
        {
          titulo: "Ventas",
          filas: [
            ["📊", "Dashboard de ventas", "/admin/dashboard", "Indicadores del día y del mes", consulta],
            ["📋", "Reporte de ventas", "/admin/reportes/ventas", "Por tipo, medio, día y hora", consulta],
            ["📈", "Comparativo año vs año", "/admin/reportes/comparativo", "Histórico + taquilla, mes a mes", consulta],
            ["🧮", "Venta por producto y mes", "/admin/reportes/venta-productos", "Cada producto mes a mes, contra el año anterior", consulta],
            ["🎁", "Cortesías", "/admin/reportes/cortesias", "Quién entró gratis y quién lo autorizó", supervisor],
            ["🗑️", "Ventas anuladas", "/admin/reportes/anulaciones", "Quién anuló, con qué motivo", supervisor],
          ],
        },
        {
          titulo: "Caja",
          filas: [
            ["📄", "Cierre del día", "/admin/reportes/cierre", "Informe para firmar e imprimir", supervisor],
            ["💰", "Cuadre diario", "/admin/cuadre", "Consolidado de todos los turnos", supervisor],
          ],
        },
        {
          titulo: "Operación",
          filas: [
            ["🐴", "Alimentación de animales", "/admin/reportes/alimentacion", "Costo del mes por categoría", consulta],
            ["📦", "Inventarios para imprimir", "/admin/reportes/inventarios", "Animales, alimentos, dietas y equipos en PDF", consulta || granja],
            ["🚙", "Uso de vehículos", "/admin/reportes/vehiculos", "Quién pide más, quién maneja más", consulta],
          ],
        },
      ],
    },
    {
      // Todo lo de plata del parque: cómo va (análisis), contra qué se mide (presupuesto) y lo que
      // se registra a mano o se sube desde contabilidad.
      id: "financiero",
      icono: "💰",
      label: "Financiero",
      grupos: [
        {
          titulo: "Análisis",
          filas: [
            ["🩺", "Análisis financiero", "/admin/reportes/analisis-financiero", "Indicadores, equilibrio, comparativos y conclusiones", consulta],
            ["📑", "Estado de resultados", "/admin/reportes/estado-resultados", "P&G mes a mes contra el presupuesto", consulta],
            ["🧾", "Gastos y P&G", "/admin/reportes/gastos", "Presupuesto vs. ejecutado de gastos registrados", consulta],
          ],
        },
        {
          titulo: "Presupuesto",
          filas: [
            ["🎯", "Presupuesto de gastos", "/admin/presupuesto", "Cuentas, ejecución y equivalencias con el P&G", consulta],
            ["👥", "Nómina presupuestada", "/admin/nomina-presupuesto", "Empleados, salarios y costo empresa", admin],
          ],
        },
        {
          titulo: "Registros",
          filas: [
            ["💸", "Gastos", "/admin/gastos", "Registrar por rubro, área y quién lo pidió", supervisor],
            ["🏪", "Ventas fuera de taquilla", "/admin/ventas-otras", "Arriendos, chucherías y otros ingresos", supervisor],
            ["📤", "Carga de archivos", "/admin/archivos", "Estados de resultados, venta por mes, histórico y presupuesto", admin],
          ],
        },
      ],
    },
    {
      id: "administracion",
      icono: "💼",
      label: "Administración",
      grupos: [
        {
          filas: [
            ["👷", "Personal", "/admin/personal", "Empleados, áreas y costo de nómina", supervisor],
            ["🙋", "Clientes", "/admin/clientes", "Editar o desactivar un perfil", supervisor],
          ],
        },
      ],
    },
    {
      // Parámetros y catálogos: se definen una vez y se tocan poco.
      id: "configuracion",
      icono: "⚙️",
      label: "Configuración",
      grupos: [
        {
          titulo: "Catálogos",
          filas: [
            ["📚", "Catálogos", "/admin/catalogos", "Proveedores, materias primas, rubros, alimentos, grupos y áreas", supervisor],
          ],
        },
        {
          titulo: "Venta y caja",
          filas: [
            ["🎫", "Tarifas", "/admin/tarifas", "Tipos de visitante y precios", admin],
            ["🏛️", "Taquillas", "/admin/taquillas", "Nombre, ubicación y cuáles están activas", admin],
            ["💳", "Medios de pago", "/admin/medios-pago", "Efectivo, datáfono, Nequi… y en qué orden salen", admin],
            ["🤝", "Beneficiarios de caja", "/admin/beneficiarios", "A quién se le entrega plata en un egreso", supervisor],
          ],
        },
        {
          titulo: "Sistema",
          filas: [
            ["🚙", "Vehículos y solicitantes", "/admin/vehiculos", "Catálogo de vehículos y de quién puede pedirlos", admin],
            ["👤", "Usuarios y perfiles", "/admin/usuarios", "Crear, activar y resetear clave", admin],
            ["🖨️", "Diagnóstico de impresora", "/admin/impresora", "Probar la Zebra", supervisor],
          ],
        },
      ],
    },
  ];

  return definicion
    .map((s) => ({
      id: s.id,
      icono: s.icono,
      label: s.label,
      href: s.href,
      grupos: s.grupos
        ?.map((g) => ({
          titulo: g.titulo,
          enlaces: g.filas.filter(([, , , , ver]) => ver).map(([icono, label, href, desc]) => ({ icono, label, href, desc })),
        }))
        .filter((g) => g.enlaces.length > 0),
    }))
    .filter((s) => s.href || (s.grupos && s.grupos.length > 0));
}
