# progreso.md — Parque Ranch Texas

Estado por fase. Se entrega una fase a la vez; no se avanza sin visto bueno del responsable.

| Fase | Contenido | Estado |
|------|-----------|--------|
| F0 | Setup, esquema BD, migraciones, seeds, auth y roles, GitHub + Railway | ✅ Completada (desplegado en Railway) |
| F1 | Taquilla: venta, cálculo, medios de pago, cortesías con motivo | ✅ Completada |
| F2 | Manillas con QR firmado + impresión | ✅ Completada |
| F3 | Escaneo y control de acceso con reglas por punto | ✅ Completada |
| F4 | Consentimientos digitales con firma | ✅ Completada |
| F5 | Caja: apertura, movimientos, cierre y cuadre diario | ✅ Completada |
| F6 | Gastos y rubros con soportes | ✅ Completada |
| F7 | Reportes de ventas mes/año y comparativos | ✅ Completada |
| F8 | Vistas `analitica`, usuario read-only y export para Power BI | ✅ Completada |
| F9 | Modo offline, respaldos, despliegue y manual de usuario | ✅ Completada |
| F10 | Reorganización por módulos + maestros de operación (Atracciones, Personal, Animales, Equipos) | 🟡 Boceto en revisión |
| F11 | Animales: alimentación (dieta individual/grupal + bitácora + kardex) y ubicación con historial | ✅ Completada (faltan datos reales de recintos) |
| F12 | Caja: descuentos, comprador, relación de atenciones, filtros y Excel nativo, diagnóstico de impresora | ✅ Completada |
| F13 | Atracciones editables + fila virtual (el visitante separa turno con su QR) | ✅ Completada |


## Traído de Family Party (2026-09-25)

Family Party (repo 21-Family-Party) parte de este código. Estos arreglos se hicieron allá y se pasaron aquí
con cherry-pick, más dos cambios hechos directamente aquí:

- [x] **Una caja = un turno activo** (y un usuario = un turno activo): abrir o reabrir un turno valida que la
      caja esté libre, dentro de una transacción con candado. Además hay índices únicos parciales (migración
      `20260925170000_un_turno_activo_por_caja`, creados a mano: si `prisma migrate dev` propone borrarlos, no se
      acepta). En producción no había turnos duplicados cuando se desplegó.
- [x] **Comprobante de movimientos de caja**: consecutivo por tipo, valor en letras y firmas. Se abre al agregar
      el movimiento y se reimprime con 🧾. Los 34 egresos y 2 ingresos que ya existían quedaron numerados.
- [x] **Beneficiarios de caja** (`/admin/beneficiarios`): en un egreso, "Entregado a" es obligatorio y se elige
      de la lista. Sale bajo la firma de "Recibió".
- [x] **Medios de pago** (`/admin/medios-pago`), con ícono, y la taquilla arranca siempre en efectivo.
- [x] **Taquillas** (`/admin/taquillas`): crear, renombrar y desactivar cajas.
- [x] **Bug del aforo en 0** en la pantalla de inicio (hecho aquí): se buscaba "Entrada Principal", pero el
      nombre está guardado en mayúsculas.
- [x] **Migraciones al arrancar** (hecho aquí): `npm start` es `prisma migrate deploy && next start`.
- [x] Las 4 migraciones se ensayaron en producción dentro de una transacción deshecha antes de desplegar.
      **273 pruebas**, typecheck limpio y build OK.

## F13 — Fila virtual (completada, verificada)

Responde a: *"atracciones donde la gente hoy se anota en una lista, le dan un turno, y tiene que
estar pendiente"*. Lo que se quita no es la fila: es el **tener que estar pendiente**.

- [x] **Atracciones y puntos de control editables** (`/admin/accesos`, supervisor+): antes solo se
      tocaban por seed o base de datos, y el seed únicamente inserta si la tabla está vacía — por eso
      producción quedó con 3 atracciones de prueba en vez de las 9 reales.
      Al crear una atracción se genera su lector; desactivarla desactiva sus lectores; y no deja
      desactivar el último punto de entrada al parque, que es el que mide el aforo.
