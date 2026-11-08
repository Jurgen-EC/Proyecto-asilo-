# ESTADO DE VERSIÓN 7

> **Resumen honesto:** la V7 está **construida y probada en modo demostración**, pero **NO cumple la definición de terminado del plan** (punto 1: «conectados a la base de datos real»), porque la base de datos sigue sin definirse (ADR-001 pendiente). El historial y el consolidado leen lo que hay en `sessionStorage` y **se pierde al cerrar la pestaña**. La V7 **no crea tablas ni cambia datos**: es solo lectura. Tampoco se pueden comprobar en el adaptador demo ni los índices ni el rendimiento real de una base: los 10.000 movimientos de la prueba corren en memoria del navegador, no contra una base.

## Versión completada
- Versión 7: Historial, clasificación y consolidado de movimientos, noviembre de 2026. Estado: **parcial (demo)**.
- Se construyó sobre la V6 tal como la dejó el equipo (`docs/ESTADO_V6.md`): 306 pruebas pasando al empezar.

## Stack vigente
- **Base de datos / alojamiento:** NO definidos. Adaptador de demostración (`sessionStorage`) con banner «MODO DEMOSTRACIÓN».
- **Bibliotecas:** sin cambios (React 18.3, react-router-dom 6, Vite 5, decimal.js 10, Vitest 2 + Testing Library + jsdom). No se agregó ninguna.
- **Comandos:** `npm install` · `npm run dev` · `npm test` · `npm run build`.

## Requerimientos
| Requerimiento | Estado |
| --- | --- |
| RF-019 Consultar el historial completo de movimientos | Implementado y probado en demo (`/movimientos`, pestaña «Todos») |
| RF-020 Clasificar movimientos como Ingresos | Implementado y probado en demo (`/movimientos/ingresos`) |
| RF-021 Clasificar movimientos como Salidas | Implementado y probado en demo (`/movimientos/salidas`: salidas generales y consumos, cada uno con su clase) |
| RF-022 Generar el consolidado de movimientos | Implementado y probado en demo (`/movimientos/consolidado`) |
| RF-023 Diferenciar entradas y salidas en el consolidado | Implementado y probado: columnas separadas; los ajustes van aparte |
| RF-024 Consultar movimientos por período | Implementado y probado: desde/hasta inclusivos en hora de Costa Rica, con atajos «Este mes» y «Mes anterior» |
| RF-025 Consultar los movimientos de un producto | Implementado y probado: filtro por producto, y acceso desde Inventario y desde el detalle del producto |
| RF-039 Trazabilidad de las modificaciones | Parcial: cada movimiento se ve con su origen, su usuario y la existencia antes y después; los ajustes y las anulaciones llegan en la V12 |
| RNF-079 Trazabilidad completa | Parcial (igual que RF-039) |
| RNF-080 Historial consultable | Implementado y probado en demo |
| RNF-085 Consulta ágil de movimientos históricos | Implementado: filtros, paginación de 20 y detalle; con 10.000 movimientos listar, consolidar y abrir un detalle tardan menos de 2 segundos **en el adaptador demo** |
| RNF-086 Información clara de cantidades y costos | Parcial: cantidades siempre con su unidad y su signo; los costos llegan en las V8 y V10 |
- **Bloqueado:** la verificación contra base real (todas las pruebas de aceptación «conectado a la base real»).

## Archivos
**Nuevos**
- `src/nucleo/datos/movimientos.js` (reglas puras del historial y del consolidado) y `src/nucleo/datos/pruebasContratoMovimientos.js` (pruebas de contrato reutilizables)
- `src/modulos/movimientos/`: `ModuloMovimientos.jsx`, `PaginaMovimientos.jsx`, `PaginaDetalleMovimiento.jsx`, `PaginaConsolidado.jsx`, `NavegacionMovimientos.jsx`, `OrigenDeMovimiento.jsx`, `textos.js`, `periodos.js`
- `src/pruebas/`: `movimientos.test.js`, `movimientosRendimiento.test.js`, `movimientos.test.jsx`, `consolidado.test.jsx`, `periodos.test.js`
- `docs/ESTADO_V7.md`

**Modificados**
- `src/nucleo/datos/contrato.js` (sección `movimientos`) y `adaptadorDemo.js` (sección `movimientos`)
- `src/nucleo/modulos.js` (Movimientos pasa a `disponible`), `src/App.jsx` (ruta `movimientos/*`), `src/estilos.css`
- `src/modulos/inventario/PaginaInventario.jsx` («Ver movimientos» en cada fila) y `src/modulos/productos/PaginaDetalleProducto.jsx` («Ver movimientos del producto»)
- `src/pruebas/adaptadorDemo.test.js`
- `docs/CONTRATO_DATOS.md`, `MODELO_DE_DATOS_PLANIFICADO.md`, `GUIA_CONEXION_BASE_DE_DATOS.md`, `README.md`; `package.json` (versión 0.7.0)

