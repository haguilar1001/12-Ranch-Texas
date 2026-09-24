# decisiones.md — Parque Ranch Texas

Registro de decisiones tomadas y pendientes. Fecha de referencia inicial: 2026-08-02.

## Decisiones tomadas

### Despliegue e infraestructura
- **Nube en Railway.** Repo en GitHub, app Next.js + PostgreSQL administrado en Railway, deploy
  automático desde GitHub, `prisma migrate` en el pipeline. Docker Postgres solo para desarrollo.
  Cuentas de GitHub/Railway ya creadas por el responsable.
- Escaneo y consentimientos como **PWA con cola offline (IndexedDB)** para tolerar microcortes de
  internet (Starlink en instalación). Taquilla/impresión dependen de conexión con colas resilientes.
- **Trade-off aceptado:** con Railway, si se cae internet la taquilla se ve afectada; se mitiga con
  colas y con la PWA para lo más sensible (escaneo/consentimiento).

### Stack
- Next.js App Router + TypeScript + Tailwind; Prisma ORM; auth propia (JWT en cookie httpOnly),
  sesión corta en caja; pruebas con Vitest.

### Reglas de negocio
- **Tarifa todo incluido** (parque + todas las atracciones, sin cobro extra).
- **$60.000 solo adulto y niño.** **Bebé (≤2 años) = $0** y **adulto mayor (+70) = $0**; ambos
  generan manilla igual.
- Tipos `atencion` e `invitacion` no pagan pero exigen **motivo + autorización**.
- Tarifas con **vigencia por fechas**; nunca se sobrescriben (nueva fila con `vigente_desde`).
- **Acceso:** parque de **una sola entrada** con **reingreso el mismo día** (regla `entrada_salida`).
- **Aforo del parque: 3.000** personas. Sin aforo por atracción.
- Consentimiento **por atracción**.
- **Texto legal del consentimiento** ✅ *(2026-08-05):* el responsable entregó el texto OFICIAL
  (DIVERSIONES DEL OCCIDENTE S.A.S. — consentimiento informado, exoneración de responsabilidad,
  habeas data Ley 1581/2012, autorización de imagen y CCTV, contacto inforanchtexas@gmail.com).
  Reemplaza el BORRADOR; queda versionado (v2) en `scripts/consentimiento-texto.ts` + `seed.ts`.
  Nota: los "numerales" que referencia el texto asumen numeración de lista; validar con el abogado
  la numeración/formato final antes de producción.
- **Un turno por día** por caja.
- **~60 ventas/hora** en día pico (dimensionamiento).
- **Sin factura electrónica DIAN** y **sin IVA/impoconsumo** por ahora. Interface de facturación
  queda lista pero inactiva.
- Festivos oficiales de Colombia (con traslado Emiliani) + **temporada alta editable**.
- **Operación NO restringida por calendario:** el parque también abre **entre semana cuando hay
  eventos**. El día operativo se define porque se abre un turno de caja, cualquier día. `dim_fecha`
  solo lleva banderas informativas; no bloquea la operación. (Futuro: bandera/tabla `eventos` para
  analizar días de evento en Power BI.)

### Caja, cuadre e impresión de manilla
- **Cuadre diario consolidado por FECHA DE LA VENTA** ✅ *(2026-08-10):* el consolidado del día agrupa
  las ventas por su `creado_en` (día calendario, hora Bogotá), **no** por la fecha de apertura del turno.
  Así una venta aparece siempre en el día en que ocurrió, aunque el turno lleve días abierto (evita que
  se "pierda" del día si alguien no cerró caja). Ventana del día: 00:00:00 a 23:59:59.999 America/Bogota.
- **Arqueo del cajón por turno, no en el consolidado** ✅ *(2026-08-10):* base inicial, efectivo contado
  y diferencia son concepto de **cierre por turno** (el cajón se cuenta al cerrar) y viven en el cuadre por
  turno. El consolidado del día muestra solo **ventas + efectivo recaudado** (ventas efectivo + otros
  ingresos − egresos). Mezclar ambos daría números engañosos (p. ej. sumar la base de un turno multi-día
  en varios días). Ruta: `/admin/cuadre` (supervisor+) con CSV; lógica en `lib/caja/cuadreDiario.ts`.
