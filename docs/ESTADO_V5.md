# ESTADO DE VERSIÓN 5

> **Resumen honesto:** la V5 está **construida y probada en modo demostración**, pero **NO cumple la definición de terminado del plan** (punto 1: «conectados a la base de datos real»), porque la base de datos sigue sin definirse (ADR-001 pendiente). Las compras, sus líneas, los movimientos y las existencias viven en `sessionStorage` y **se pierden al cerrar la pestaña**. Además, **la atomicidad de una compra completa no se puede probar de verdad en el adaptador demo** (JavaScript en el navegador corre en un solo hilo): solo se comprueba contra la base real. Al conectarla hay que escribir el adaptador (tarea BD-9) y pasar las mismas pruebas de contrato.

## Versión completada
- Versión 5: Compras e ingresos, octubre de 2026. Estado: **parcial (demo)**.
- Se construyó sobre la V4 tal como la dejó el equipo (`docs/ESTADO_V4.md`).

## Stack vigente
- **Base de datos / alojamiento:** NO definidos. Adaptador de demostración (`sessionStorage`) con banner «MODO DEMOSTRACIÓN».
- **Bibliotecas:** sin cambios (React 18.3, react-router-dom 6, Vite 5, decimal.js 10, Vitest 2 + Testing Library + jsdom). No se agregó ninguna.
- **Comandos:** `npm install` · `npm run dev` · `npm test` · `npm run build`.

## Requerimientos
| Requerimiento | Estado |
| --- | --- |
| RF-008 Registrar compras de productos | Implementado y probado en demo (`/compras/nueva`) |
| RF-009 Registrar ingresos de productos al inventario | Implementado y probado en demo: cada línea de la compra genera un ingreso (`tipo: 'ingreso'`, `subtipo: 'compra'`) |
| RF-013 Actualizar existencias automáticamente tras un ingreso | Implementado y probado en demo: la compra y la existencia se confirman en la misma operación |
| RF-026 Registrar el costo de adquisición | Implementado y probado en demo: costo unitario y total por línea, tal como se registró (sin promediar) |
| RF-044 Registro digital de la información que hoy se lleva en papel | Parcial: la compra se registra y se consulta; falta validar con el hogar cómo anotan hoy una compra en papel |
| RNF-82 Facilitar el registro para reducir trabajo manual | Parcial: una sola captura (sin ingreso aparte), costo que se calcula solo, unidad base por defecto y presentaciones; no se pudo medir con personas reales |
- **Bloqueado:** la verificación contra base real (todas las pruebas de aceptación «conectado a la base real»), en especial la atomicidad.

## Archivos
**Nuevos**
- `src/nucleo/datos/compras.js` — reglas puras: validación de la compra y de cada línea, cálculo de costos, fecha no futura, idempotencia (`compraCoincide`, `claveDeLinea`), errores por línea y filtros del listado
- `src/modulos/compras/ModuloCompras.jsx`, `PaginaListaCompras.jsx`, `PaginaDetalleCompra.jsx`, `PaginaNuevaCompra.jsx`, `LineaDeCompra.jsx`
- `src/pruebas/comprasLista.test.jsx`, `comprasFormulario.test.jsx`
- `docs/ESTADO_V5.md`

**Modificados**
- `src/nucleo/datos/contrato.js` (sección `compras` requerida), `adaptadorDemo.js` (sección `compras` y **núcleo transaccional compartido** `procesarMovimiento`, que ahora usan `registrarMovimiento` y `registrarCompra`), `pruebasDeContrato.js` (31 pruebas nuevas de compras)
- `src/compartido/utilidades/formato.js` (`hoyEnCostaRica`, `formatearFechaDia`), `src/compartido/componentes/SelectorDeProducto.jsx` (`incluirInactivos`, para filtrar historial)
- `src/nucleo/modulos.js` (Compras: disponible), `src/App.jsx` (ruta `compras/*`), `src/estilos.css`
- `src/pruebas/adaptadorDemo.test.js` (prueba de fallo exacto en la segunda línea)
- `docs/CONTRATO_DATOS.md` (sección 2.7), `docs/MODELO_DE_DATOS_PLANIFICADO.md`, `docs/GUIA_CONEXION_BASE_DE_DATOS.md` (tarea BD-9), `README.md` (ya incluye V4 y V5), `package.json` y `package-lock.json` (versión 0.5.0)

## Modelo de datos
Sin migraciones (no hay base real). Estructura que debe crear la base real (campos en camelCase en el código; la base puede usar snake_case):

| Entidad | Campos |
| --- | --- |
| `compras` | `id`, `fechaCompra` (fecha de calendario elegida por el usuario, no futura), `registradaEn` (servidor), `usuarioId`, `nota` (opcional), `total` decimal(14,2), `claveIdempotencia` (única). **Inmutable** (sin `UPDATE`/`DELETE`) |
| `compra_lineas` | `id`, `compraId`, `productoId`, `presentacionId` (nulo), `cantidad` decimal(14,4) > 0 (con presentación, número de presentaciones), `unidadId`, `costoUnitario` decimal(14,2) > 0, `costoTotal` decimal(14,2) > 0, `movimientoId` (único; cada línea genera exactamente un movimiento) |

