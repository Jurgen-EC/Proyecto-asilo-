# ESTADO DE VERSIÓN 4

> **Resumen honesto:** la V4 está **construida y probada en modo demostración**, pero **NO cumple la definición de terminado del plan** (punto 1: «conectados a la base de datos real»), porque la base de datos sigue sin definirse (ADR-001 pendiente). Los movimientos y las existencias viven en `sessionStorage` y **se pierden al cerrar la pestaña**. Además, **la atomicidad y la concurrencia reales no se pueden probar en el adaptador demo** (JavaScript en el navegador corre en un solo hilo): solo se comprueban de verdad contra la base real. Al conectarla hay que escribir el adaptador (tarea BD-8) y pasar las mismas pruebas de contrato.

## Versión completada
- Versión 4: Núcleo de movimientos y existencias, octubre de 2026. Estado: **parcial (demo)**.
- Se construyó sobre la V3 tal como la dejó el equipo (`docs/ESTADO_V3.md`).

## Stack vigente
- **Base de datos / alojamiento:** NO definidos. Adaptador de demostración (`sessionStorage`) con banner «MODO DEMOSTRACIÓN».
- **Bibliotecas:** sin cambios (React 18.3, react-router-dom 6, Vite 5, decimal.js 10, Vitest 2 + Testing Library + jsdom). No se agregó ninguna.
- **Comandos:** `npm install` · `npm run dev` · `npm test` · `npm run build`.

## Requerimientos
| Requerimiento | Estado |
| --- | --- |
| RF-016 Consultar existencias actuales de cada producto | Implementado y probado en demo (`/inventario`) |
| RF-017 Mostrar existencias en tiempo real | Parcial: la pantalla se refresca sola tras cada movimiento (`alCambiarInventario`), pero solo dentro de la misma pestaña; con base real depende de su mecanismo |
| RF-018 Registrar automáticamente los movimientos | Implementado y probado en demo: toda operación pasa por `registrarMovimiento`. Los formularios llegan en la V5 y la V6 |
| RF-040 a RF-043 Fecha y momento, cantidades, producto y tipo de cada movimiento | Implementado y probado en demo (la hora la fija la capa de datos) |
| RNF-77 Inventario actualizado en tiempo real | Parcial: ver RF-017 |
| RNF-79 Trazabilidad completa | Cumplido en los datos (cantidad y unidad originales, factor y conversión usados, usuario, hora, clave, referencia). La pantalla de historial es de la V7 |
| RNF-84 Consulta ágil de productos y existencias | Parcial: buscador y paginación hechos; no se puede medir sin base real |
| RNF-89 Estructura que permita módulos futuros | Cumplido: una sola función central, reglas puras reutilizables y contrato por adaptador |
- **Bloqueado:** la verificación contra base real (todas las pruebas de aceptación «conectado a la base real»), en especial atomicidad y concurrencia.

## Archivos
**Nuevos**
- `src/nucleo/datos/inventario.js` — reglas puras: validación de la entrada, idempotencia, existencia insuficiente, cálculo de consistencia, `generarClaveIdempotencia`
- `src/modulos/inventario/PaginaInventario.jsx` — pantalla `/inventario`
- `src/modulos/inventario/PanelDatosDeDemostracion.jsx` — panel solo para desarrollo, rotulado «DATOS DE DEMOSTRACIÓN»
- `src/pruebas/inventario.test.jsx`
- `docs/ESTADO_V4.md`

**Modificados**
- `src/nucleo/datos/contrato.js` (sección `inventario` requerida), `adaptadorDemo.js` (sección `inventario`, cola de registros, escritura única, bloqueo del cambio de unidad base y gancho de pruebas `ganchos`), `pruebasDeContrato.js` (28 pruebas nuevas y parámetro `extras.crearConFalloSimulado`)
- `src/nucleo/modulos.js` (Inventario: disponible), `src/App.jsx` (ruta `inventario`), `src/estilos.css`
- `src/pruebas/adaptadorDemo.test.js` (activa la prueba de atomicidad del demo)
- `docs/CONTRATO_DATOS.md` (sección 2.6 y sección 4), `docs/MODELO_DE_DATOS_PLANIFICADO.md` (movimientos y existencias), `docs/GUIA_CONEXION_BASE_DE_DATOS.md` (tarea BD-8), `package.json` (versión 0.4.0)

## Modelo de datos
Sin migraciones (no hay base real). Estructura que debe crear la base real (campos en camelCase en el código; la base puede usar snake_case):

