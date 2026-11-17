# ESTADO DE VERSIÓN 8

> **Resumen honesto:** la V8 está **construida y probada en modo demostración**, pero **NO cumple la definición de terminado del plan** (punto 1: «conectados a la base de datos real»), porque la base de datos sigue sin definirse (ADR-001 pendiente). Los gastos y los costos de los consumos viven en `sessionStorage` y **se pierden al cerrar la pestaña**. **El costo promedio sigue BLOQUEADO a propósito** (RF-027, RF-028 y RF-029): no hay ninguna fórmula implementada y nada en el sistema presenta un promedio como oficial.

## Versión completada
- Versión 8: Gastos y costos de adquisición (sin fórmula de promedio), noviembre de 2026. Estado: **parcial (demo)**.
- Se construyó sobre la V7 tal como la dejó el equipo (`docs/ESTADO_V7.md`).

## Stack vigente
- **Base de datos / alojamiento:** NO definidos. Adaptador de demostración (`sessionStorage`) con banner «MODO DEMOSTRACIÓN».
- **Bibliotecas:** sin cambios (React 18.3, react-router-dom 6, Vite 5, decimal.js 10, Vitest 2 + Testing Library + jsdom). No se agregó ninguna.
- **Comandos:** `npm install` · `npm run dev` · `npm test` · `npm run build`.

## Requerimientos
| Requerimiento | Estado |
| --- | --- |
| RF-012 Registrar gastos asociados a los productos | Implementado y probado en demo (`/gastos`, `/gastos/nuevo`) |
| RF-030 Registrar costos relacionados con el consumo | Implementado y probado en demo: costo manual opcional al registrar el consumo y edición desde `/consumos/:id` |
| RF-026 Registrar el costo de adquisición | Cumplido: se registra en cada línea de compra (V5); la V8 lo consulta en `/costos` y `/costos/:productoId` |
| RNF-86 Información clara de cantidades y costos | Parcial: importes exactos con formato monetario consistente, cada cantidad con su unidad y los faltantes como «Sin costo registrado»; los reportes son de la V10 |
| RF-027 Calcular el costo promedio | **BLOQUEADO** (fórmula sin aprobar): `calcularCostoPromedio` lanza `FormulaPendiente` |
| RF-028 Actualizar el costo promedio con nuevas compras | **BLOQUEADO** (igual) |
| RF-029 Consultar el costo promedio de cada producto | **BLOQUEADO**: la columna dice «Pendiente de definición» |
- **Bloqueado además:** la verificación contra base real (todas las pruebas de aceptación «conectado a la base real»).

## Archivos
**Nuevos**
- `src/nucleo/costos/index.js` — módulo aislado: `calcularCostoPromedio` (lanza `FormulaPendiente`), `costoPromedioParaMostrar`, `periodoCerrado`
- `src/nucleo/datos/gastos.js` — reglas puras de los gastos
- `src/nucleo/datos/pruebasContratoCostos.js` — pruebas de contrato de gastos, costo del consumo y costos de adquisición
- `src/modulos/gastos/ModuloGastos.jsx`, `PaginaListaGastos.jsx`, `FormularioGasto.jsx` — `/gastos` y `/gastos/nuevo`
- `src/modulos/costos/ModuloCostos.jsx`, `PaginaCostos.jsx`, `PaginaHistorialCostos.jsx`, `NavegacionCostos.jsx`, `CostoPromedio.jsx` — `/costos` y `/costos/:productoId`
- `src/modulos/salidas/PaginaDetalleConsumo.jsx` — `/consumos/:id`
- `src/pruebas/costos.test.js`, `costos.test.jsx`, `gastos.test.jsx`, `consumosCosto.test.jsx`
- `docs/ESTADO_V8.md`