- [x] **Fila virtual por atracción** (`fila_activa`, `cupo_por_tanda`, `minutos_por_tanda`):
      migración `20260909150000_fila_virtual`, tabla `turnos_fila` con consecutivo por día y atracción.
- [x] **Pantalla del visitante** (`/fila/[payload]`, PÚBLICA desde el QR de la manilla, sin login):
      separa turno, ve cuántos van adelante y cuánto falta, y la página **se actualiza sola**. Si la
      atracción exige consentimiento y no lo ha firmado, se lo recuerda **mientras espera** — que es
      justo el rato muerto que este módulo aprovecha.
- [x] **Pantalla del operario** (`/escaneo/fila`, control_acceso+): llamar al siguiente, marcar
      atendido o que no se presentó, y **anotar a quien no tiene celular** escaneando su manilla.
- [x] La espera se calcula por **personas, no por turnos**: una familia de 4 ocupa 4 puestos en los
      karts. Sin cupo ni duración configurados **no se muestra estimado** — antes que inventar un
      número, no se dice nada.
- [x] Un turno **llamado sigue ocupando cupo** hasta que se cierra: todavía no se ha subido.
- [x] Una manilla solo puede tener **un turno abierto por atracción**, para que nadie taponee la fila.
- [x] Verificado con `npm run verificar:f13` (**22 comprobaciones**, todas verdes) y **102 tests**
      (14 nuevos), typecheck limpio, build OK.

Pendiente (del responsable):
- **Cuáles atracciones van con fila**, y para cada una cuántas personas entran por tanda y cuántos
  minutos dura. Se configura en `/admin/accesos` → pestaña **Fila virtual**.
- [x] **Menú del visitante** (`/m/[payload]`, público): a esto apunta ahora el QR impreso en la
      manilla. Muestra el turno activo arriba (lo más urgente), si le faltan firmas, y las dos
      entradas: fila y consentimientos. Se resolvió así porque en una banda de 2,84 cm no caben
      dos QR distintos; la tirilla dice "TURNOS Y CONSENTIMIENTOS".

## F12 — Caja lista para operación real (completada, verificada)

- [x] **Descuentos parciales en taquilla**: control por tipo de visitante (cuánto se cobra c/u, motivo y
      quién autoriza). El servidor **recalcula desde la tarifa vigente** y recorta el valor a [0, tarifa]:
      `resolverValorCobrado` en `lib/ventas/calculo.ts`. Sin motivo o sin autorización, la venta se rechaza.
- [x] **Captura del comprador** (nombre y documento) en taquilla — los campos ya existían en el modelo.
- [x] **Relación de atenciones e invitaciones** (`/admin/reportes/cortesias`, supervisor+): detalle de todo
      lo que salió sin cobrarse, con motivo, quién autorizó, cajero y caja; agrupado por tipo, motivo y
      autorizador; export. Incluye los **descuentos**, no solo las cortesías. `lib/reportes/cortesias.ts`.
- [x] **Filtros por caja y cajero** en el reporte de ventas (el lib ya los soportaba) y el CSV los respeta.
- [x] **Excel NATIVO (.xlsx)** del cuadre de turno (`lib/reportes/xlsx.ts`): los números van como números,
      en tres hojas (Resumen, Por medio de pago, Por tipo). El CSV se conserva como alternativa.
- [x] **Diagnóstico de impresora** (`/admin/impresora`): detecta si Zebra Browser Print está instalado,
      lista las impresoras que ve, imprime una manilla de PRUEBA (con firma inválida a propósito, para que
      el lector la rechace) y muestra el ZPL para pegarlo en Zebra Setup Utilities.