Cambios respecto al modelo planificado: se agregó `claveIdempotencia` (única) a `compras`; los movimientos de las líneas llevan la clave `<claveDeLaCompra>:<n>` y `referenciaTipo: 'compra'`, `referenciaId: <id de la compra>`. Almacenamiento demo: **la misma clave** `inventario.demo.inventario` que los movimientos y las existencias (`compras` y `compraLineas` junto a ellos), para confirmar todo con una sola escritura.

## Funciones y componentes clave
- **`datos.compras.registrarCompra({fechaCompra, nota, lineas, claveIdempotencia})`** — compra e ingreso en una sola transacción. Contrato en `docs/CONTRATO_DATOS.md` (2.7). Devuelve `{ compra (con lineas), repetido }`.
- `datos.compras.listarCompras({desde, hasta, productoId, pagina, tamanoPagina})` y `obtenerCompra(id)` (líneas con producto, unidad, presentación y el ingreso generado: cantidad base, factor y conversión usados).
- **`procesarMovimiento`** (interna del adaptador demo): el núcleo de la V4, extraído para que `registrarMovimiento` y `registrarCompra` compartan **exactamente** las mismas reglas (producto activo y completo, conversión con `convertir`, existencia, movimiento inmutable). **La V6, la V11 y la V12 deben reutilizarlo del mismo modo para operaciones de varias líneas**; en la base real será la misma función transaccional.
- `validarCompra`, `calcularCostosDeLinea`, `totalDeLineas`, `compraCoincide`, `errorDeLinea`, `claveDeLinea` (`nucleo/datos/compras.js`): puras y reutilizables por cualquier adaptador.
- Pantallas: `/compras` (lista, filtros por fecha y producto en la dirección, paginación de 20), `/compras/nueva` (formulario con varias líneas, total calculado en pantalla, resumen de errores y diálogo de confirmación), `/compras/:id` (detalle con los ingresos generados). `LineaDeCompra` es el componente de una línea.

## Reglas aplicadas
- **Compra e ingreso son una sola operación atómica:** si cualquier línea falla (producto inactivo, unidad sin equivalencia, cantidad inválida…), **no se guarda nada**: ni la compra, ni las líneas anteriores, ni los ingresos, ni las existencias.
- **Idempotencia:** el formulario genera una clave al abrirse y la reutiliza en reintentos; reenviar la misma compra devuelve la original sin duplicar, y la misma clave con una compra distinta se rechaza (`OPERACION_DUPLICADA`). Doble clic no duplica (el botón se deshabilita mientras se envía).
- La **fecha de la compra** la elige el usuario y **no puede ser futura** (se compara con el día de hoy en Costa Rica); la fecha de registro, el usuario, el id y el total los fija la capa de datos aunque la entrada los traiga.
- Por línea: producto existente, **activo y completo**; cantidad mayor que cero; unidad o presentación (una de las dos) convertible a la unidad base; con presentación, la cantidad es el número de presentaciones (3 cajas de 12 unidades = 36 unidades).
- **Costos:** se escribe el costo unitario **o** el total (uno solo) y el sistema calcula y guarda el otro; mayores que cero, hasta 2 decimales. El costo queda **como se registró**: no se promedia.
- Todos los errores de la compra (fecha, líneas, campos) se informan **a la vez**, cada uno junto a su campo; los de una línea indican cuál es («Línea 2: …»).
- Una compra confirmada **no se edita ni se borra** (no existen las operaciones); el detalle lo explica. Lo registrado conserva lo usado: editar luego una presentación o una equivalencia no reescribe el ingreso.
- No se agregaron proveedor, factura ni impuestos (no están confirmados por el hogar).
- Validaciones en la capa de datos; el formulario solo las repite antes de pedir confirmación usando las mismas funciones puras.

