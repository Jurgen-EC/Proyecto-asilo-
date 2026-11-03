# ESTADO DE VERSIÓN 6

> **Resumen honesto:** la V6 está **construida y probada en modo demostración**, pero **NO cumple la definición de terminado del plan** (punto 1: «conectados a la base de datos real»), porque la base de datos sigue sin definirse (ADR-001 pendiente). Las salidas y los consumos viven en `sessionStorage` y **se pierden al cerrar la pestaña**. La atomicidad y la concurrencia reales **no se pueden probar de verdad en el adaptador demo** (JavaScript en el navegador corre en un solo hilo): solo se comprueban contra la base real. Además, **salida y consumo son una PROPUESTA TÉCNICA que el plan deja pendiente de validar con el hogar**.

## Versión completada
- Versión 6: Salidas y consumo, octubre de 2026. Estado: **parcial (demo)**.
- Se construyó sobre la V5 tal como la dejó el equipo (`docs/ESTADO_V5.md`).

## Stack vigente
- **Base de datos / alojamiento:** NO definidos. Adaptador de demostración (`sessionStorage`) con banner «MODO DEMOSTRACIÓN».
- **Bibliotecas:** sin cambios (React 18.3, react-router-dom 6, Vite 5, decimal.js 10, Vitest 2 + Testing Library + jsdom). No se agregó ninguna.
- **Comandos:** `npm install` · `npm run dev` · `npm test` · `npm run build`.

## Requerimientos
| Requerimiento | Estado |
| --- | --- |
| RF-010 Registrar salidas de productos | Implementado y probado en demo (`/salidas/nueva`, `/salidas`) |
| RF-011 Registrar el consumo de productos | Implementado y probado en demo (`/consumos/nuevo`, `/consumos`), sin costos (V8) |
| RF-014 Actualizar existencias tras una salida | Implementado y probado: la salida pasa por el mismo núcleo que `registrarMovimiento` |
| RF-015 Actualizar existencias tras un consumo | Implementado y probado (igual) |
| RF-044 Registro digital de lo que hoy se lleva en papel | Parcial: salidas y consumos quedan registrados y listados con filtros; el historial general de movimientos es de la V7 |
| RNF-86 Información clara de cantidades y costos | Parcial: cada cantidad lleva su unidad, la presentación usada y lo descontado en unidad base; los costos del consumo son de la V8 |
- **Bloqueado:** la verificación contra base real (todas las pruebas de aceptación «conectado a la base real»), en especial atomicidad y concurrencia.

## Archivos
**Nuevos**
- `src/nucleo/datos/salidas.js` — reglas puras: validación de la entrada, coincidencia para idempotencia, errores por campo, clases de operación
- `src/modulos/salidas/ModuloSalidas.jsx`, `ModuloConsumos.jsx` — rutas `/salidas`, `/salidas/nueva`, `/consumos`, `/consumos/nuevo`
- `src/modulos/salidas/PaginaListaOperaciones.jsx` (listado de salidas o de consumos), `FormularioDeOperacion.jsx` (formulario de salida o de consumo), `NavegacionSalidas.jsx`, `textos.js` — cada clase con sus textos propios
- `src/pruebas/salidas.test.jsx`
- `docs/ESTADO_V6.md`

**Modificados**
- `src/nucleo/datos/contrato.js` (secciones `salidas` y `consumos`), `adaptadorDemo.js` (registro transaccional, listados y obtención), `pruebasDeContrato.js` (46 pruebas nuevas)
- `src/nucleo/modulos.js` (Salidas y consumo: disponible, con `rutasExtra`), `src/App.jsx` (rutas), `src/compartido/componentes/Layout.jsx` (el menú marca el módulo activo también en `/consumos`), `src/estilos.css`
- `docs/CONTRATO_DATOS.md` (sección 2.8), `docs/MODELO_DE_DATOS_PLANIFICADO.md` (salidas y consumos), `docs/GUIA_CONEXION_BASE_DE_DATOS.md` (tarea BD-10), `package.json` (versión 0.6.0)

## Modelo de datos
Sin migraciones (no hay base real). Estructura que debe crear la base real (campos en camelCase en el código; la base puede usar snake_case):

| Entidad | Campos |
| --- | --- |
| `salidas` | `id`, `movimientoId` (único), `motivo` (texto obligatorio, hasta 200), `nota` (nulo), `fechaRegistro` (servidor), `claveIdempotencia` (única). **Inmutable** |
| `consumos` | `id`, `movimientoId` (único), `nota` (nulo), `fechaRegistro` (servidor), `claveIdempotencia` (única). **Sin motivo. Inmutable** |