- [x] Verificado con `npm run verificar:f12` (**26 comprobaciones**, todas verdes): el descuento se guarda
      con su motivo, el encabezado cuadra con el detalle, se rechaza el descuento sin motivo y sin
      autorización, el servidor no acepta un valor por encima de la tarifa, y el .xlsx generado es un ZIP
      real (empieza con "PK"), no un CSV disfrazado.
- [x] **88 tests verdes** (12 nuevos), typecheck limpio, build OK.

Pendiente / próximo:
- **Probar la Zebra físicamente** con `/admin/impresora` — el código está listo pero nunca se ha
  ejecutado contra la impresora real (no la tengo aquí).
- `xlsx` pasó de devDependency a **dependency** (ahora se usa en runtime).
- Falta llevar el .xlsx nativo al resto de reportes (hoy solo el cuadre de turno).

## F11 — Alimentación y ubicación de animales (completada, verificada)

Responde a: *"la alimentación de los animales, ubicación, si es alimentación individual o grupal"*.

- [x] **Modo de ración `individual` / `grupal`** (`lib/animales/racion.ts`): individual multiplica la
      cantidad por las cabezas del grupo; grupal es el total del lote. Frecuencia pasó a enum
      (diaria/semanal/quincenal/mensual, mes de 30 días).
- [x] **Unidades sin decimales** (`lib/animales/unidades.ts`): todo se guarda entero en unidad base
      (g/ml/unidad). `Alimento.equivalencia_g` (bulto = 40.000 g) permite convertir entre "800 g por
      perro" y "8 bultos al mes", y calcular costo en COP entero.
- [x] **Ubicación con historial**: `recintos` con tipo, zona y capacidad; `traslados_animal` guarda
      cada movimiento (origen, destino, cabezas, motivo, fecha). La capacidad **avisa, no bloquea**.
- [x] **Bitácora de alimentación** (`registros_alimentacion`): quién alimentó, hora real, planeado vs.
      entregado, estado (realizada/parcial/omitida con motivo obligatorio), costo de lo entregado.
- [x] **Kardex del alimento** (`movimientos_alimento`): entrada/salida/ajuste. La existencia se
      **recalcula** desde los movimientos, nunca se escribe a mano. Anular una entrega no borra:
      genera movimiento de compensación (solo administrador).
- [x] **CRUD completo** en `/admin/animales` con 5 pestañas (Inventario, Ubicación, Alimentos, Dieta,
      Bitácora), auditoría y baja lógica. Antes era una lista de solo lectura.
- [x] Migración `20260824120000_f11_alimentacion_ubicacion` escrita a mano para **no perder datos**
      (`frecuencia` texto→enum con CAST, `existencia` renombrada a `existencia_base`). Drift cero.
- [x] Importador real actualizado con equivalencias y modo (`npm run import:animales`).
- [x] Verificado: **76 tests verdes** (17 nuevos), typecheck limpio, build OK (25 rutas), y probado en
      navegador con datos reales: crear recinto → trasladar Perros (avisa exceso de capacidad) →
      registrar entrega de 10,67 kg de Italcán ($29.343) → kardex en negativo avisado.
- [x] **Reparto automático por horario (2026-09-14):** las áreas `PESEBRERAS`/`GRANJA` quedaron
      creadas y todos los animales asignados (60 equinos a Pesebreras, el resto a Granja). La dieta ya
      no se registra a mano: un cron (`npm run alimentar:auto`, `scripts/alimentar-automatico.ts`)
      reparte la ración diaria en franjas — equinos 3 veces (7 a.m./12 m./4 p.m.), el resto 2 veces
      (7 a.m./4 p.m.) — dejando fuera el "consumo libre". Idempotente por (ración, franja, día).
      Migración `20260914155957_f_reparto_automatico_alimentacion`. Disparador:
      **GitHub Actions** (`.github/workflows/alimentar-automatico.yml`), con el secreto de repo
      `DATABASE_URL`. Detalle en `decisiones.md`.
- [x] **Validación contra la fuente**: la suma de las 11 raciones reales da **$5.357.000/mes**,
      idéntico al total de la infografía de consumo.