| Entidad | Campos |
| --- | --- |
| `movimientos` | `id`, `productoId`, `tipo` (`ingreso`\|`salida`\|`ajuste`), `subtipo`, `sentido` (1 o -1), `cantidadOriginal`, `unidadOriginalId`, `presentacionOriginalId` (nulo), `factorAplicado` (factor total, alta precisión), `conversionId` (nulo), `redondeado`, `cantidadBase` decimal(14,4) > 0, `unidadBaseId`, `fechaHora` (servidor), `usuarioId`, `claveIdempotencia` (única), `referenciaTipo`, `referenciaId`, `nota`. **Inmutable** |
| `existencias` | `productoId` (único), `cantidadBase` decimal(14,4) ≥ 0, `actualizadoEn`. Solo la modifica `registrarMovimiento` |

Cambios respecto al modelo planificado: se agregaron `presentacionOriginalId` y `redondeado`; se **quitó `anulado_por_id`** porque exige modificar el movimiento original (contradice la inmutabilidad). La V12 resuelve las anulaciones con un movimiento nuevo que referencia al original. Almacenamiento demo: clave `inventario.demo.inventario` (movimientos y existencias juntos, en una sola escritura).

## Funciones y componentes clave
- **`datos.inventario.registrarMovimiento(entrada)`** — la única forma de cambiar existencias. Contrato en `docs/CONTRATO_DATOS.md` (2.6). **La usarán la V5 (compras), la V6 (salidas y consumos), la V11 y la V12 (conteos y ajustes) y la V14 y la V15 (recetas).**
- `datos.inventario.listarExistencias`, `obtenerExistencia`, `verificarConsistencia` y `alCambiarInventario(callback)`.
- `validarEntradaMovimiento`, `entradaCoincideConMovimiento`, `errorExistenciaInsuficiente`, `aplicarMovimiento` y `calcularConsistencia` (`nucleo/datos/inventario.js`): puras y reutilizables por cualquier adaptador.
- `generarClaveIdempotencia()`: una clave por intento de operación del usuario; se reutiliza al reintentar y se cambia cuando la operación es nueva.
- Pantalla `/inventario`: producto, existencia con su unidad base, «Sin existencia», «Inactivo», última actualización, buscador, filtro Activos / Inactivos / Todos, paginación de 20, botón «Actualizar ahora» y aviso de productos sin unidad base.

## Reglas aplicadas
- **Una salida mayor a la existencia se rechaza** en la capa de datos (no solo en la pantalla): informa lo disponible, no cambia nada, no crea movimiento y **nunca** se convierte en ajuste, compra ni ingreso. La existencia nunca queda negativa (tampoco con un ajuste que resta).
- Un movimiento actualiza la existencia **exactamente una vez** y todo ocurre en una sola transacción: si algo falla no queda nada guardado.
- **Idempotencia:** la misma clave devuelve el movimiento original, aunque ahora ya no alcanzara la existencia.
- **Concurrencia:** los registros se ejecutan uno tras otro y cada uno lee, valida y escribe sin pausas; dos salidas de 3 con existencia 5 aceptan solo una.
- **Inmutabilidad:** no existen operaciones para editar ni borrar movimientos ni para fijar una existencia a mano.
- La fecha, la hora y el usuario los fija la capa de datos; si la entrada los trae, se ignoran.
- La cantidad se convierte a la unidad base con `convertir` (V3) y el movimiento guarda lo **usado**: cantidad y unidad originales, presentación, factor y conversión. Cambiar después una equivalencia o una presentación no reescribe lo registrado.
- Solo se mueven productos existentes, **activos y completos** (con unidad base).
- Con movimientos registrados, **la unidad base del producto ya no se puede cambiar** (pendiente que dejó la V3).
- Validaciones en la capa de datos; los formularios solo muestran sus mensajes (todos a la vez, junto a cada campo).
- No hay formularios de compra, salida ni consumo, y no se calculan costos.