## Pruebas
`npm test` → **244 pruebas, todas pasan** (11 archivos) y `vite build` compila.
- `adaptadorDemo.test.js` (138): contrato completo; **31 pruebas nuevas de compras** (+ una de fallo exacto en la segunda línea).
- `comprasLista.test.jsx` (12) y `comprasFormulario.test.jsx` (15): pantallas, filtros, paginación, detalle, formulario, confirmación, errores por campo y por línea, doble clic y reintento con la misma clave.
- Resto (V1 a V4, sin cambios de comportamiento): `inventario.test.jsx` (14), `productos.test.jsx` (13), `conversiones.test.jsx` (11), `presentaciones.test.jsx` (10), `unidades.test.jsx` (9), `productosIncompletos.test.jsx` (3), `aplicacion.test.jsx` (7), `utilidades.test.js` (12).
- **Casos de aceptación del plan cubiertos:** compra de dos líneas crea 2 ingresos y suma ambas existencias; si falla la segunda línea no se guarda nada (por dato inválido y por fallo simulado a mitad de camino, incluida la prueba de atomicidad `crearConFalloSimulado`); reenviar el mismo formulario no duplica; una unidad sin conversión configurada se rechaza con mensaje claro en esa línea; costo total con decimales (3,5 unidades a 1.250,75) calculado sin errores de punto flotante (**ver decisión de redondeo abajo**).
- **No probado:** nada contra una base real (atomicidad y concurrencia reales incluidas); no se revisó la interfaz en un navegador real ni en tablet ni con personas del hogar. Las pruebas de pantalla pueden mostrar avisos de `act(...)` ocasionales, además de los de React Router.

## Permisos requeridos (para la V18)
`compras.ver` y `compras.registrar`. **No se aplican todavía**: todo usuario autenticado tiene acceso completo (temporal).

## Decisiones provisionales (PROVISIONAL)
- **Redondeo de importes: half-up a 2 decimales.** El plan pide que 3,5 unidades a 1.250,75 se calcule y guarde «exacto», pero el modelo del plan guarda importes con 2 decimales y el resultado exacto es 4.377,625. Se guarda **4.377,63**. Hay que decidir con el hogar: redondear a 2 decimales (como está), o guardar más decimales en el costo total.
- **Costos mayores que cero** (el plan pide confirmar con el hogar si se aceptan costos en cero).
- Con el costo total escrito, ese total se conserva tal cual y el costo unitario se redondea a 2 decimales (por eso unitario × cantidad puede diferir unos céntimos del total).
- Con presentación, el costo unitario es el de **una presentación** (no de la unidad base).
- Máximo 200 líneas por compra; nota de hasta 500 caracteres; clave de compra de hasta 80 caracteres (las de las líneas se derivan).
- La misma clave con una compra distinta se rechaza con `OPERACION_DUPLICADA` (igual que en los movimientos).
- Un mismo producto puede aparecer en varias líneas de la misma compra (por ejemplo, en distintas presentaciones); sus ingresos se suman.
- La lista usa el mismo tamaño de página que el catálogo (20) y ordena por fecha de compra y luego por hora de registro, la más reciente primero.
- El panel «DATOS DE DEMOSTRACIÓN» de `/inventario` se dejó como está; con la V5 ya no es la única forma de ver existencias.

## Pendientes para el hogar
- **Cómo anotan hoy una compra en papel** (¿varias líneas por compra? ¿por proveedor? ¿por factura?). La estructura con varias líneas es una propuesta técnica.
- **Si se aceptan costos en cero** (donaciones, regalos) y cómo se quieren registrar.
- **Si se registra proveedor o factura** (no se incluyó hasta confirmar).
- La regla de redondeo definitiva (ver arriba) y si el costo se maneja en colones enteros o con céntimos.
- Qué hacer con un producto desactivado que todavía tiene existencia (pendiente desde la V4).

## Deuda técnica
1. **Base de datos real (bloqueante):** ADR-001, provisionar, conectar y escribir el adaptador con `compras` (tarea **BD-9** de `docs/GUIA_CONEXION_BASE_DE_DATOS.md`): una función transaccional que guarde compra, líneas, movimientos y existencias, con `clave_idempotencia` única en `compras`, sin `UPDATE`/`DELETE` sobre compras y líneas. Siguen pendientes BD-1 a BD-8.
2. El adaptador real debe saber simular un fallo a mitad de la compra (`crearConFalloSimulado`) para pasar la prueba de atomicidad.
3. Permisos no aplicados (V18).
4. La corrección de una compra equivocada depende de la V12 (anulaciones y ajustes); hasta entonces solo se puede compensar con un movimiento aparte.
5. La interfaz no se revisó en un navegador real; solo pruebas automáticas.
6. Avisos de `act(...)` ocasionales en las pruebas de pantalla.

## Siguiente versión
**V6: Salidas y consumos.** Advertencias: usar `datos.inventario.registrarMovimiento` con `tipo: 'salida'` (subtipos `salida_general` y `consumo`), nunca tocar existencias directamente; **una salida con varias líneas debe ser todo o nada**: reutilizar `procesarMovimiento` como hace `registrarCompra` (con una clave por línea derivada de la clave de la operación); una salida mayor a la existencia se rechaza y **nunca** se convierte en otra cosa; el costo del consumo es manual por ahora (`costo_origen: manual`); usar `SelectorDeProducto` (solo productos completos y activos); reutilizar `LineaDeCompra` o su estructura (producto, unidad o presentación, cantidad) y el patrón de clave de idempotencia por formulario y resumen de errores. Antes de empezar, conectar la base real sigue siendo necesario: la atomicidad de operaciones de varias líneas no se puede probar de verdad en el demo.