Ajustes tras la revisión del responsable (2026-08-24):
- [x] **Melaza por 20 kg** (no 40). Costo mensual igual ($312.000), consumo real corregido a 120 kg/mes.
- [x] **Perros a `individual`, 800 g por animal al día.** Su costo pasa de $880.000 a **$660.000/mes** y
      el total del parque a **$5.137.000/mes**; la diferencia de $220.000 contra la infografía es real.
- [x] **Rol `granja`** (migración `20260824160000_rol_granja`): alimenta, traslada y recibe alimento,
      pero **no ve ventas, caja, gastos ni el resumen de facturación del inicio**, ni toca los maestros
      (recintos, alimentos, dieta) ni anula. Probado con un usuario real de ese rol.
- [x] **Súper Ternera a `individual`**: lo comen Terneros (3) y Terneras (7) a 1 kg por cabeza al día →
      dos raciones. Total del parque: **$5.094.500/mes** (12 raciones).

Pendiente (del responsable, ver `decisiones.md`):
- **Lista real de recintos** del parque — quedó de anexarla; hoy los 29 grupos están "sin ubicar".
- Confirmar que **el bulto es de 40 kg** en los demás concentrados.

## F10 — Módulos operativos (BOCETO en revisión, datos inventados)

Objetivo: separar la app por áreas (menú: Ventas, Caja, Accesos, Personal, Animales, Equipos, Gastos,
Administración) y crear los **maestros/parámetros** que luego se afinan con datos reales cargados por Excel.

- [x] **Modelo de datos nuevo** (`prisma/schema.prisma`): Personal (`areas_trabajo`, `cargos`,
      `empleados`), Animales (`categorias_animal`, `recintos`, `animales`, `alimentos`, `raciones`),
      Equipos (`categorias_equipo`, `equipos`, `mantenimientos_equipo`). Con auditoría, baja lógica y
      dinero Int. **Schema válido** (`prisma validate`) y cliente generado.
- [x] **Menú por módulos**: pantalla de inicio (`app/page.tsx`) y `NavBar` reorganizados por áreas.
- [x] **Pantallas boceto (read-only)**: `/admin/accesos` (atracciones + condiciones + flag de
      consentimiento + **conteo de entradas del día por atracción desde el lector**), `/admin/personal`,
      `/admin/animales` (inventario + alimentos + raciones), `/admin/equipos` (inventario + mantenimientos).
- [x] **Datos reales integrados**: 9 atracciones que exigen consentimiento (Mario Karts, Karts Fórmula 1,
      Karts Buggies, Karts Areneros, Karts Playeros, Motocross, Botes, Paseo Caballo, Paseo Pony) y el
      **texto legal OFICIAL** del consentimiento (DIVERSIONES DEL OCCIDENTE S.A.S.) → `seed.ts` +
      `scripts/consentimiento-texto.ts`. Reemplaza el BORRADOR (queda versionado v2).
- [x] **Seed de datos inventados** para los módulos nuevos: `scripts/seed-boceto.ts`
      (`npm run seed:boceto`), idempotente.
- [x] Verificado: **typecheck limpio, 51 tests verdes, build de producción OK (25 rutas + middleware)**.

- [x] **Inventario REAL de animales cargado** (2026-08-10): desde `INVENTARIO ANIMALES RANCH.xlsx`
      (29 grupos, **683 cabezas**) + consumo mensual de alimento de la infografía (9 alimentos,
      $5.357.000/mes). Nuevo campo `Animal.cantidad` (migración `20260810180000_animal_cantidad`)
      para censo por grupo/lote. Importador idempotente `scripts/import-inventario-animales.ts`
      (`npm run import:animales`). Página `/admin/animales` muestra cabezas, cantidad por grupo y
      raciones por grupo/categoría. Reemplaza los animales inventados de `seed:boceto`.