## Pruebas
`npm test` → **186 pruebas, todas pasan** (9 archivos) y `vite build` compila.
- `adaptadorDemo.test.js` (107): contrato de autenticación, productos, unidades, presentaciones, conversiones y **28 pruebas nuevas de inventario**.
- `inventario.test.jsx` (14): pantalla de existencias, actualización en tiempo real, buscador, filtros, inactivos con existencia, aviso de productos sin unidad base, paginación, panel de demostración (ingreso, salida y rechazo) y bloqueo del cambio de unidad base en el formulario.
- Resto (V1 a V3, sin cambios): `productos.test.jsx` (13), `aplicacion.test.jsx` (7), `utilidades.test.js` (12), `unidades.test.jsx` (9), `presentaciones.test.jsx` (10), `conversiones.test.jsx` (11), `productosIncompletos.test.jsx` (3).
- **Casos de aceptación del plan cubiertos:** ingreso de 10 y salida de 6 dejan 4; con existencia 4, una salida de 5 se rechaza, la existencia sigue en 4 y no se crea movimiento; la misma clave dos veces crea un solo movimiento; dos salidas simultáneas de 3 con existencia 5 aceptan solo una (también con dos conexiones distintas y con 12 salidas simultáneas); un fallo simulado a mitad de la operación no deja movimiento ni cambio de existencia; `verificarConsistencia` devuelve consistente tras las pruebas.
- Se comprobó rompiendo a propósito el código (quitar la verificación de existencia, la idempotencia, la escritura única o la serialización) que las pruebas correspondientes **fallan**.
- **No probado:** nada contra una base real (atomicidad y concurrencia reales incluidas); no se revisó la interfaz en un navegador real ni en tablet. Las pruebas de la V3 muestran avisos de `act(...)` ocasionales que ya existían.

## Permisos requeridos (para la V18)
`inventario.ver`. El permiso para registrar movimientos lo definirá cada módulo que los usa (compras, salidas, conteos). **No se aplican todavía**: todo usuario autenticado tiene acceso completo (temporal).

## Decisiones provisionales (PROVISIONAL)
- Subtipos permitidos por tipo: ingreso → `compra`, `inventario_inicial`; salida → `salida_general`, `consumo`; ajuste → `ajuste_conteo`, `anulacion`.
- Un ajuste debe traer `sentido` (1 o -1), porque el contrato original no lo definía. La V12 lo afinará.
- La misma clave con una operación **distinta** se rechaza con `OPERACION_DUPLICADA`, en vez de devolver en silencio otro resultado.
- Un reintento idempotente devuelve el movimiento original y la existencia **actual**.
- Una cantidad que queda en cero al convertir se rechaza; si se redondea, queda marcado en `redondeado`.
- `listarExistencias` muestra solo productos completos y, por defecto, solo activos (el filtro Inactivos y Todos los incluye); un producto sin movimientos tiene existencia 0.
- `alCambiarInventario` en el demo avisa solo dentro de la misma pestaña; el refresco usa una pausa de 100 ms para agrupar avisos seguidos.
- El panel «DATOS DE DEMOSTRACIÓN» solo aparece con el adaptador demo; todo lo que registra lleva la nota «DATOS DE DEMOSTRACIÓN».
- Se agregaron `presentacionOriginalId` y `redondeado` a los movimientos y se quitó `anulado_por_id` del modelo (ver Modelo de datos).

## Pendientes para el hogar
- **Qué hacer con un producto desactivado que todavía tiene existencia.** Hoy se puede desactivar, pero entonces no admite movimientos (no se puede sacar lo que queda) hasta reactivarlo. Hay que decidir si se bloquea desactivar con existencia o si se permite sacarlo.
- Confirmar los subtipos de movimiento y si el hogar necesita alguno más.

## Deuda técnica
1. **Base de datos real (bloqueante):** ADR-001, provisionar, conectar y escribir el adaptador con `inventario` (tarea **BD-8** de `docs/GUIA_CONEXION_BASE_DE_DATOS.md`): función transaccional con bloqueo de fila o actualización condicional, índice único de `clave_idempotencia`, sin `UPDATE`/`DELETE` sobre movimientos y suscripción en tiempo real. Siguen pendientes BD-1 a BD-7.
2. La prueba de atomicidad necesita que cada adaptador sepa simular un fallo a mitad de la operación (`crearConFalloSimulado`); el adaptador real debe aportar su propia forma.
3. No hay pantalla para ver los movimientos (V7); hoy solo se comprueban con `verificarConsistencia` y las pruebas.
4. Permisos no aplicados (V18).
5. El README no se actualizó con la V4 (no se recibió el archivo).
6. La interfaz no se revisó en un navegador real; solo pruebas automáticas.

## Siguiente versión
**V5: Compras e ingresos.** Advertencias: usar `datos.inventario.registrarMovimiento` con `tipo: 'ingreso'` y `subtipo: 'compra'`, nunca tocar existencias directamente; **una compra con varias líneas debe ser todo o nada, y hoy `registrarMovimiento` registra un movimiento a la vez**: la V5 necesitará una variante por lote (por ejemplo `registrarMovimientos([...])`) con una clave por línea derivada de la clave de la compra; usar `SelectorDeProducto` (solo productos completos); `referenciaTipo: 'compra'` y `referenciaId` enlazan cada movimiento con su compra. Antes de empezar, conectar la base real es ya necesario: la atomicidad de una compra completa no se puede probar de verdad en el demo.