**Modificados**
- `src/nucleo/datos/contrato.js` (secciones `gastos` y `costos`; `consumos` suma `editarCostoConsumo`), `adaptadorDemo.js` (gastos, costos de adquisición y costo del consumo), `compras.js` (se exporta `leerImporte`), `salidas.js` (costo opcional del consumo)
- `src/modulos/salidas/FormularioDeOperacion.jsx` (campo «Costo del consumo»), `PaginaListaOperaciones.jsx` (columna Costo y enlace «Ver» en consumos), `ModuloConsumos.jsx` (ruta `:id`), `textos.js` (los textos del consumo ya no dicen que el costo llega después)
- `src/nucleo/modulos.js` (Gastos y costos: disponible, con `rutasExtra`), `src/App.jsx` (rutas), `src/estilos.css`, `src/pruebas/adaptadorDemo.test.js`
- `docs/CONTRATO_DATOS.md` (sección 2.10), `docs/MODELO_DE_DATOS_PLANIFICADO.md`, `docs/GUIA_CONEXION_BASE_DE_DATOS.md` (tarea BD-12), `package.json` (versión 0.8.0)

## Modelo de datos
Sin migraciones (no hay base real). Estructura que debe crear la base real (campos en camelCase en el código; la base puede usar snake_case):

| Entidad | Campos |
| --- | --- |
| `gastos` | `id`, `fechaGasto`, `concepto` (3 a 120), `importe` decimal(14,2) > 0, `productoId` (nulo), `compraId` (nulo), `nota` (nulo), `usuarioId`, `registradoEn` (servidor), `claveIdempotencia` (única). **Inmutable** |
| `consumos` (columnas nuevas) | `costoImporte` decimal(14,2) nulo (> 0), `costoOrigen` (`manual`) nulo, `costoActualizadoEn` nulo. Único dato editable del consumo |
| `consumo_costo_cambios` (nueva) | `id`, `consumoId`, `importeAnterior` (nulo), `importeNuevo` (nulo), `cambiadoEn`, `usuarioId`. Solo `INSERT` |

**No existe tabla ni campo de costo promedio.** Los costos de adquisición se leen directamente de las líneas de compra. Cambios respecto al modelo planificado: se agregó `claveIdempotencia` a los gastos y la tabla `consumo_costo_cambios` (decisión acordada, para mantener la trazabilidad: el valor anterior del costo no se pierde). Almacenamiento demo: los gastos en `inventario.demo.gastos`; el costo de los consumos y su historial dentro de `inventario.demo.inventario`.

## Funciones y componentes clave
- **`datos.gastos`:** `registrarGasto`, `listarGastos`, `obtenerGasto` (contrato en `docs/CONTRATO_DATOS.md`, 2.10). Idempotente por clave; no modifica compras, existencias ni costos.
- **`datos.consumos.registrarConsumo({..., costoImporte?})`** y **`editarCostoConsumo(id, {costoImporte})`** → `{consumo, cambiado}`; el consumo trae `costoImporte`, `costoOrigen`, `costoActualizadoEn` y `costoCambios`.
- **`datos.costos`:** `listarCostosPorProducto` e `historialCostosAdquisicion(productoId)`. Solo lectura. **No hay ninguna operación de costo promedio.**
- **`calcularCostoPromedio`** (`src/nucleo/costos`): lanza `FormulaPendiente` siempre. Las pantallas pasan por `costoPromedioParaMostrar` y `CostoPromedio.jsx`: cuando el hogar apruebe la fórmula, se implementa **solo allí** y las pantallas empiezan a mostrar el valor.
- **`periodoCerrado(dia)`** (`src/nucleo/costos`): hoy devuelve siempre `false` porque el «cierre» todavía no existe; es el punto donde la V9 o la V10 lo conectarán para limitar la edición del costo del consumo.
- Pantallas: `/gastos` (lista con filtros por fecha y producto, sin totales) y `/gastos/nuevo` (con confirmación y protección contra el doble envío); `/costos` (por producto, con «Costo promedio: Pendiente de definición») y `/costos/:productoId` (historial real: fecha, cantidad, costo unitario y total); `/consumos/:id` (detalle, edición del costo, historial de cambios).