Pendiente para afinar (con el responsable):
- Aplicar en su máquina/Railway: `npm run db:up && npm run prisma:migrate && npm run import:animales`
  (en este entorno no hay Docker/BD, el código quedó listo y validado).
- Confirmar lecturas ambiguas del alimento: unidad/costo unitario de **Acuatilapia** (solo hay
  $305.000/mes) y el desglose de "Aves en general" (6 bultos Maíz Molido + 2 Prepico = $580.000/mes).
- **Formularios de captura/edición** (CRUD) por módulo — hoy son listas de solo lectura.
- **Carga por Excel** de cada maestro (plantillas por definir con las columnas = campos del modelo).
- Atracciones que **NO** exigen consentimiento (piscinas, zonas, etc.) — falta la lista completa (P1).
- Condiciones reales de **edad/estatura** por atracción (P2).
- Revisión legal final del texto de consentimiento antes de producción.

## F9 — Cierre: offline, respaldos, deploy y manual (completada, verificada)

- [x] **Escáner offline (PWA):** cola en `localStorage` (`lib/offline/cola.ts`), endpoint
      `/api/accesos/sync` **idempotente por `id_cliente`**, sincronización automática al volver la red
      + botón manual y contador de pendientes. Manifest + service worker + icono.
- [x] `procesarEscaneo` acepta metadatos offline (id_cliente, hora real del evento, sincronizado)
      y no duplica accesos ya registrados.
- [x] **Middleware** de autenticación (defensa en profundidad) para rutas protegidas.
- [x] **Respaldos** documentados (`docs/respaldos.md`): backups de Railway + pg_dump/restore.
- [x] **Manual de usuario** (`docs/manual.md`).
- [x] Verificado con `scripts/verificar-f9.ts` (sync idempotente, hora real) y **build de producción
      exitoso** (20 rutas + middleware edge). 51 tests, typecheck limpio.

Pendiente operativo (del responsable, no de código):
- En Railway: dejar el Start Command en `npx prisma migrate deploy && npm run start` (quitar el seed).
- Correr `scripts/sql/bi_readonly.sql` con clave real y verificar restauración de backups.
- Íconos PNG de la PWA y logo definitivo (hoy icono SVG placeholder).
- Nota: la validación de firma **offline** se hace en el servidor al sincronizar (no se expone el
  secreto HMAC al dispositivo); el escaneo sin red queda en cola y se resuelve al reconectar.

## 🎉 F0–F9 COMPLETADAS — sistema funcional de punta a punta.

## F8 — Capa analítica para Power BI (completada, verificada)

- [x] Migración `20260802205020_analitica`: esquema `analitica` con **12 vistas en modelo estrella**
      (dim_fecha, dim_tipo_visitante, dim_medio_pago, dim_atraccion, dim_cajero, dim_rubro_gasto;
      hechos_ventas, hechos_ventas_pagos, hechos_accesos, hechos_gastos, hechos_cuadre_caja,
      hechos_ventas_historicas). Fechas convertidas a día local de Bogotá (`fecha_key`).
- [x] Usuario **`bi_readonly`** (`scripts/sql/bi_readonly.sql`): solo lee `analitica`, nunca `public`
      (verificado: lee histórico $20.906M, `public.ventas` → permission denied).
- [x] **Export CSV** por vista (`npm run export:analitica` → `EXPORT_DIR`), plan B para Power BI.
- [x] Guía de conexión `docs/powerbi.md`.
- [x] Verificado por SQL y export (12 CSVs). 51 tests, typecheck limpio.

Pendiente / próximo:
- En Railway: correr `bi_readonly.sql` con clave real (la migración de vistas se aplica sola en el deploy).
- Materialized views + refresh si el volumen crece (hoy vistas simples, suficientes).
- **F9: modo offline del escáner, respaldos, endurecimiento del deploy y manual de usuario.**

## F7 — Reportes de ventas (completada, verificada)

