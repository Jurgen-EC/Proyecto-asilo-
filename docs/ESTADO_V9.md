# ESTADO DE VERSIÓN 9

> **Resumen honesto:** la V9 está **construida y probada en modo demostración**, pero **NO cumple la definición de terminado del plan** (punto 1: «conectados a la base de datos real»), porque la base de datos sigue sin definirse (ADR-001 pendiente). Los reportes leen lo que hay en `sessionStorage` y **se pierde al cerrar la pestaña**. La V9 **no crea tablas ni cambia datos**: es solo lectura. Tampoco se probó la **impresión real** (papel o «Guardar como PDF»): jsdom no imprime, así que solo se verificó que las reglas de la hoja de estilos de impresión existan y que los elementos estén marcados.

## Versión completada
- Versión 9: Reportes mensuales I (inventario y compras), noviembre de 2026. Estado: **parcial (demo)**.
- Se construyó sobre la V8 tal como la dejó el equipo (`docs/ESTADO_V8.md`): 456 pruebas pasando al empezar.

## Stack vigente
- **Base de datos / alojamiento:** NO definidos. Adaptador de demostración (`sessionStorage`) con banner «MODO DEMOSTRACIÓN».
- **Bibliotecas:** sin cambios (React 18.3, react-router-dom 6, Vite 5, decimal.js 10, Vitest 2 + Testing Library + jsdom). No se agregó ninguna.
- **Comandos:** `npm install` · `npm run dev` · `npm test` · `npm run build`.

## Requerimientos
| Requerimiento | Estado |
| --- | --- |
| RF-031 Reportes mensuales de inventario | Implementado y probado en demo (`/reportes/inventario`, con las dos vistas «Estado al cierre del mes» y «Resumen del mes») |
| RF-032 Reportes mensuales de compras | Implementado y probado en demo (`/reportes/compras`) |
| RNF-086 Información clara de cantidades y costos | Parcial: cantidades siempre con su unidad y su signo; los costos de las compras salen tal como se registraron (sin promediar); los costos totales llegan en la V10 |
- **No incluidos (son de la V10):** reportes de gastos, de consumo y de costos totales (RF-033, RF-034, RF-035 y RF-036).
- **Bloqueado:** la verificación contra base real (todas las pruebas de aceptación «conectado a la base real»).

## Archivos
**Nuevos**
- `src/nucleo/datos/reportes.js` (reglas puras) y `src/nucleo/datos/pruebasContratoReportes.js` (pruebas de contrato reutilizables)
- `src/compartido/utilidades/periodo.js` y `src/compartido/componentes/SelectorDePeriodo.jsx` (reutilizables por todos los reportes)
- `src/modulos/reportes/`: `ModuloReportes.jsx`, `NavegacionReportes.jsx`, `PaginaReporteInventario.jsx`, `PaginaReporteCompras.jsx`, `EncabezadoDeImpresion.jsx`, `BotonImprimir.jsx`, `formatoReportes.js`
- `src/pruebas/`: `reportes.test.js`, `reportesRendimiento.test.js`, `reportesInventario.test.jsx`, `reportesCompras.test.jsx`, `selectorDePeriodo.test.jsx`, `periodo.test.js`, `impresion.test.js`
- `docs/ESTADO_V9.md`

**Modificados**
- `src/nucleo/datos/contrato.js` y `adaptadorDemo.js` (sección `reportes`)
- `src/nucleo/modulos.js` (Reportes mensuales pasa a `disponible`), `src/App.jsx` (ruta `reportes/*`), `src/estilos.css` (selector de período, tablas con subtotales y **hoja de estilos de impresión**)
- `src/pruebas/adaptadorDemo.test.js`
- `docs/CONTRATO_DATOS.md`, `MODELO_DE_DATOS_PLANIFICADO.md`, `GUIA_CONEXION_BASE_DE_DATOS.md`, `README.md`; `package.json` (versión 0.9.0)

## Modelo de datos
**No se crea ninguna tabla ni campo.** La V9 lee lo que dejaron la V4 a la V6. Para una base real, ver las recomendaciones de índices y de consultas en `docs/MODELO_DE_DATOS_PLANIFICADO.md` (sección «Versión 9») y la tarea **BD-13** de la guía de conexión.

## Funciones y componentes clave
- `datos.reportes` (contrato 2.11 de `docs/CONTRATO_DATOS.md`), **solo lectura**, todas exigen sesión y reciben `{ mes: 'AAAA-MM' }`:
  - `inventarioAlCierre` → existencia de cada producto al último día del mes.
  - `resumenMovimientos` → saldo inicial, ingresos, salidas (con consumos aparte), ajustes y saldo final por producto.
  - `comprasMensuales` → compras del mes agrupadas por producto, con subtotales y total general.