## Modelo de datos
**No se crea ninguna tabla ni campo.** La V7 lee lo que dejaron la V4, la V5 y la V6. Para una base real, ver las recomendaciones de índices y de la existencia anterior/resultante en `docs/MODELO_DE_DATOS_PLANIFICADO.md` (sección «Versión 7») y la tarea **BD-11** de la guía de conexión.

## Funciones y componentes clave
- `datos.movimientos` (contrato 2.9 de `docs/CONTRATO_DATOS.md`), **solo lectura**, todas exigen sesión:
  - `listarMovimientos({ tipo, subtipo, desde, hasta, productoId, orden, pagina, tamanoPagina })` → página de `MovimientoVista`.
  - `obtenerMovimiento(id)` → `MovimientoDetalle`: la vista más `factorAplicado`, `conversionId`, `redondeado`, `existenciaAnterior`, `existenciaResultante` y `origen` (compra con fecha y nota, salida con motivo y nota, consumo con nota, o nulo).
  - `consolidarMovimientos({ desde, hasta, productoId })` → `{ desde, hasta, filas, totalMovimientos }`.
- Reglas puras en `src/nucleo/datos/movimientos.js`: `normalizarConsultaMovimientos`, `filtrarMovimientos`, `consolidarMovimientos`, `existenciaAlMovimiento`, `diaEnCostaRica`, `tipoDeSubtipo`. Un adaptador real puede reutilizarlas o replicarlas como consultas.
- Pantallas: `/movimientos` (historial completo), `/movimientos/ingresos`, `/movimientos/salidas`, `/movimientos/consolidado` y `/movimientos/:id` (detalle). Los filtros viven en la dirección (`?desde=&hasta=&producto=&tipo=&clase=&orden=&pagina=`).
- `rangoDelMes(desplazamiento)` (`periodos.js`): primer y último día del mes de hoy o del anterior.

## Reglas aplicadas
- **Solo lectura:** consultar el historial, el detalle o el consolidado no modifica movimientos ni existencias (probado con `verificarConsistencia`). Los movimientos siguen siendo inmutables y no se ofrece editar ni eliminar.
- **Clasificación:** `Ingreso`, `Salida` y `Ajuste` se muestran siempre con su nombre; las salidas generales y los consumos cuentan como Salidas pero cada uno conserva su clase («Salida general» y «Consumo»).
- **Consolidado por producto, en la unidad base:** `entradas` = suma de los ingresos; `salidas` = salidas generales + consumos (con sus subtotales); `diferencia` = entradas − salidas; `ajustes` = suma con signo de los ajustes. **Los ajustes no cuentan como entradas ni como salidas.** Solo aparecen productos con movimientos en el período. No hay total entre productos (unidades distintas); sí el total de movimientos.
- **Cada total se puede verificar:** enlaza al historial con el mismo producto y período; la suma de esos movimientos coincide con el total (probado para ingresos, salidas, consumos, salidas generales y ajustes). Un total en cero no es enlace.
- **Hora de Costa Rica:** `desde` y `hasta` son inclusivos y el día se cuenta en hora de Costa Rica (un movimiento a las 23:30 del último día del mes queda en ese mes; a las 00:30 del día siguiente, no).
- **Orden:** más reciente primero; a igual fecha y hora, el registrado después va primero. `orden: 'antiguo'` lo invierte.
- **Validación en la capa de datos** (no solo en la pantalla): tipo, subtipo, fechas inválidas o invertidas se rechazan con `VALIDACION` y mensaje por campo; un subtipo sin tipo deduce el tipo; un subtipo que no corresponde al tipo se rechaza; un producto que no existe lanza `NO_ENCONTRADO`.
- **El producto inactivo conserva su historial** y se puede consultar.
- **La cantidad conserva lo usado al registrar** (unidad o presentación): cambiar después la presentación o una equivalencia no reescribe el movimiento (probado).
- La clave de idempotencia nunca se expone.
- Estados de carga, vacío («Todavía no hay movimientos», «Sin resultados»), error con «Reintentar» y paginación de 20 (hasta 100 por la capa de datos).