- **Tipos de visitante y tarifas editables desde admin** ✅ *(2026-08-10):* `/admin/tarifas` (solo admin)
  crea/edita tipos y cambia tarifas con vigencia (nunca sobrescribe). Antes solo por `seed`.
- **Buscador de manillas** ✅ *(2026-08-10):* `/admin/manillas` (supervisor+) por consecutivo o n.° de
  venta; reimprimir/anular siguen a nivel venta (auditadas).
- **Impresión de manilla — hardware y driver** ✅ *(2026-08-10):* el QR único va impreso **en la manilla
  misma** (lo que se escanea en puerta). Compra definida: **Zebra ZD411d** (térmica directa, ZPL) +
  manilla **Z-Band Splash 1"** (el parque tiene piscinas/chorros → media acuática; soporta inmersión).
  El **tipo** de visitante va impreso **en texto** (no por color de manilla: un solo rollo blanco, sin
  cambios de rollo que frenen la caja). Driver ZPL en `lib/impresion/zpl.ts` (QR magnificación 4), envío
  por **Zebra Browser Print** desde el navegador del cajero (`lib/impresion/browserPrint.ts`); el SDK
  propietario se instala aparte (ver `public/vendor/README-zebra.md`). **Pendiente:** conectar el equipo
  físico cuando llegue.

### Marca
- Logo: **Ranch Texas Express** (tema western). Paleta:
  - Marrón oscuro `#3B2416`
  - Crema `#F4EAD7`
  - Dorado/mostaza `#C79A3C`
  - Verde hoja `#57A23C`
- Archivo del logo esperado en `public/logo.png` (lo sube el responsable; placeholder mientras tanto).

## Pendientes
- **(P1) Lista final de atracciones.** ✅ *Parcial (2026-08-05):* el responsable envió las **9 atracciones
  que EXIGEN consentimiento**: Mario Karts, Karts Fórmula 1, Karts Buggies, Karts Areneros, Karts Playeros,
  Motocross, Botes, Paseo Caballo, Paseo Pony (ya en `seed.ts`). **Falta** la lista de atracciones/zonas
  que NO exigen consentimiento (piscinas, etc.) para completar el catálogo.
- **(P2) Tabla de requisitos de edad/estatura por atracción.** La envía el responsable.
- **(P3) Medios de pago:** el responsable está verificando la lista propuesta (efectivo, débito,
  crédito, Nequi, Daviplata, transferencia, bono/convenio).
- **(P4) Logo definitivo.** El logo "Ranch Texas Express" enviado NO es el final; el responsable
  enviará el correcto. La paleta de marca actual es **provisional** y se ajusta en un solo lugar
  (`tailwind.config.ts` → colores `ranch`). Archivo esperado en `public/logo.png`.

### Venta histórica (Excel)
- Se cargó la venta histórica desde `D:\Datos\13 - Ventas No Salud\01 - Ranch Texas.xlsx`
  (hoja "Datos", columnas FECHA/PRODUCTO/VALOR/NEGOCIO) a la tabla **`ventas_historicas`**.
- Es data **agregada por fecha y línea de producto** (no transaccional), separada del modelo de
  ventas en vivo. Alimenta los comparativos año vs año en Power BI (F7/F8).
- Rango 2020-01 a 2026-07; **5.302 filas** válidas (se omiten 1.465 sin valor); total
  **$20.906.273.922**. 19 productos (ENTRADAS domina con ~$14.700M).
- Granularidad mixta: 2020–2021 mensual, 2023–2024 diaria. Se guarda por fecha; Power BI agrupa.
- **Solo se carga RANCH TEXAS** (decisión del responsable). Los demás negocios de la carpeta NO se
  cargan. Total cargado: **5.302 filas · $20.906.273.922** (2020-01 a 2026-07).
- Importador genérico e idempotente por `origen` (nombre de archivo); detecta encabezado por nombre de
  columna. Por defecto apunta solo a `01 - Ranch Texas.xlsx`. Soporta carpeta (multi-negocio) si en el
  futuro se decide consolidar varios: `npm run import:historico -- "<carpeta o xlsx>"`.
- Calidad de datos del origen (Ranch Texas): granularidad mixta (2020–2021 mensual, 2023–2024 diaria);
  1.465 filas sin valor omitidas. Revisar antes de usar en reportes oficiales.