## Reglas aplicadas
- **No se asume ninguna fórmula:** ni promedio ponderado, ni simple, ni último costo, ni costo por unidad base. Nada se presenta como promedio oficial. El historial de costos de adquisición es información real: se muestra tal como se registró, sin promediar, sin totales y sin rotularlo como promedio.
- **No se suma dos veces el mismo importe:** un gasto relacionado con una compra se identifica como relacionado («Relacionado, no se suma») y no cambia el total de la compra ni el historial de costos. Tampoco se muestran totales de gastos.
- **El costo del consumo es un importe propio** (origen manual) que escribe la persona: nunca se deriva de ningún promedio, aunque existan compras con costos distintos.
- **Los valores faltantes se muestran como faltantes:** un consumo sin costo dice «Sin costo registrado» y nunca se rellena con 0; un producto sin compras dice «Sin compras registradas».
- Los importes usan decimales exactos (hasta 2 decimales, mayores que cero) y un formato monetario consistente; las fechas de día se muestran sin desfase de zona horaria.
- El costo del consumo se puede editar mientras no haya cierre (hoy el cierre no existe). **Cada cambio queda en un historial** y el valor anterior no se pierde. Todo lo demás del consumo sigue inmutable.
- Un gasto no se edita ni se borra.
- Validaciones en la capa de datos; los formularios solo muestran sus mensajes (todos a la vez, junto a cada campo). Idempotencia en los gastos y en los consumos; una clave reutilizada con otro costo o con otro gasto se rechaza.

## Pruebas
`npm test` → **456 pruebas, todas pasan** (21 archivos) y `vite build` compila.
- `adaptadorDemo.test.js` (236): contrato de V1 a V7 y **29 pruebas nuevas** de gastos, costo del consumo y costos de adquisición.
- `gastos.test.jsx` (12), `costos.test.jsx` (11), `consumosCosto.test.jsx` (12) y `costos.test.js` (5): pantallas y módulo aislado.
- Resto (V1 a V7, sin cambios): `salidas.test.jsx` (16), `movimientos.test.jsx` (23), `comprasFormulario.test.jsx` (15), `consolidado.test.jsx` (16), `productos.test.jsx` (13), `inventario.test.jsx` (14), `comprasLista.test.jsx` (12), `conversiones.test.jsx` (11), `presentaciones.test.jsx` (10), `movimientos.test.js` (13), `unidades.test.jsx` (9), `movimientosRendimiento.test.js` (3), `productosIncompletos.test.jsx` (3), `aplicacion.test.jsx` (7), `utilidades.test.js` (12), `periodos.test.js` (3).
- **Casos de aceptación del plan cubiertos:** registrar un gasto y verlo en la lista; registrar un consumo con costo manual y ver el importe asociado; `calcularCostoPromedio` lanza `FormulaPendiente` y la pantalla muestra «Pendiente de definición»; el historial de costos de un producto coincide exactamente con las líneas de compra registradas (comparado línea por línea contra lo que devuelven las compras).
- También: un gasto relacionado con una compra no cambia el total de la compra; un consumo sin costo no inventa uno aunque haya compras con costos distintos; editar el costo conserva el valor anterior en el historial y no toca la cantidad ni la existencia; el doble clic y el reintento tras un fallo de conexión no duplican un gasto.
- Se comprobó rompiendo a propósito el código (rellenar con 0 un costo faltante, no marcar el gasto como relacionado, agregar un costo promedio al historial, no guardar el historial de cambios, quitar la idempotencia de los gastos, mostrar solo la última compra, devolver un promedio en vez de lanzar `FormulaPendiente`, mostrar un total de gastos, y mostrar las fechas con zona horaria) que las pruebas correspondientes **fallan**.
- **No probado:** nada contra una base real; no se revisó la interfaz en un navegador real ni en tablet.