- Reglas puras en `src/nucleo/datos/reportes.js`: `validarMes`, `inventarioAlCierre`, `resumenDelMes`, `comprasDelMes`. Un adaptador real puede reutilizarlas o replicarlas como consultas.
- `SelectorDePeriodo` (mes y año, con atajos «Este mes» y «Mes anterior») y `periodo.js` (`mesDeHoy`, `desplazarMes`, `nombreDelMes`, `rangoDeMes`): **los reutilizan los reportes de la V10**.
- `EncabezadoDeImpresion` (institución, reporte, período y fecha de generación; solo se ve al imprimir) y `BotonImprimir`.
- Pantallas: `/reportes` (lleva al de inventario), `/reportes/inventario` (`?mes=AAAA-MM&vista=cierre|resumen`) y `/reportes/compras` (`?mes=AAAA-MM`).

## Reglas aplicadas
- **Solo lectura y solo operaciones confirmadas:** los reportes salen de los movimientos y las compras guardados; consultarlos no modifica nada (probado con `verificarConsistencia`). Una salida rechazada por falta de existencia no aparece.
- **Mes validado en la capa de datos:** `AAAA-MM`, año entre 2000 y 2100; si falta o no es válido, `VALIDACION` con el mensaje en `campos.mes` y la pantalla lo muestra junto al selector.
- **Hora de Costa Rica:** los límites del mes se cuentan por el día en `America/Costa_Rica` (un movimiento a las 23:30 del último día del mes cuenta en ese mes; a las 00:30 del siguiente, no).
- **Estado al cierre:** la existencia de cada producto es la suma de `sentido × cantidad base` de todos sus movimientos hasta el último día del mes, en su unidad base. Aparecen los productos con algún movimiento hasta esa fecha (la existencia puede ser 0). Un producto desactivado se sigue viendo, marcado «Inactivo».
- **Resumen del mes:** **saldo inicial + ingresos − salidas + ajustes = saldo final**, para cada producto y cada mes (probado). El saldo inicial es la existencia al cierre del mes anterior y el saldo final coincide con el estado al cierre y, en el último mes, con la existencia actual. Las salidas incluyen los consumos, con su subtotal aparte. **Los ajustes no cuentan como ingresos ni como salidas.** Un producto aparece si tuvo movimientos en el mes o si empezó con saldo distinto de cero (así su saldo no desaparece).
- **Reporte de compras:** el mes se cuenta por la **fecha de la compra** (`fechaCompra`, la que eligió el usuario), no por el día en que se registró. Agrupa por producto, con las líneas de la más antigua a la más reciente, la cantidad tal como se registró (y, si fue por presentación, su equivalente en la unidad base), el costo unitario y el total de cada línea, el subtotal de cada producto y el total general (suma de los subtotales, con decimales exactos). **Los costos son los registrados en cada línea: no se promedian.** No incluye gastos ni costos de consumo.
- **Cada total se puede verificar:** en inventario, los ingresos, las salidas, los consumos y los ajustes abren el historial de movimientos del mismo producto y período, y los movimientos de cada existencia abren el historial hasta el cierre; en compras, el subtotal de un producto y el total general abren la lista de compras con el mismo período. Un total en cero no es enlace.
- **Vista imprimible:** botón «Imprimir» (abre el diálogo del navegador, donde también se puede guardar como PDF) y hoja de estilos `@media print` que oculta menú, encabezado, aviso de demostración, pestañas, selector y botones; muestra un encabezado con la institución, el reporte, el período y la fecha y hora de generación; no corta las filas de las tablas, repite el encabezado de la tabla en cada página e imprime siempre en claro. **No se exporta a PDF ni a Excel** (no aprobado).
- Estados de carga, vacío («No hay compras en marzo de 2026», «No hay existencias que reportar», «No hay movimientos en…»), error con «Reintentar». «Imprimir» queda deshabilitado si no hay datos.

## Pruebas
`npm test` → **542 pruebas, todas pasan** (28 archivos; la V8 tenía 456) y `vite build` compila. Se verificó que las pruebas pasan **en cada rama**.
- `adaptadorDemo.test.js` (257): incluye las **21 pruebas de contrato de los reportes** (mes inválido, límites del mes en hora de Costa Rica con reloj simulado, ecuación de saldos, saldo inicial contra cierre anterior, compras por fecha de compra, subtotales y total, presentación, solo lectura).
- `reportes.test.js` (8): reglas puras, incluidos 10.000 movimientos en menos de 2 segundos. `reportesRendimiento.test.js` (1): adaptador con 8.000 movimientos y 400 compras (el almacén del navegador de prueba admite unos 5 MB), cada reporte en menos de 2 segundos.
- `reportesInventario.test.jsx` (24), `reportesCompras.test.jsx` (15), `selectorDePeriodo.test.jsx` (7), `periodo.test.js` (5), `impresion.test.js` (5): pantallas, selector, utilidades y hoja de estilos de impresión.
- Resto sin cambios (V1 a V8).
- **Se comprobó que las pruebas detectan errores** rompiendo a propósito el código en 7 puntos y confirmando que fallan: sumar los ajustes al revés en el saldo final, contar el día en UTC en lugar de hora de Costa Rica, contar las compras por el día de registro, contar los ajustes como ingresos, no sumar los subtotales en el total general, hacer desaparecer del resumen a un producto con saldo y sin movimientos, y permitir que la impresión corte las filas.
- **No probado:** nada contra una base real; no se revisó la interfaz en un navegador real ni en tablet; no se imprimió de verdad (papel o PDF).