### Inventario de animales (Excel + infografía)
- Fuente: `D:\Escritorio\INVENTARIO ANIMALES RANCH.xlsx` (hoja "LISTADO CABALLOS", que en realidad es
  el censo general) + infografía de consumo mensual de alimento.
- El censo viene **por grupo con cantidad** (no por individuo): PATOS 47, PECES KOY 300 (aprox.),
  GALLINAS PONEDORAS 96, etc. → se agregó `Animal.cantidad` (default 1 = individuo). **29 grupos,
  683 cabezas** (Mojarras sin cantidad, por confirmar).
- Categorías derivadas: Caninos, Bovinos, Caprinos, Ovinos, Aves de corral, Aves ornamentales,
  Lagomorfos, Peces, Reptiles, Fauna silvestre. Tigrilla y Ocelote marcados "pendiente entregar a
  Amigos de la Fauna" (fauna silvestre, no de exhibición permanente).
- Alimento (9 ítems con costo por bulto/kg, consumo mensual $5.357.000). **Por confirmar:**
  unidad/costo unitario de **Acuatilapia** (solo total $305.000/mes) y desglose de "Aves en general".
- Carga idempotente con `npm run import:animales` (reemplaza los animales inventados de `seed:boceto`).

### Alimentación y ubicación de animales (F11, 2026-08-24)
Decisiones del responsable en la entrevista previa:
- **Alcance:** dieta (parámetro) **+ bitácora diaria** de lo realmente entregado, con descuento de
  existencia del alimento.
- **Individual vs. grupal:** campo `modo` en cada ración. `individual` = la cantidad es **por cabeza**
  y se multiplica por el censo del grupo (800 g × 10 perros = 8 kg/día); `grupal` = la cantidad es el
  **total del lote**, sin importar cuántos sean. Era imprescindible: los datos reales mezclan las dos
  formas ("800 g/animal" vs. "5 kg diarios entre el lote").
- **Ubicación:** recinto actual en el animal **+ historial de traslados** (`traslados_animal`), con
  fecha, origen, destino, cabezas y motivo. La capacidad del recinto **avisa pero no bloquea**.
- **Captura:** formularios CRUD dentro de `/admin/animales` (antes era solo lectura).

Decisiones técnicas derivadas:
- **Nada de decimales.** Las cantidades de alimento se guardan como entero en **unidad base**
  (gramos, mililitros o unidades), igual que el dinero se guarda en pesos enteros. `Alimento.equivalencia_g`
  dice cuántos gramos trae una unidad de compra (bulto de 40 kg = 40000) y permite convertir entre
  "800 g por perro" y "8 bultos al mes". Si el usuario escribe 0,8 kg se guarda como 800 g.
- **Existencia recalculable.** `alimentos.existencia_base` nunca se escribe a mano: se recalcula desde
  `movimientos_alimento` (entrada suma, salida resta, **ajuste fija el saldo** por conteo físico).
  Misma regla que el total de venta frente a su detalle.
- **Anular no borra:** el registro de alimentación se marca anulado y el kardex recibe un movimiento
  de compensación. Anular es solo de administrador.
- **Frecuencia** pasó de texto libre a enum (`diaria`, `semanal`, `quincenal`, `mensual`). El mes se
  toma de **30 días**. La bitácora es diaria, así que una ración mensual se **prorratea al día**
  (8 bultos/mes → 10,67 kg/día) para comparar planeado vs. entregado.
- Verificado contra los datos reales: la suma de costos mensuales de las 11 raciones da
  **$5.357.000/mes**, idéntico al total de la infografía.

**Respuestas del responsable (2026-08-24), ya aplicadas:**
- **Melaza viene por 20 kg**, no 40 → `equivalencia_g = 20000`. Su costo mensual no cambia
  ($312.000: 6 × $52.000); lo que cambia es el consumo real (120 kg/mes, no 240).
- **Perros: 800 g por animal al día.** Esa es la regla buena, no el agregado mensual. La ración pasó a
  `modo = individual`, `800 g`, `frecuencia = diaria`. Consecuencia: su costo baja de $880.000 a
  **$660.000/mes** (800 g × 10 perros × 30 días = 240 kg = 6 bultos) y el total del parque queda en
  **$5.137.000/mes**. La diferencia de $220.000 contra la infografía es real y queda a la vista.
- **Rol operativo de granja: aprobado.** Ver abajo.