## Permisos requeridos (para la V18)
`gastos.ver`, `gastos.registrar`, `costos.ver`, `consumos.registrar_costo`. **No se aplican todavía**: todo usuario autenticado tiene acceso completo (temporal).

## Decisiones provisionales (PROVISIONAL)
- **Historial de cambios del costo del consumo:** cada edición se guarda como un registro nuevo y el valor anterior no se pierde (en vez de sobrescribir). Es una tabla agregada al modelo.
- **El «cierre» no existe todavía:** el costo siempre se puede editar; `periodoCerrado` es el punto de conexión para cuando se defina.
- **Importes mayores que cero**, con hasta 2 decimales. «Sin costo» se representa vacío, no con 0.
- El costo del consumo es el **importe total** del consumo (no un costo por unidad).
- Concepto del gasto de 3 a 120 caracteres; la fecha del gasto la elige la persona y no puede ser futura (como en las compras).
- La compra relacionada a un gasto se elige entre las **100 compras más recientes**.
- Los gastos **no se editan ni se borran** y la lista **no muestra totales**.
- `/costos` lista todos los productos con la cantidad de líneas de compra; el costo unitario del historial se muestra tal como se registró («por kg» o «por Caja»).
- Una salida ignora el costo; solo el consumo lo tiene.
- El menú mantiene una sola entrada («Gastos y costos», que abre `/costos`), con una navegación interna entre Gastos y Costos de adquisición; el menú se marca activo también en `/gastos`.

## Pendientes para el hogar
- **Fórmula del costo promedio: BLOQUEADA** hasta su aprobación (RF-027, RF-028, RF-029).
- **Cómo se valora el consumo, qué componentes forman el costo total mensual y cómo se evita el doble conteo** (por ejemplo un gasto relacionado con una compra).
- Si un costo puede ser **cero** (por ejemplo productos donados) o si debe quedar vacío.
- **Cómo corregir un gasto mal registrado:** hoy no hay edición ni anulación.
- Cuándo y cómo se **cierra un período** (limita la edición del costo del consumo).
- **Qué hacer con un producto desactivado que todavía tiene existencia** (pendiente desde la V4).

## Deuda técnica
1. **Base de datos real (bloqueante):** ADR-001, provisionar, conectar y escribir el adaptador con `gastos`, `costos` y el costo del consumo (tarea **BD-12** de `docs/GUIA_CONEXION_BASE_DE_DATOS.md`): `editarCostoConsumo` en una sola transacción y sin `UPDATE`/`DELETE` sobre gastos ni sobre el historial de cambios. Siguen pendientes BD-1 a BD-11.
2. Un gasto mal registrado no tiene corrección (ver pendientes).
3. El formulario de gastos ofrece solo las 100 compras más recientes.
4. Permisos no aplicados (V18).
5. No hay reportes de costos (V10) y el historial y el consolidado de la V7 no muestran costos.
6. El README no se actualizó con la V8 (no se recibió el archivo).
7. La interfaz no se revisó en un navegador real; solo pruebas automáticas.

## Siguiente versión
**V9: Reportes mensuales** (según el plan). Advertencias: hay que definir qué es el **cierre** de un período y conectar `periodoCerrado` (hoy siempre `false`); un reporte de consumo debe tratar los consumos **sin costo como faltantes**, nunca como cero, y no inventar costos; un gasto relacionado con una compra **no se suma automáticamente** (el doble conteo se resuelve con la fórmula aprobada); los costos de adquisición salen de las líneas de compra tal como se registraron, sin promediar; las fechas de día (`fechaGasto`, `fechaCompra`) y las de instante (`registradoEn`, `fechaRegistro`) se cuentan en hora de Costa Rica. Conectar la base real sigue siendo necesario para probar la atomicidad de verdad.