Cada operación genera **exactamente un movimiento**: `tipo = 'salida'`, `subtipo = 'salida_general'` (salida) o `'consumo'` (consumo), `referenciaTipo = 'salida'` o `'consumo'` y `referenciaId` = id del registro. Así, en el historial y el consolidado (V7) ambos aparecen como **Salidas** sin perder su distinción. Cambios respecto al modelo planificado: se agregó `claveIdempotencia` (única, como en las compras) y `fechaRegistro` en ambas tablas; `costo_importe` y `costo_origen` del consumo **no se crean todavía** (llegan en la V8). Almacenamiento demo: las claves `salidas` y `consumos` dentro de `inventario.demo.inventario`, junto a movimientos, existencias y compras, para confirmarse con una sola escritura.

## Funciones y componentes clave
- **`datos.salidas.registrarSalida(entrada)`** y **`datos.consumos.registrarConsumo(entrada)`**: contrato en `docs/CONTRATO_DATOS.md` (2.8). Reutilizan `procesarMovimiento` (el núcleo de la V4 y la V5): no duplican lógica de existencias. Devuelven `{salida | consumo, existencia, repetido}`.
- `listarSalidas` y `listarConsumos` (filtros `desde`, `hasta`, `productoId`; la más reciente primero) y `obtenerSalida` y `obtenerConsumo`.
- `validarOperacion`, `operacionCoincide`, `errorDeOperacion` y `claveDelMovimiento` (`nucleo/datos/salidas.js`): puras y reutilizables por cualquier adaptador.
- Pantallas: formulario separado para cada clase. Muestra **«Disponible: X unidad»** del producto elegido (se actualiza sola si cambia el inventario), acepta unidad o presentación (cajas), valida todo junto, pide confirmación antes de guardar y protege contra el doble envío. La clave de idempotencia es una por formulario, así que reintentar no duplica la operación.
- Listados separados con filtros por fecha y producto (el estado vive en la dirección), paginación de 20 y columna «Descontado» en unidad base.

## Reglas aplicadas
- **Una salida o consumo mayor a la existencia SIEMPRE se rechaza** en la capa de datos (no solo en la pantalla): con existencia 5 y una salida de 6 queda 5, informa lo disponible, no crea movimiento ni registro y **nunca** se convierte en ajuste, ingreso ni compra.
- Cantidad mayor que cero, unidad convertible (sin equivalencia configurada nunca se asume una) y producto existente, activo y completo.
- **Salida y consumo no son sinónimos:** tablas, servicios, listados, formularios y textos propios; una salida nunca aparece entre los consumos ni al revés; el consumo no tiene motivo.
- Cada operación = **un producto = un movimiento**, con todo (movimiento, existencia y registro) en una sola escritura.
- **Idempotencia:** reenviar la misma operación devuelve la original sin duplicar, aunque ahora ya no alcanzara la existencia; la misma clave con otra operación (o usada en una salida y en un consumo) se rechaza.
- La fecha, la hora y el usuario los fija la capa de datos. El movimiento conserva la cantidad y la unidad originales, la presentación, el factor y la conversión usados.
- Las salidas y los consumos no se editan ni se borran; las correcciones se harán con movimientos nuevos (V12).
- Validaciones en la capa de datos; los formularios solo muestran sus mensajes (todos a la vez, junto a cada campo).
- No se registran costos de consumo (V8) ni se conectan recetas (V14).

## Pruebas
`npm test` → **306 pruebas, todas pasan** (12 archivos) y `vite build` compila.
- `adaptadorDemo.test.js` (184): contrato de V1 a V5 y **46 pruebas nuevas de salidas y consumos** (las mismas para ambas clases, más las que comparan los dos conceptos y la de atomicidad).
- `salidas.test.jsx` (16): acceso y navegación, estados vacíos, formulario de salida (existencia disponible, validación conjunta, rechazo de una salida de 6 con existencia 5, confirmación, cancelación, cajas, doble clic y reintento tras un fallo de conexión), formulario de consumo y listados (orden, filtros por producto y fecha, paginación).
- Resto (V1 a V5, sin cambios): `comprasFormulario.test.jsx` (15), `productos.test.jsx` (13), `inventario.test.jsx` (14), `comprasLista.test.jsx` (12), `conversiones.test.jsx` (11), `presentaciones.test.jsx` (10), `unidades.test.jsx` (9), `productosIncompletos.test.jsx` (3), `aplicacion.test.jsx` (7), `utilidades.test.js` (12).
- **Casos de aceptación del plan cubiertos:** con existencia 5, una salida de 6 se rechaza, la existencia sigue en 5 y no hay movimiento; con existencia 5, un consumo de 2 deja 3 y aparece en los consumos del producto (el historial general de movimientos es de la V7); una salida de 1 caja de 12 unidades se convierte y descuenta 12 unidades; el doble clic y el reintento no duplican la operación (con la misma clave de idempotencia, aunque la respuesta se haya perdido después de guardar).
- También: dos operaciones simultáneas de 3 con existencia 5 aceptan solo una (también con dos conexiones y con 12 mezclando salidas y consumos), y un fallo simulado a mitad de la operación no deja movimiento, registro ni cambio de existencia.
- Se comprobó rompiendo a propósito el código (sin idempotencia, sin rechazar la clave reutilizada, guardando motivo en el consumo, sin serialización, sin protección de doble envío ni clave estable en la pantalla) que las pruebas correspondientes **fallan**. La protección contra el doble clic tiene dos capas (referencia y botón deshabilitado) y, en las pruebas, cualquiera de las dos por sí sola la cumple.
- **No probado:** nada contra una base real (atomicidad y concurrencia reales incluidas); no se revisó la interfaz en un navegador real ni en tablet.