**Rol `granja` (nuevo, 2026-08-24)**
- Se agregó al enum `Rol` (migración `20260824160000_rol_granja`). Va **por debajo de `consulta`** en la
  jerarquía a propósito: el operario **no ve ventas, caja, gastos ni el resumen de facturación del
  inicio**. Su acceso al módulo de Animales se concede aparte con `puedeOperarGranja()`, no por nivel.
- **Puede:** alimentar (bitácora), trasladar animales, crear/editar grupos y registrar movimientos de
  alimento (recibir la compra).
- **No puede:** tocar los maestros (recintos, alimentos, dieta) — eso sigue siendo de supervisor — ni
  anular registros (administrador).

**Por confirmar con el responsable:**
- **El bulto se asumió de 40 kg** para los demás concentrados (estándar en Colombia). Melaza ya
  confirmada en 20 kg.
- **Lista real de recintos** — el responsable la va a anexar; hasta entonces los 29 grupos siguen
  "sin ubicar".

**Súper Ternera** ✅ *(confirmado 2026-08-24):* lo comen **Terneros (3) y Terneras (7)**, 1 kg por animal
al día. Se partió en **dos raciones `individual`** (una por grupo), porque una ración apunta a un grupo o a
una categoría, y "Bovinos" habría arrastrado vacas, toros y toretes. Resultado: 10 kg/día = $637.500/mes
(antes $680.000 documentados). Con esto el total del parque queda en **$5.094.500/mes**; los $262.500 de
diferencia contra la infografía son el efecto de reemplazar agregados por reglas por cabeza, y quedan a
la vista para revisarlos contra las compras reales.

### Alimentación actualizada (2026-09-13)

Seis cuadros nuevos del responsable reemplazan la infografía de agosto. Carga idempotente con
`npm run alimentacion:2026 -- --confirmar` (`scripts/alimentacion-2026-09.ts`).

- **Los precios se guardan CON IVA (5%).** El parque no es responsable de IVA: el impuesto que paga
  por el alimento es costo, no un saldo a favor. Guardar el valor sin IVA subestimaría el gasto.
- **Las presentaciones cambiaron y eso mueve el costo por kilo**, no solo el precio: el maíz pasó de
  40 a 50 kg por bulto, la melaza de 20 a 30, la sal de 40 a 20 y el Italcán de 40 a 30. El supuesto
  de agosto ("todo bulto es de 40 kg") queda cerrado con datos reales.
- **Acuatilapia** ✅ resuelto: es **1 bulto/mes a $320.250**, no 2 bultos estimados.
- **Aves en general** ✅ resuelto: 6 bultos de maíz + 2 de Prepico al mes.
- **60 EQUINOS cargados por primera vez** (36 caballos, 10 potros, 14 minis). No estaban en el censo
  de agosto pese a que el Excel se llamaba "LISTADO CABALLOS". El parque pasa de 683 a **743 cabezas**.
- **La alfalfa se guarda con la equivalencia HÚMEDA (50 kg)**, no la del bulto seco (25 kg): las dietas
  están escritas en alfalfa húmeda y el bulto rinde el doble al humedecerlo.
- **El heno se mide en pacas**, no en kilos (`unidad_medida = "paca"`, $14.500 c/u). Es la única forma
  de que el costo salga bien sin conocer el peso de la paca.
- **Los perros pasan a ración grupal** (8 kg/día al lote). En agosto se confirmó "800 g por perro × 10
  perros"; el cuadro nuevo dice 12 perros y los mismos 8 kg/día, así que manda el total del lote.
- **La ración de los caprinos cuelga de la categoría, no del grupo CABRAS.** El cuadro dice "24 cabras"
  y son los 24 caprinos completos (12 cabras + 5 cabros + 7 crías), no las 12 del grupo.

**Hallazgo:** el cuadro de equinos **no suma el heno**, que son 1.200 pacas al mes = **$17.400.000** —
más que todo el concentrado equino junto. Con heno, la alimentación del parque es **$38.261.002/mes**
y no los $20.866.480 que suman los dos cuadros.

**Confirmado por el responsable (2026-09-13):**
- **La libra de la conejina es la colombiana, de 500 g**, no los 0,4536 kg del cuadro (esa es la libra
  imperial). Son 30 libras al mes = **$53.550**, no $59.029. Es la única diferencia contra el cuadro
  de la granja ($4.967.551 en la app contra $4.973.029 en el papel).