- [x] Utilidad de variación pura y probada `lib/reportes/util.ts` (3 tests).
- [x] **Comparativo año vs. año por mes** (`/admin/reportes/comparativo`) desde la venta histórica:
      totales, variación %, tabla mensual con barras, filtro por producto, export a Excel/CSV.
- [x] Reporte de ventas en vivo (`/admin/reportes/ventas`): entradas, ingreso, ticket promedio,
      % cortesías, valor no cobrado, por tipo, por medio, por día de semana y por hora; export CSV.
- [x] Verificado con `scripts/verificar-f7.ts`: 2023 $5.096.947.030 y 2024 $4.474.715.300 (−12,2%),
      suma de meses = total, filtro por producto. Ambos reportes probados por render con datos reales.
- [x] 51 tests, typecheck limpio.

Pendiente / próximo:
- Filtros adicionales (caja/cajero) en el reporte en vivo — la base está lista.
- Cuadre **diario consolidado** (varios turnos) — pendiente de F5.
- **F8: capa analítica** (`analitica`) con vistas estrella + usuario read-only para Power BI.

## F6 — Gastos (completada, verificada)

- [x] Cálculo de gasto puro y probado `lib/gastos/calculo.ts` (total = base + IVA − retenciones).
- [x] Registro de gastos por **rubro jerárquico** (grupo/rubro/subrubro con ruta en el select),
      proveedor (upsert por nombre), NIT, IVA, retefuente/reteICA/otras, medio de pago, estado.
- [x] Marcar pagado / anular (supervisor, con auditoría).
- [x] Reporte `/admin/reportes/gastos`: **presupuesto vs. ejecutado** por grupo y **P&G simplificado**
      (ingresos por ventas del mes − gastos = resultado). Índice `/admin`.
- [x] Verificado con `scripts/verificar-f6.ts` (total con IVA, roll-up por grupo) y por render
      (rubro jerárquico; P&G $180.000 − $0). 48 tests, typecheck limpio.

Pendiente / próximo:
- **Soporte** hoy es una URL de referencia a la factura; el **upload de archivo** necesita
  almacenamiento de objetos (Railway FS es efímero) — decisión ya anotada en decisiones.md.
- **Gastos recurrentes** (plantilla mensual) y **carga de presupuesto desde Excel** — pendientes.
- **F7: Reportes de ventas** (día/mes/año, comparativo año vs año con la venta histórica).

## F5 — Caja y cuadre (completada, verificada)

- [x] Cálculo de cierre puro y probado `lib/caja/cierre.ts` (3 tests) + resumen `lib/caja/resumen.ts`.
- [x] Movimientos de caja (ingreso/egreso) con concepto, aparte de las ventas.
- [x] **Cierre con conteo por denominación** (billetes/monedas COP): efectivo esperado vs. contado,
      **diferencia** (sobrante/faltante) con observación obligatoria si no cuadra.
- [x] Fórmula: `esperado = base + ventas_efectivo + otros_ingresos − egresos`.
- [x] **Cuadre del turno** imprimible (PDF) y **export a Excel/CSV**: ventas por medio y por tipo,
      cortesías (no cobrado), anuladas, efectivo.
- [x] Cierre bloquea el turno; **reapertura solo administrador** con motivo y auditoría.
- [x] Verificado con `scripts/verificar-f5.ts` (esperado 225.000, cuadra/sobrante/faltante) y por
      render en navegador (esperado $380.000 en vivo). 46 tests, typecheck limpio.

Pendiente / próximo:
- **Cuadre diario consolidado** (todos los turnos del día) — va con los reportes de F7.
- Export a `.xlsx` nativo (hoy CSV, que Excel abre) usando la librería ya instalada, si se requiere.
- **F6: Gastos** por rubro jerárquico con soporte.

## F4 — Consentimientos digitales (completada, verificada)

- [x] Validación pura y probada `lib/consentimiento/validar.ts` (5 tests) + núcleo `registrar.ts`.
- [x] Formulario público `/consentimiento/[payload]` (sin auth): desde el QR de la manilla, datos del
      firmante, **menor → datos y firma del acudiente**, **lienzo de firma con el dedo**, aceptación
      expresa (Ley 1581 de 2012), texto legal **versionado** por atracción.