## Permisos requeridos (para la V18)
`salidas.registrar`, `consumos.registrar`, `salidas.ver`, `consumos.ver`. **No se aplican todavía**: todo usuario autenticado tiene acceso completo (temporal).

## Decisiones provisionales (PROVISIONAL)
- **Salida y consumo se mantienen como conceptos distintos** en datos y pantallas (así lo pide el plan). Si el hogar decide que todo consumo es una salida, o que existen salidas por otros motivos, hay que revisar esto.
- **Una salida o consumo es de UN solo producto** (cada operación genera exactamente un movimiento, como indica el plan). Si el hogar necesita sacar varios productos a la vez, habría que agregar una variante por lote (como en las compras).
- El **motivo de una salida es obligatorio** y de texto libre, hasta 200 caracteres. Un consumo no tiene motivo y, si llega, se ignora.
- El mensaje de existencia insuficiente es el de la V4, que además nombra el producto: «No hay cantidad suficiente de «Papa». Disponible: 5 kg.».
- La clave de idempotencia de la operación admite hasta 80 caracteres y la del movimiento se deriva como `<clave>:1`. La misma clave con otra operación, o usada en una salida y en un consumo, se rechaza con `OPERACION_DUPLICADA`.
- Los filtros de fecha cuentan el día de `fechaRegistro` en hora de Costa Rica; los listados se ordenan de lo más reciente a lo más antiguo; 20 por página.
- El módulo mantiene una sola entrada en el menú («Salidas y consumo»), con una navegación interna entre Salidas y Consumos; el menú se marca activo también en `/consumos` (`rutasExtra`).
- La nota y el motivo viven en la salida o el consumo, no en el movimiento (el movimiento solo guarda la referencia).

## Pendientes para el hogar
- **Validar si todo consumo es una salida y si existen salidas por otros motivos.** Lo implementado es una propuesta técnica (pendiente que dejó el plan).
- Si el motivo de la salida debe ser texto libre o una lista de motivos.
- Si se necesita sacar varios productos en una misma salida.
- **Qué hacer con un producto desactivado que todavía tiene existencia** (pendiente desde la V4): hoy no admite salidas ni consumos hasta reactivarlo.

## Deuda técnica
1. **Base de datos real (bloqueante):** ADR-001, provisionar, conectar y escribir el adaptador con `salidas` y `consumos` (tarea **BD-10** de `docs/GUIA_CONEXION_BASE_DE_DATOS.md`): el movimiento, la existencia y el registro de la salida o el consumo en la **misma transacción**, con bloqueo de fila o actualización condicional. Siguen pendientes BD-1 a BD-9.
2. No hay pantalla de detalle de una salida o consumo ni historial de movimientos (V7): hoy solo se ven en sus listados.
3. El panel «DATOS DE DEMOSTRACIÓN» de `/inventario` (V4) registra movimientos directamente con `registrarMovimiento`, sin crear una salida o un consumo; solo existe con el adaptador demo y queda marcado en la nota.
4. Permisos no aplicados (V18).
5. El README no se actualizó con la V6 (no se recibió el archivo).
6. La interfaz no se revisó en un navegador real; solo pruebas automáticas.

## Siguiente versión
**V7: Historial y consolidado de movimientos.** Advertencias: hoy **no existe ninguna operación para listar movimientos** (`datos.inventario` solo tiene existencias y consistencia): la V7 debe agregarla (`movimientos.listar`). Para mostrar el origen de cada movimiento hay que unir con su registro mediante `referenciaTipo` (`compra`, `salida` o `consumo`) y `referenciaId`, porque el motivo y la nota de una salida o un consumo viven en su propia tabla, no en el movimiento. El consolidado debe contar las salidas y los consumos **juntos como Salidas** sin perder la distinción por `subtipo` (`salida_general` y `consumo`). Antes de empezar, conectar la base real sigue siendo necesario para probar la atomicidad de verdad.