- **"Talcán" es el mismo Italcán** escrito distinto. No se crea como alimento aparte.
- **Mandan los cuadros sobre el Excel de agosto**: perros 10 → **12**, vacas 9 → **15**. No cambia
  ningún costo (esas raciones son grupales), pero deja el censo al día.
- **La paca de heno pesa 15 kg en promedio** (no es exacta). No mueve el costo — la dieta se mide en
  pacas — pero sí la lectura de la bitácora: 40 pacas al día son 600 kg, 18 toneladas al mes.

### Reparto automático de la alimentación (2026-09-14)
- **Áreas creadas:** `PESEBRERAS` (los 60 equinos: caballos, potros, caballos mini) y `GRANJA` (el
  resto de las 29 especies). Asignación inicial hecha por script directo a producción, con el mismo
  historial de traslados que deja la app.
- **La dieta ya no se registra a mano todos los días:** un cron dispara
  `npm run alimentar:auto` a las 7:00 a.m., 12:00 m. y 4:00 p.m. hora Bogotá.
  - **Equinos (categoría EQUINOS): 3 franjas** (7 a.m., 12 m., 4 p.m.). El resto de categorías:
    **2 franjas** (7 a.m., 4 p.m.). La cantidad de la ración (ya prorrateada al día en
    `cantidadPorEntrega`) se reparte entre las franjas que le tocan a esa categoría.
  - **Las raciones de "consumo libre"** (sal mineralizada y melaza de las vacas) quedan **fuera** del
    reparto automático — es acceso todo el día, no una entrega puntual. Se siguen registrando a mano
    si hace falta.
  - Cada entrega automática queda marcada (`automatico=true`, `franja`) y es **idempotente**: si el
    cron se repite o se atrasa unos minutos, no duplica la entrega del día.
  - Implementación: `lib/animales/auto-alimentacion.ts` (reglas puras, con pruebas),
    `lib/animales/ejecutar-automatico.ts` (orquesta contra la BD), `scripts/alimentar-automatico.ts`
    (punto de entrada del cron). Migración `20260914155957_f_reparto_automatico_alimentacion`.
  - **Disparador: GitHub Actions**, no Railway Cron (el responsable maneja todos sus cron por
    GitHub). `.github/workflows/alimentar-automatico.yml` corre `0 12,17,21 * * *` (UTC = 7 a.m./
    12 m./4 p.m. Bogotá) más `workflow_dispatch` para correrlo a mano. Usa el secreto de repo
    `DATABASE_URL` (la URL pública de Postgres en Railway, para que el runner externo se conecte).
    *(Se intentó primero un Cron Job de Railway; se creó y se revirtió — el responsable no maneja
    esa parte de Railway.)*

### Cliente maestro por celular, para agilizar taquilla (2026-09-14)
- **Llave = celular, NO cédula.** La cédula queda por fuera a propósito: niños no la
  tienen, extranjeros traen pasaporte, mucha gente no la trae encima, y hoy es un
  campo opcional en taquilla — obligarla frenaría la caja en vez de agilizarla.