- [x] Un consentimiento firmado **desbloquea el acceso** a esa atracción (F3 lo reconoce al instante).
- [x] Se guarda: versión del texto, fecha/hora, IP, dispositivo, atracción y manilla; `es_menor`.
- [x] Comprobante imprimible/PDF `/consentimiento/comprobante/[id]`.
- [x] **QR de consentimiento impreso en cada manilla** (el visitante lo escanea con su celular).
- [x] Verificado con `scripts/verificar-f4.ts`: deniega sin firma → firma → **desbloquea acceso**;
      menor con acudiente; idempotente. Formulario probado por render (SSR). 43 tests, typecheck limpio.

Pendiente / próximo:
- Texto legal es **BORRADOR** — debe revisarlo el área legal antes de producción (está versionado en BD).
- Textos específicos por atracción (hoy usan el general); cargar por atracción cuando estén.
- **F5: Caja** (apertura ya existe; falta movimientos, cierre con conteo por denominación y cuadre).

## F3 — Escaneo y control de acceso (completada, verificada)

- [x] Reglas de acceso puras y probadas: `lib/acceso/validar.ts` (`evaluarAcceso`); 8 tests.
- [x] Núcleo `lib/acceso/procesar.ts`: verifica firma, aplica reglas del punto, registra el acceso
      (permitido/denegado + motivo) y calcula aforo del día. Testeable sin HTTP.
- [x] Reglas por punto: un_ingreso / reingreso / entrada_salida; requiere consentimiento; aforo máx.
- [x] Pantalla `/escaneo` móvil: selección de punto, lector manual/USB (Enter) y **cámara**
      (BarcodeDetector, mejora progresiva), **semáforo verde/rojo** con motivo, sentido y aforo en vivo.
- [x] Todo escaneo se guarda en `accesos` (hora, punto, usuario, resultado, sentido).
- [x] Verificado con `scripts/verificar-f3.ts`: entrada/salida alterna, aforo neto correcto,
      QR falsificado / falta consentimiento / manilla anulada → DENEGADO. Typecheck limpio, 38 tests.

Pendiente / próximo:
- Modo **offline** del escáner (validar por firma + cola IndexedDB + sync) → va en F9.
- Reglas de edad/estatura por punto: la estructura existe, pero su aplicación estricta depende de los
  datos del **consentimiento (F4)** (la manilla no lleva la edad exacta).
- Interacción de la UI probada por render + verificación determinista; el clic automatizado en dev
  es poco fiable por hidratación (no es un bug — sin errores de consola).
- **F4: consentimientos** desbloquearán los puntos que hoy exigen consentimiento (karts, motocross).

## F2 — Manillas con QR e impresión (completada, verificada)

- [x] Núcleo de venta refactorizado a `lib/ventas/registrar.ts` (`crearVenta`) — testeable sin HTTP.
- [x] Al vender se genera **una manilla por asistente** (incluidos bebés y cortesías): UUID +
      firma HMAC + consecutivo legible (`#venta-n`) + vencimiento (fin del día operativo).
- [x] Cola de impresión persistente (`impresiones`, estado pendiente/impreso) con payload de tirilla.
- [x] Módulo de impresión abstraído `lib/impresion` (driver ESC/POS 80mm placeholder) + test.
- [x] Pantalla de impresión 80mm con **QR grande**, tipo en letra grande, consecutivo, vigencia,
      caja/cajero y leyenda; botón Imprimir (window.print) + marcar impreso.
- [x] Reimpresión y anulación **solo supervisor**, con motivo y **auditoría** (`log_auditoria`);
      anular marca venta + todas sus manillas como anuladas.
- [x] Verificado con `scripts/verificar-f2.ts`: 4 manillas / 4 asistentes, firmas QR válidas,
      bebé marcado, cola poblada, totales consistentes. Pantalla de impresión probada en navegador
      (QR PNG 312×312 renderizados). Typecheck limpio, 30 tests verdes.