## Permisos requeridos (para la V18)
`reportes.inventario` y `reportes.compras` (más los que defina la matriz de roles). **No se aplican todavía**: todo usuario autenticado tiene acceso completo (temporal).

## Decisiones provisionales (PROVISIONAL)
- **Dos vistas de inventario:** el hogar no definió si el reporte de inventario debe ser el estado al cierre o el resumen de movimientos, así que se entregan ambas (por defecto, «Estado al cierre del mes»).
- **«Cierre del mes» = el último día calendario del mes.** No existe un cierre contable: **`periodoCerrado` (V8) sigue siempre en `false`** y no se conectó. Definir qué es cerrar un período queda pendiente con el hogar.
- **Mes por defecto:** el mes de hoy. El selector ofrece 5 años atrás y el próximo.
- **Dos criterios de fecha distintos, a propósito:** el inventario cuenta cada movimiento por el día en que se **registró** (así se calcula la existencia); el reporte de compras cuenta cada compra por su **fecha de compra**. Una compra registrada en abril con fecha del 31 de marzo aparece en las compras de marzo pero su ingreso entra al inventario de abril (probado).
- Un producto con existencia 0 al cierre sigue apareciendo si tuvo movimientos hasta esa fecha.
- Las cantidades del reporte de compras: la cantidad de cada línea tal como se registró; el subtotal de cantidad, en la unidad base del producto.
- Sin exportar a PDF ni Excel; para guardar un PDF se usa «Imprimir» y se elige guardar como PDF.

## Pendientes para el hogar
- Elegir cuál vista de inventario es la oficial (cierre o resumen) y si se conservan las dos.
- Definir qué significa cerrar un mes (y si un mes cerrado debe bloquear cambios).
- Confirmar el diseño de la impresión (logo, firmas, pie de página) y si necesitan exportar a PDF o Excel.

## Deuda técnica
1. **Base de datos real (bloqueante):** ADR-001, provisionar, conectar y escribir `reportes` en el adaptador real (tarea **BD-13** de `docs/GUIA_CONEXION_BASE_DE_DATOS.md`): consultas agrupadas, índices y la hora de Costa Rica.
2. Permisos no aplicados (V18).
3. La impresión real no se probó; solo se verificó la hoja de estilos con pruebas automáticas.
4. El rendimiento (menos de 2 segundos) se midió **solo en el adaptador demo**, con 8.000 movimientos y 400 compras en memoria. En una base real hay que medirlo de nuevo.
5. `periodoCerrado` sigue sin conectarse (ver decisiones provisionales).
6. La interfaz no se revisó en un navegador real ni en tablet; solo pruebas automáticas. Las tablas largas se desplazan en horizontal.
7. `package-lock.json` sigue en 0.5.0 desde la V5; npm lo ajusta solo al volver a instalar.

## Siguiente versión
**V10: Reportes mensuales II (gastos, consumo y costos totales).** Advertencias:
- **Reutilizar** `SelectorDePeriodo`, `periodo.js`, `NavegacionReportes` (agregar los enlaces), `EncabezadoDeImpresion`, `BotonImprimir` y la hoja de estilos de impresión de la V9; no volver a escribirlos.
- **El costo promedio sigue BLOQUEADO** (RF-027, RF-028, RF-029) y RF-035 queda como cifra preliminar rotulada, nunca oficial. Un total mensual debe mostrar sus componentes (compras, gastos y costos de consumo) **por separado** y con su detalle de origen.
- Un consumo **sin costo es un faltante, nunca cero**; no inventar costos. Un gasto relacionado con una compra **no se suma automáticamente** (el doble conteo se resuelve con la fórmula aprobada).
- Las fechas de día (`fechaGasto`, `fechaCompra`) y las de instante (`registradoEn`, `fechaRegistro`) se cuentan en hora de Costa Rica.
- Decidir con el hogar si el reporte de compras de la V9 debe sumar los gastos relacionados; hoy no lo hace.
- Antes de empezar, conectar la base real sigue siendo necesario para probar la atomicidad y el rendimiento de verdad.