- **El celular se recicla y la gente lo cambia seguido en Colombia.** Por eso un
  match **nunca se aplica solo**: la taquilla lo muestra como SUGERENCIA ("¿Es Fulano
  de Tal?") y el cajero —que tiene al cliente en frente— la confirma con un clic. Así
  un número reciclado no le hereda a un desconocido los datos de otra persona.
  - Tabla `clientes` (`prisma/schema.prisma`), llave única `celular` normalizado a
    solo dígitos. `Venta.cliente_id` enlaza cada venta a su cliente maestro; los
    campos `comprador_*` de la venta se conservan igual (son la foto de esa venta).
  - Se alimenta solo (upsert) al registrar cada venta con celular+nombre
    (`lib/ventas/registrar.ts`); la búsqueda es `buscarClientePorCelular`
    (`app/(caja)/taquilla/actions.ts`), disparada al salir del campo celular.
  - Migración `20260914225127_f_clientes_por_celular`.
- **Pendiente/a futuro:** no se migró el histórico de ventas viejas a `clientes` (solo
  alimenta hacia adelante); si se quiere un reporte de clientes frecuentes o dedup
  del histórico, tocaría un script aparte.

### Tarifas por día: semana vs. fin de semana y festivo (2026-09-24)
- **Primer intento (revertido el mismo día):** cada tipo con DOS tarifas vigentes a la
  vez (`Tarifa.dia_tipo`). Resultó ser el modelo equivocado — no era lo que se pedía.
- **Modelo correcto:** un tipo = un precio. Lo que cambia con el día es **cuáles tipos
  se ven en taquilla**, no cuánto cuesta cada uno. En producción ya existían catálogos
  paralelos ("SEMANAL ADULTO/NIÑO/..." para eventos entre semana vs. "ADULTO"/"NIÑO"
  para fin de semana/festivo) — el problema real era que taquilla los mostraba TODOS
  a la vez y el cajero no sabía cuál usar.
  - `TipoVisitante.disponible_dias` (`todos` | `semana` | `fin_semana_festivo`). Un
    festivo colombiano entre semana (con traslado Emiliani) cuenta como
    `fin_semana_festivo`, aunque no caiga sábado ni domingo.
  - Qué día es "hoy" lo decide `diaOperativoDe()` / `disponibleHoy()`
    (`lib/tarifas/disponibilidad.ts`), reutilizando `festivosColombia()`
    (`scripts/festivos-co.ts`).
  - **Taquilla EXCLUYE de la consulta** los tipos que no aplican hoy (ni siquiera
    llegan a la pantalla). El servidor valida lo mismo al registrar la venta
    (`lib/ventas/registrar.ts` → `LineaVenta.disponible_hoy`, `lib/ventas/calculo.ts`):
    no se confía en qué tenía abierto el cajero.
  - `/admin/tarifas`: el formulario de edición (ventana modal) tiene un selector
    "Disponible en taquilla" además de la tarifa única con su historial.
  - `ADULTO`/`NIÑO` → solo fin de semana/festivo; `SEMANAL *` → solo entre semana; el
    resto (bonos, adulto mayor, bebé, tarifa comercial…) queda en "todos los días" por
    ser el valor por defecto seguro (`scripts/_tmp-set-disponibilidad.ts`, uso único) —
    el administrador ajusta cualquier caso puntual desde la pantalla.

### Tarifas restringidas a administrador (2026-09-24)
- **"Eventos Varios" solo debe verse y venderse por un administrador** — el responsable
  no quiere que un cajero pueda aplicarle descuentos por su cuenta. Como el cajero ni
  siquiera ve el tipo, el problema queda resuelto de raíz (más fuerte que solo ocultar
  el botón de descuento).
  - `TipoVisitante.solo_administrador` (editable en `/admin/tarifas`, junto a las demás
    banderas del tipo). Taquilla excluye estos tipos de la consulta salvo que quien
    tenga la sesión sea administrador.
  - Validado también en el SERVIDOR: `ContextoVenta` ahora lleva `usuarioRol`, y
    `crearVenta` rechaza la línea si el rol no alcanza (`lib/ventas/calculo.ts` →
    `LineaVenta.permitido_rol`) — mismo criterio que `disponible_hoy`/`permite_descuento`.
  - Marcado en "EVENTOS VARIOS" con `scripts/_tmp-set-solo-admin.ts` (uso único).

### Tarifa Comercial Especial: descuento unitario solo en un tipo (2026-09-24)
- **El descuento unitario en taquilla ("% Aplicar descuento", precio libre por unidad +
  motivo + autorización) ya existía para CUALQUIER tipo que cobrara.** El responsable
  pidió restringirlo: solo un tipo dedicado a precios de evento/convenio ("Tarifa
  Comercial Especial", $55.000 de lista) debe poder descontarse — porque los eventos
  negocian valores distintos cada vez (47.000, 48.000, 43.000, 35.000…) y no quiere
  crear una tarifa nueva por cada uno.
  - `TipoVisitante.permite_descuento` (editable en `/admin/tarifas`, junto a "requiere
    carnet"/"requiere escaneo"); en taquilla el botón de descuento solo aparece si el
    tipo lo tiene en `true`.
  - **Se valida también en el SERVIDOR** (`lib/ventas/calculo.ts` → `validarVenta`,
    poblado desde la BD en `lib/ventas/registrar.ts`): quién puede descontarse lo decide
    la BD, no lo que mande el navegador — mismo criterio que ya se usaba para el
    escaneo de bonos.
  - Tipo creado con `scripts/_tmp-crear-tarifa-comercial.ts` (uso único), con la misma
    tarifa en las dos franjas (semana / fin de semana y festivo).

### Caja de Pruebas: probar taquilla sin ensuciar las cifras reales (2026-09-24)
- El responsable no tenía forma de entrar a revisar taquilla (tarifas nuevas, recibo,
  etc.) sin que la venta de prueba contara en el ingreso real. Nada se borra en este
  sistema, así que la salida no es "borrar la venta de prueba" sino que **nunca cuente**.
  - `Caja.es_prueba` (una sola caja, "🧪 Caja de Pruebas", creada con
    `scripts/_tmp-crear-caja-pruebas.ts`, uso único). Se abre turno y se vende ahí
    exactamente igual que en cualquier caja real.
  - Sus ventas quedan **excluidas por defecto** de los indicadores de ingreso
    (`lib/reportes/ventas.ts`: dashboard, reporte de ventas, ticket promedio, CSV) —
    salvo que alguien filtre esa caja a propósito desde el selector de caja del reporte.
  - A propósito **NO** se excluye de las pantallas operativas (estado de cajas, cuadre,
    cierre por caja): ahí la caja de prueba se ve igual que cualquier otra, pero
    claramente rotulada, porque esas pantallas son de arqueo/operación, no de ingreso.
  - **Pendiente/no cubierto:** si alguna manilla de una venta de prueba se llega a
    escanear en un punto de control real, sí sumaría al aforo del día (el aforo se mide
    por escaneo, no por caja) — evitar escanear manillas de prueba en control de acceso.

### Control Vehículo — nuevo módulo (2026-09-24)
- Hay un vehículo (varios, en general) y un chofer que lo maneja, pero ~200 "jefes"
  pueden pedirlo. El responsable quiere control de quién más lo pide, quién más maneja
  y cuánto se rueda, con aprobación de por medio (no cualquier solicitud sale sola).
  - **Nuevo rol `chofer`**: inicia sesión, ve SUS viajes aprobados y los cierra
    registrando kilometraje inicial y final **en un solo paso** (no dos), al volver.
    Va por debajo de `consulta` en la jerarquía (`lib/auth/sesion.ts`), como `granja`:
    su acceso se concede aparte con `puedeConducir`, no por nivel.
  - **Solicitantes sin login**: catálogo simple (nombre + cargo), igual que
    `AutorizadorCortesia` — alguien de oficina (supervisor/administrador) registra la
    solicitud a nombre del jefe que la pide.
  - **Flujo**: solicitar (día, horas, prioridad, descripción) → pendiente → un
    supervisor/administrador aprueba (asigna vehículo + chofer) o rechaza con motivo →
    el chofer cierra con el kilometraje → completada. Se puede cancelar antes de cerrar.
  - Modelos: `Vehiculo`, `SolicitanteVehiculo`, `SolicitudVehiculo` (con
    `PrioridadVehiculo`, `EstadoSolicitudVehiculo`).
  - Reporte (`/admin/reportes/vehiculos`): viajes y km por solicitante (quién pide
    más), por chofer y por vehículo, del período — solo cuenta lo ya cerrado.
  - Pendiente/a futuro: no hay pantalla para que el propio "jefe" vea el estado de su
    solicitud (tendría que preguntarle a quien la registró); no se contempló todavía.
- `roles`: enum fijo (5 roles) vs. tabla configurable de permisos. Arranca como enum.
- Consecutivo de venta/manilla: ¿por caja, por día, global? (afecta reimpresión y facturación futura).
- Hora de corte del "día operativo" para cuadre diario y export CSV (no medianoche UTC).
  ✅ *Resuelto para el consolidado (2026-08-10):* corte a medianoche **America/Bogota** por fecha de
  venta (`creado_en`). Pendiente definir si aplica el mismo criterio a otros reportes/exports.
- Vencimiento de manilla: fin del día operativo; definir hora de corte exacta.
- Almacenamiento de firmas de consentimiento e imágenes de soporte de gastos: volumen de Railway vs.
  almacenamiento externo (S3/UploadThing). Railway tiene filesystem efímero.
- Política ante **doble ingreso/aforo en modo offline**: reconciliación al sincronizar + alerta
  auditada (no se puede "des-ingresar").
- Verificación periódica de restauración de backups de Railway.