Pendiente / próximo:
- Impresión física real (driver ESC/POS sobre hardware) cuando se defina la impresora (P: modelo).
- `numero_venta`/consecutivo bajo concurrencia: reintento ante choque de único.
- **F3: escaneo y control de acceso** validará estas manillas por firma + estado.

## F1 — Taquilla (funcional, probada end-to-end)

- [x] Lógica de venta pura y probada: `lib/ventas/calculo.ts` (totales + validación); 12 tests.
- [x] Login/logout (JWT en cookie httpOnly) + control de rol.
- [x] Apertura de turno de caja (mínima; el cierre/cuadre va en F5).
- [x] Taquilla: cantidades por tipo, cortesías (atención/invitación) con motivo + autorización,
      pago mixto, "efectivo exacto", totales en vivo, precios recalculados en el servidor.
- [x] Server action transaccional `registrarVenta` (encabezado + detalle + pagos), consecutivo por turno.
- [x] Probado E2E con navegador: login → turno → venta #1 (2 adultos + 1 niño, $180.000) →
      consistencia en BD (encabezado = detalle = pagos). Typecheck y 27 tests verdes.

Pendiente dentro de F1 / próximos:
- Descuentos parciales en la UI (la lógica y tests ya existen; falta el control en pantalla).
- Captura opcional de comprador (nombre/documento) — campos ya en el modelo.
- Anulación/reimpresión de venta (van con manillas en F2, requieren supervisor + auditoría).
- `numero_venta` bajo concurrencia (aggregate+create): agregar reintento ante choque de único.
- **F2 generará las manillas con QR e impresión** a partir del detalle de la venta.

## F0 — Setup (completada)

Checklist:
- [x] Documentos del proyecto: `CLAUDE.md`, `progreso.md`, `decisiones.md`
- [x] Configuración base: `package.json`, `tsconfig`, Next, Tailwind (paleta de marca), PostCSS
- [x] Docker Compose (Postgres dev) + `.env.example`
- [x] `prisma/schema.prisma` completo (modelos, enums, índices, auditoría) — **validado** ✓
- [x] Utilidades base: `lib/dinero`, `lib/db`, `lib/qr/firma` (+ `generar`), `lib/auth`
- [x] Scripts: `festivos-co.ts`, `gen-dim-fecha.ts`, `seed.ts` (maestros + dim_fecha)
- [x] Pruebas base con Vitest — **15/15 verdes** (dinero, festivos Emiliani/Semana Santa, firma QR)
- [x] `npm install` OK, Prisma Client generado
- [x] Migración inicial aplicada — `20260802163057_init` en Postgres local ✓
- [x] Seed ejecutado — 1 admin, 6 cajas, 4 tipos+tarifas, 7 medios, 3 atracciones, 4 puntos,
      36 rubros, dim_fecha 4.748 días (festivos verificados: San José 2025 → 24-mar por Emiliani) ✓
- [ ] Repo GitHub + proyecto Railway con deploy automático — **pendiente (cuentas ya creadas)**

Notas de la fase:
- App Next.js arranca con landing por fases y la paleta de marca (provisional, ver P4).
- Dinero siempre entero COP; firma QR HMAC lista y probada offline.
- dim_fecha se genera 2023–2035 con festivos oficiales (traslado Emiliani) — banderas informativas,
  no restringen operación (el parque abre entre semana por eventos).
- Deprecación menor: `package.json#prisma` (seed) → migrar a `prisma.config.ts` en Prisma 7 (no urgente).
- **Extra:** cargada la venta histórica del Excel a `ventas_historicas` (5.302 filas, 2020–2026,
  $20.906.273.922). Tabla + migración `ventas_historicas` + `scripts/import-historico.ts`. Insumo
  para comparativos año vs año (F7/F8). Ver decisiones.md.