## Pruebas
`npm test` → **387 pruebas, todas pasan** (17 archivos; la V6 tenía 306), y `vite build` compila. Se verificó que las pruebas pasan **en cada commit**.
- `adaptadorDemo.test.js` (207): incluye las pruebas de contrato de movimientos (23: historial, filtros, fechas en hora de Costa Rica con reloj simulado, paginación, detalle y origen, consolidado y su verificación contra el historial).
- `movimientos.test.js` (13): reglas puras, incluidos 10.000 movimientos en menos de 2 segundos. `movimientosRendimiento.test.js` (3): adaptador con 10.000 movimientos sembrados (listar, consolidar y detalle, cada uno en menos de 2 segundos).
- `movimientos.test.jsx` (23) y `consolidado.test.jsx` (16): pantallas (navegación, filtros en la dirección, paginación, detalle, consolidado y enlaces para verificar cada total, accesos desde Inventario y desde el producto). `periodos.test.js` (3).
- Resto sin cambios (V1 a V6).
- **No probado:** nada contra una base real; no se revisó la interfaz en un navegador real ni en el celular.

## Permisos requeridos (para la V18)
`movimientos.ver` y `consolidado.ver` (más los que defina la matriz de roles). **No se aplican todavía**: todo usuario autenticado tiene acceso completo (temporal).

## Decisiones provisionales (PROVISIONAL)
- **Pestaña extra «Todos»:** el plan nombra tres pestañas (Ingresos, Salidas y Consolidado), pero RF-019 pide el historial completo, que incluye también los ajustes. Se agregó «Todos» como primera vista.
- **Ajustes:** columna aparte en el consolidado, sin contarse como entradas ni salidas (propuesta del plan, a validar con el hogar). Hoy solo se pueden crear por la capa de datos y el panel de demostración; su pantalla llega en la V12.
- **Período por defecto del consolidado:** todo el historial, con atajos «Este mes» y «Mes anterior». No se fijó un mes porque el hogar no definió el formato.
- **Orden:** más reciente primero (con la opción de invertirlo para leer un producto de principio a fin).
- **Existencia anterior y resultante:** se **calculan** sumando, en orden de registro, los movimientos del mismo producto; no se guardan en el movimiento.
- **Usuario mostrado:** la capa de datos devuelve `{ id, nombre }`; en el demo solo se conoce el nombre del usuario de demostración. En una base real el nombre sale de la tabla de usuarios.
- **Nombre de la operación:** la V6 la anticipaba como `movimientos.listar`; se llamó `movimientos.listarMovimientos`, igual que `listarCompras` y `listarSalidas`.
- Tamaño de página 20, con máximo 100.
- Sin exportar a PDF ni Excel (no aprobado). La vista imprimible llega con los reportes (V9).

## Pendientes para el hogar
- Validar con el personal encargado el formato final del consolidado (columnas, período habitual y si debe haber totales por categoría).
- Confirmar si los ajustes deben seguir aparte o mostrarse como entradas y salidas.
- Confirmar si necesitan exportar el historial o el consolidado.

## Deuda técnica
1. **Base de datos real (bloqueante):** ADR-001, provisionar, conectar y escribir `movimientos` en el adaptador real (tarea **BD-11** de `docs/GUIA_CONEXION_BASE_DE_DATOS.md`): índices, consulta del consolidado y la existencia anterior/resultante.
2. Permisos no aplicados (V18).
3. No hay pantalla de detalle propia de una salida o un consumo: el detalle del **movimiento** muestra su motivo o su nota, y la compra sí enlaza a su detalle.
4. El rendimiento (menos de 2 segundos con 10.000 movimientos) se midió **solo en el adaptador demo**. En una base real hay que medirlo de nuevo.
5. El panel «DATOS DE DEMOSTRACIÓN» de `/inventario` (V4) registra movimientos directos: en el historial aparecen sin origen («Registrado directamente en el inventario»).
6. `package-lock.json` sigue en 0.5.0 desde la V5; npm lo ajusta solo al volver a instalar.
7. La interfaz no se revisó en un navegador real ni en el celular; solo pruebas automáticas. Las tablas largas se desplazan en horizontal.

## Siguiente versión
**V8: Gastos y costos de adquisición (sin fórmula de promedio).** Advertencias:
- Las líneas de compra ya guardan `costoUnitario` y `costoTotal`; el costo del consumo (`costo_importe`, `costo_origen`) **no existe todavía** y se agrega en la V8 sin derivarlo de ningún promedio.
- El **costo promedio sigue BLOQUEADO** (RF-027, RF-028, RF-029): no implementar ninguna fórmula ni mostrar un promedio como oficial.
- El historial y el consolidado de la V7 **no muestran costos**; si se agregan, deben ser información real registrada y no un promedio.
- Antes de empezar, conectar la base real sigue siendo necesario para probar la atomicidad y el rendimiento de verdad.
