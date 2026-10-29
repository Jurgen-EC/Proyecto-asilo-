# Contrato de la capa de datos

La aplicación habla con los datos **solo** a través de un adaptador (`src/nucleo/datos`).
Hoy hay un adaptador de demostración. Cuando se defina la base de datos se escribe un
adaptador real que cumpla este contrato y las pantallas no cambian.

Cada versión del sistema agrega una sección nueva al adaptador sin modificar las anteriores.
Las firmas son lo que debe respetar cualquier adaptador; los nombres están en español.

## 1. Convenciones generales
- Todas las operaciones son asíncronas (`Promise`).
- Los errores son instancias de `ErrorDatos` con un código (`src/nucleo/datos/errores.js`):
  `CREDENCIALES_INVALIDAS`, `SIN_SESION`, `VALIDACION`, `NO_ENCONTRADO`, `SIN_PERMISO`,
  `CONEXION`, `OPERACION_DUPLICADA`, `NOMBRE_DUPLICADO` (V2), `CONVERSION_NO_CONFIGURADA` y `UNIDAD_INCOMPATIBLE` (V3), `DESCONOCIDO`. En la V4 una salida mayor a la existencia lanza `VALIDACION` con `campos.cantidad` y la propiedad `disponible` (texto decimal, en la unidad base). El adaptador traduce
  los errores de la base a estos códigos; la interfaz muestra `mensajeUsuario`, nunca el mensaje técnico.
- `ErrorDatos` puede traer `campos` (V2): mensajes por campo del formulario, por ejemplo
  `{ nombre: 'El nombre es obligatorio.' }`. La interfaz los muestra junto al campo.
- Identificadores: texto estable (UUID recomendado). Nunca se reutilizan.
- Cantidades y dinero viajan como **texto decimal** (por ejemplo `"3.5"`) y se calculan con
  `decimales.js`; nunca como números flotantes.
- Fechas y horas se guardan en UTC, las asigna el servidor, y se muestran en `America/Costa_Rica`.
- Nada se elimina físicamente: se desactiva o se anula con un movimiento nuevo.

## 2. Secciones implementadas

### 2.1 Versión 1: `autenticacion`
| Operación | Resultado | Errores |
|---|---|---|
| `iniciarSesion(correo, clave)` | `Usuario {id, correo, nombre}` y deja sesión activa | `CREDENCIALES_INVALIDAS`, `VALIDACION`, `CONEXION` |
| `cerrarSesion()` | nada | `CONEXION` |
| `obtenerSesion()` | `Usuario` o `null` | — |
| `alCambiarSesion(callback)` | función para desuscribirse; el callback recibe `Usuario` o `null` | — |

Cualquier adaptador debe pasar `ejecutarPruebasDeContrato` (`src/nucleo/datos/pruebasDeContrato.js`).

### 2.2 Versión 2: `productos`
Todas las operaciones exigen sesión (`SIN_SESION`). Los nombres de las operaciones siguen el Plan de
versiones (`crearProducto`, etc.), no los nombres cortos que figuraban como previstos.

| Operación | Resultado | Errores |
|---|---|---|
| `crearProducto({nombre, unidadBaseId})` | `Producto` | `VALIDACION` (con `campos.nombre` y/o `campos.unidadBaseId`), `NOMBRE_DUPLICADO` |
| `editarProducto(id, {nombre, unidadBaseId?})` | `Producto` (mismo `id`) | `VALIDACION`, `NOMBRE_DUPLICADO`, `NO_ENCONTRADO` |
| `obtenerProducto(id)` | `Producto` | `NO_ENCONTRADO` |
| `listarProductos({busqueda, estado, pagina, tamanoPagina, soloCompletos})` | `{items, total, pagina, tamanoPagina, totalPaginas}` | — |
| `cambiarEstadoProducto(id, activo)` | `Producto` | `NO_ENCONTRADO`, `VALIDACION` |

- `Producto`: `{id, nombre, nombreNormalizado, activo, unidadBaseId, creadoEn, actualizadoEn, creadoPor}`.
- **Unidad base (V3):** `crearProducto` la exige (unidad existente y activa; el nombre y la unidad se validan juntos y los mensajes vienen a la vez en `campos`).
  `editarProducto` valida y cambia la unidad base **solo si la entrada trae `unidadBaseId`**; si no la trae, la actual no se toca.
  Un producto conserva su unidad base aunque esa unidad se desactive, pero no se le puede elegir una unidad inactiva.
- **Producto INCOMPLETO:** el que no tiene unidad base (los creados en la V2). Sigue consultable y editable, pero no se puede usar en operaciones:
  `listarProductos({soloCompletos: true})` lo deja fuera y `SelectorDeProducto` solo ofrece productos completos.
- `estado` de `listarProductos`: `'activos'` (por defecto), `'inactivos'` o `'todos'`. Orden por nombre. Una página fuera de rango se acota a la última.
- Reglas (en `src/nucleo/datos/productos.js`, reutilizables por cualquier adaptador): nombre de 2 a 120 caracteres sin espacios sobrantes; único por `nombreNormalizado`
  (minúsculas, sin tildes, espacios colapsados; la ñ se conserva, PROVISIONAL); búsqueda sin mayúsculas ni tildes, todas las palabras deben aparecer.
- No existe `eliminarProducto`: los productos nunca se borran, se desactivan. Un nombre usado por un producto inactivo tampoco se puede reutilizar.
- Fechas, `creadoPor` e `id` los asigna la capa de datos, no la interfaz. En la base real: restricción de unicidad sobre `nombre_normalizado`.

### 2.3 Versión 3: `unidades`
Todas las operaciones exigen sesión (`SIN_SESION`).

| Operación | Resultado | Errores |
|---|---|---|
| `crearUnidad({nombre, abreviatura, dimension})` | `Unidad` | `VALIDACION` (con `campos.nombre`, `campos.abreviatura` o `campos.dimension`) |
| `editarUnidad(id, {nombre, abreviatura, dimension})` | `Unidad` (mismo `id`) | `VALIDACION`, `NO_ENCONTRADO` |
| `obtenerUnidad(id)` | `Unidad` | `NO_ENCONTRADO` |
| `listarUnidades({estado})` | `Unidad[]` ordenadas por nombre | — |
| `cambiarEstadoUnidad(id, activo)` | `Unidad` | `NO_ENCONTRADO`, `VALIDACION` |

- `Unidad`: `{id, nombre, abreviatura, dimension, activo, sugerida, nombreNormalizado, abreviaturaNormalizada, creadoEn, actualizadoEn, creadoPor}`.
- `dimension`: `'masa'`, `'volumen'` o `'conteo'`. `estado` de `listarUnidades`: `'activas'` (defecto), `'inactivas'` o `'todas'`.
- Reglas (en `src/nucleo/datos/unidades.js`): nombre de 2 a 40 caracteres, abreviatura de 1 a 10, sin espacios sobrantes; nombre **y** abreviatura únicos por comparación normalizada (sin mayúsculas, tildes ni espacios sobrantes), incluyendo unidades inactivas.
- Datos iniciales **sugeridos** (`sugerida: true`, editables, PROVISIONAL): Kilogramo (kg), Gramo (g), Litro (l), Mililitro (ml) y Unidad (u). En la base real son datos de la migración.
- No existe `eliminarUnidad`: las unidades nunca se borran, se desactivan. Una unidad inactiva sigue siendo válida para lo que ya la usa, pero no se ofrece para configuraciones nuevas.
- Una unidad que ya se usa (producto, presentación o equivalencia) no puede cambiar de dimensión.

### 2.4 Versión 3: `presentaciones`
Todas las operaciones exigen sesión (`SIN_SESION`).

| Operación | Resultado | Errores |
|---|---|---|
| `crearPresentacion(productoId, {nombre, unidadId, cantidadContenida})` | `Presentacion` | `NO_ENCONTRADO` (producto), `VALIDACION` (con `campos`) |
| `editarPresentacion(id, {nombre, unidadId, cantidadContenida})` | `Presentacion` (mismo `id` y producto) | `NO_ENCONTRADO`, `VALIDACION` |
| `obtenerPresentacion(id)` | `Presentacion` | `NO_ENCONTRADO` |
| `listarPresentaciones(productoId, {estado})` | `Presentacion[]` por nombre | `NO_ENCONTRADO` (producto) |
| `cambiarEstadoPresentacion(id, activo)` | `Presentacion` | `NO_ENCONTRADO`, `VALIDACION` |

- `Presentacion`: `{id, productoId, nombre, nombreNormalizado, unidadId, cantidadContenida, activo, creadoEn, actualizadoEn, creadoPor}`. Ejemplo: Caja = 12 unidades.
- `cantidadContenida` viaja como texto decimal mayor que cero, hasta 4 decimales (se acepta coma o punto al escribirla y se guarda con punto).
- Reglas (en `src/nucleo/datos/presentaciones.js`): nombre de 2 a 60 caracteres, único **dentro del producto** (normalizado, incluye inactivas); unidad existente y activa (o la que ya tenía).
- Cada producto define sus presentaciones: no se asume que todas las cajas contienen lo mismo. Editar el contenido no reescribe el historial: los movimientos (V4) guardarán el factor con el que se registraron.
- Nunca se borran, se desactivan.

### 2.5 Versión 3: `conversiones` y la función `convertir`
Todas las operaciones exigen sesión (`SIN_SESION`).

| Operación | Resultado | Errores |
|---|---|---|
| `crearConversion({productoId\|null, unidadOrigenId, unidadDestinoId, factor})` | `Conversion` | `VALIDACION` (con `campos`), `NO_ENCONTRADO` (producto) |
| `cambiarFactorConversion(id, factor)` | `Conversion` **nueva**; la anterior queda no vigente | `VALIDACION`, `NO_ENCONTRADO` |
| `retirarConversion(id)` | `Conversion` no vigente (no se borra) | `VALIDACION`, `NO_ENCONTRADO` |
| `obtenerConversion(id)` | `Conversion` | `NO_ENCONTRADO` |
| `listarConversiones({productoId = null, vigentes = true})` | `Conversion[]` (`productoId` nulo = generales) | `NO_ENCONTRADO` (producto) |
| `convertir(productoId, cantidad, origen, destino)` | `{cantidad, factor, conversionId, redondeado, presentacionOrigenId, presentacionDestinoId}` | `CONVERSION_NO_CONFIGURADA`, `UNIDAD_INCOMPATIBLE`, `VALIDACION`, `NO_ENCONTRADO` |

- `Conversion`: `{id, productoId (null = general), unidadOrigenId, unidadDestinoId, factor, vigente, sugerida, reemplazaId, reemplazadaPorId, creadoEn, creadoPor}`. Significa **1 origen = `factor` destino**. Una fila sirve en los dos sentidos (la inversa es 1 / factor, con decimales exactos).
- `factor`: texto decimal mayor que cero, hasta 6 decimales (`decimal(18,6)`).
- **Alcance:** una conversión **general** solo une unidades de la misma dimensión; una conversión **de un producto** puede cruzar dimensiones (1 l de aceite = 0,92 kg) y tiene prioridad sobre la general. Solo hay una vigente por par de unidades (en cualquier sentido) y alcance: no se aceptan duplicadas ni circulares.
- **Versionado:** el factor nunca se edita en el lugar. `cambiarFactorConversion` crea una versión nueva y deja la anterior no vigente. PROVISIONAL: se aplica siempre, aunque la anterior no se haya usado todavía (a partir de la V4, los movimientos guardan `conversion_id` y `factor_aplicado`).
- Datos iniciales sugeridos: kg → g (1000) y l → ml (1000), como filas generales explícitas.
- `convertir`: `origen`/`destino` son un id de unidad o `{presentacionId}` (la presentación debe ser del producto y estar activa). Factor total = contenido de la presentación de origen × equivalencia entre unidades ÷ contenido de la de destino. Resultado a 4 decimales, redondeo half-up (regla de redondeo PROVISIONAL: constante única en `decimales.js`); `redondeado` avisa si hubo redondeo.
- Si no hay equivalencia: `CONVERSION_NO_CONFIGURADA` (error `ConversionNoConfigurada`) para unidades de la misma dimensión, `UNIDAD_INCOMPATIBLE` para dimensiones distintas (por ejemplo litros a kilogramos). **Nunca se asume una equivalencia.**
- Solo hay conversión directa (una fila) más el paso por la presentación; no se encadenan equivalencias (kg → g → mg). Quien necesite mg configura kg ↔ mg.
- Reglas puras en `src/nucleo/datos/conversiones.js`, reutilizables por cualquier adaptador.

### 2.6 Versión 4: `inventario`
Todas las operaciones exigen sesión (`SIN_SESION`). **`registrarMovimiento` es la única forma de cambiar existencias.**

| Operación | Resultado | Errores |
|---|---|---|
| `registrarMovimiento(entrada)` | `{movimiento, existencia, repetido}` | `VALIDACION` (con `campos`), `NO_ENCONTRADO` (producto, unidad o presentación), `CONVERSION_NO_CONFIGURADA`, `UNIDAD_INCOMPATIBLE`, `OPERACION_DUPLICADA` |
| `listarExistencias({busqueda, estado, pagina, tamanoPagina})` | `{items, total, pagina, tamanoPagina, totalPaginas, incompletos}` | — |
| `obtenerExistencia(productoId)` | `{productoId, cantidadBase, unidadBase, actualizadoEn, sinExistencia}` | `NO_ENCONTRADO` |
| `verificarConsistencia()` | `{consistente, productosRevisados, movimientosRevisados, discrepancias[]}` | — |
| `alCambiarInventario(callback)` | función para desuscribirse; el callback recibe `{productoId, movimientoId}` tras cada movimiento **aceptado** | — |

**Entrada de `registrarMovimiento`:** `{productoId, tipo, subtipo, cantidad, unidadId | presentacionId, sentido?, referenciaTipo?, referenciaId?, nota?, claveIdempotencia}`.
- `tipo`: `ingreso` (suma), `salida` (resta) o `ajuste` (debe traer `sentido`: `1` suma, `-1` resta; PROVISIONAL, lo afina la V12).
- `subtipo` permitido por tipo (PROVISIONAL): ingreso → `compra`, `inventario_inicial`; salida → `salida_general`, `consumo`; ajuste → `ajuste_conteo`, `anulacion`.
- Se indica la unidad **o** la presentación (por ejemplo 3 cajas), nunca las dos. La cantidad se acepta con coma o punto.
- **No se recibe** la fecha, la hora ni el usuario: los asigna la capa de datos (si llegan, se ignoran).

**Una sola transacción** (todo o nada): 1) producto existente, activo y **completo** (con unidad base); 2) validar y convertir a la unidad base con `convertir` (V3), guardando lo usado; 3) si resta, verificar existencia suficiente; 4) insertar el movimiento; 5) actualizar la existencia. Si algo falla no queda nada guardado.
- **Salida mayor a la existencia:** se rechaza (`VALIDACION`, `campos.cantidad` = «No hay cantidad suficiente de «X». Disponible: 4 kg.», propiedad `disponible`), no cambia nada y **nunca** se convierte en ajuste, ingreso ni compra. La existencia nunca queda negativa (tampoco con un ajuste que resta).
- **Idempotencia:** la misma `claveIdempotencia` con la misma operación devuelve el movimiento original (`repetido: true`, y la existencia actual) sin duplicar, aunque ahora ya no alcanzara la existencia. La misma clave con **otra** operación se rechaza con `OPERACION_DUPLICADA` (PROVISIONAL).
- **Concurrencia:** dos operaciones simultáneas sobre el mismo producto no se pisan (dos salidas de 3 con existencia 5: solo una se acepta).
- **Inmutabilidad:** no existen operaciones para editar o borrar movimientos ni para fijar una existencia a mano. Las correcciones son movimientos nuevos (V12).
- Si la cantidad se redondea (4 decimales, half-up) queda registrado en `redondeado`; una cantidad que queda en cero al convertir se rechaza.
- **Unidad base:** con movimientos registrados, `editarProducto` ya no permite cambiarla (`VALIDACION`, `campos.unidadBaseId`).

**`Movimiento`:** `{id, productoId, tipo, subtipo, sentido, cantidadOriginal, unidadOriginalId, presentacionOriginalId, factorAplicado, conversionId, redondeado, cantidadBase, unidadBaseId, fechaHora, usuarioId, claveIdempotencia, referenciaTipo, referenciaId, nota}`.
Guarda la cantidad y la unidad **originales**, el factor y la conversión **usados** (así cambiar después una equivalencia o una presentación no reescribe el historial) y la cantidad base.

**`listarExistencias`:** solo productos **completos**, ordenados por nombre; `estado` como en productos (`'activos'` por defecto). Cada ítem: `{productoId, nombre, activo, unidadBase: {id, nombre, abreviatura}, cantidadBase, actualizadoEn, sinExistencia}`; un producto sin movimientos tiene existencia `"0"`. `incompletos` cuenta los productos del mismo filtro que no aparecen por no tener unidad base.

**`verificarConsistencia`:** compara, por producto, la suma de `sentido × cantidadBase` de sus movimientos contra la existencia guardada; `discrepancias` lista las diferencias.

**Para la base real:** bloqueo de fila (`SELECT … FOR UPDATE`) o actualización condicional dentro de una función transaccional; índice único sobre `clave_idempotencia`; `CHECK (cantidad_base >= 0)` en existencias; sin permisos de `UPDATE`/`DELETE` sobre `movimientos`; reglas puras reutilizables en `src/nucleo/datos/inventario.js`; `alCambiarInventario` con la suscripción en tiempo real de la base o una consulta periódica. Las pruebas de contrato incluyen una de **atomicidad** que cada adaptador activa con `crearConFalloSimulado`.

### 2.7 Versión 5: `compras`
Todas las operaciones exigen sesión (`SIN_SESION`). **Decisión del equipo:** registrar una compra aumenta automáticamente el inventario; compra e ingreso son **una sola operación** (sin captura doble ni duplicación).

| Operación | Resultado | Errores |
|---|---|---|
| `registrarCompra({fechaCompra, nota?, lineas, claveIdempotencia})` | `{compra, repetido}` (la compra incluye `lineas`) | `VALIDACION` (con `campos`), `NO_ENCONTRADO`, `CONVERSION_NO_CONFIGURADA`, `UNIDAD_INCOMPATIBLE`, `OPERACION_DUPLICADA` |
| `listarCompras({desde, hasta, productoId, pagina, tamanoPagina})` | `{items, total, pagina, tamanoPagina, totalPaginas}` | `VALIDACION` (fechas), `NO_ENCONTRADO` (producto) |
| `obtenerCompra(id)` | Compra con líneas enriquecidas | `NO_ENCONTRADO` |

- `lineas`: `[{productoId, unidadId | presentacionId, cantidad, costoUnitario | costoTotal}]`. Si hay `presentacionId`, `cantidad` es el **número de presentaciones** (3 cajas) y no se envía `unidadId`.
- `Compra`: `{id, fechaCompra, registradaEn, usuarioId, nota, total}`. `fechaCompra` ('AAAA-MM-DD') la elige el usuario y **no puede ser futura** (se compara con el día de hoy en Costa Rica); `registradaEn`, `usuarioId`, `id` y `total` **los asigna la capa de datos**: si la entrada los trae, se ignoran.
- `LineaCompra`: `{id, compraId, productoId, presentacionId, cantidad, unidadId, costoUnitario, costoTotal, movimientoId}`; los importes son textos con 2 decimales. Con presentación, `unidadId` es la unidad de la presentación (informativa) y el costo unitario es el de **una presentación**.
- **Transacción única:** valida la compra → por **cada línea** ejecuta el mismo núcleo que `registrarMovimiento` (`tipo: 'ingreso'`, `subtipo: 'compra'`, `referenciaTipo: 'compra'`, `referenciaId` = id de la compra) → guarda compra, líneas, movimientos y existencias. **Si cualquier línea falla, no queda nada guardado** (ni compra, ni las líneas anteriores, ni existencias).
- **Idempotencia:** `claveIdempotencia` de la compra (máx. 80 caracteres). La de cada línea se deriva: `<clave>:1`, `<clave>:2`… Reenviar la misma compra devuelve la original (`repetido: true`) sin duplicar; la misma clave con una compra distinta → `OPERACION_DUPLICADA`.
- **Costos:** el usuario escribe `costoUnitario` **o** `costoTotal` (uno solo); el sistema calcula el otro y guarda ambos. Total = cantidad × unitario; unitario = total ÷ cantidad, con decimales exactos, redondeo half-up a 2 decimales (PROVISIONAL) y mayores que cero (PROVISIONAL: confirmar si se aceptan costos en cero). El costo de adquisición queda **tal como se registró**: no se promedia (la fórmula del costo promedio está sin aprobar).
- **Errores por línea:** los mensajes por campo llevan la posición de la línea (`lineas.0.cantidad`, `lineas.1.costo`, `lineas.2.productoId`, `lineas.0.unidadId`…, 0 = primera). Un error de una línea conserva su código y agrega `linea` (1 = primera) y el mensaje «Línea N: …». Los errores de varios campos y varias líneas vienen **juntos**.
- Una compra confirmada **no se edita ni se borra**; no existen operaciones para eso. Se corrige con el mecanismo de la V12. El ingreso generado conserva lo usado (cantidad base, factor, conversión): editar después una presentación o una equivalencia no lo reescribe.
- Reglas puras en `src/nucleo/datos/compras.js`, reutilizables por cualquier adaptador. En el demo, compras y movimientos viven en la misma clave de `sessionStorage` para confirmarse con una sola escritura.
- No se agregan proveedor, factura ni impuestos: no están confirmados por el hogar.

## 3. Secciones previstas (se agregan al construir cada módulo)
_(Las versiones 2, 3 y 4 ya están en las secciones 2.2 a 2.6; ver `ESTADO_V2.md`, `ESTADO_V3.md` y `ESTADO_V4.md`.)_

| Versión | Sección | Operaciones |
|---|---|---|
| 3 | `unidades`, `presentaciones` y `conversiones` (hechas) | CRUD de cada una; `convertir(productoId, cantidad, origen, destino)` → `{cantidad, factor, conversionId, ...}` o error `ConversionNoConfigurada` |
| 4 | `inventario` (hecha) | `registrarMovimiento(entrada)`, `listarExistencias`, `obtenerExistencia`, `verificarConsistencia()`, `alCambiarInventario` (sección 2.6) |
| 5 | `compras` (hecha) | `registrarCompra`, `listarCompras`, `obtenerCompra` (ver 2.7) |
| 6 | `salidas`, `consumos` | `registrarSalida`, `registrarConsumo`, `listar` |
| 7 | `movimientos` | `listar({productoId, desde, hasta, tipo, subtipo, pagina})`, `obtener(id)`, `consolidado({desde, hasta})` |
| 8 | `gastos`, `costos` | `registrarGasto`, `listarGastos`, `historialCostosAdquisicion(productoId)` |
| 9–10 | `reportes` | `inventarioAlCierre(mes)`, `resumenMovimientos(mes)`, `comprasMensuales(mes)`, `gastosMensuales(mes)`, `consumoMensual(mes)`, `costosMensuales(mes)` |
| 11 | `conteos` | `crear`, `registrarCantidadFisica`, `finalizar`, `comparacion(conteoId)` |
| 12 | `ajustes` | `confirmarAjuste({conteoLineaId, motivo, claveIdempotencia})`, `anularMovimiento({movimientoId, motivo})` |
| 13 | `desinfecciones` | `registrar`, `marcarDesinfectada({id, cantidad})`, `listar` |
| 14–15 | `platillos`, `recetas` | CRUD, `estandarizar`, `calcular(recetaId, comensales)` |
| 17 | `importaciones` | `validarArchivo`, `confirmarImportacion` |
| 18 | `usuarios`, `permisos` | administración de usuarios y permisos |

## 4. `registrarMovimiento`: la única forma de cambiar existencias
Toda compra, ingreso, salida, consumo, ajuste y anulación pasa por esta operación. Ninguna
otra operación modifica existencias.

**Entrada:** `{ productoId, tipo: 'ingreso'|'salida'|'ajuste', subtipo, cantidad, unidadId | presentacionId, sentido (solo ajustes), referenciaTipo, referenciaId, nota, claveIdempotencia }`
(Detalle de la V4 en la sección 2.6.)

**Debe ejecutar todo en una sola transacción:**
1. Validar producto existente, activo y completo (con unidad base).
2. Convertir la cantidad a la unidad base (error si no hay conversión configurada).
3. Si es salida: verificar existencia suficiente; si no alcanza, **rechazar sin cambiar nada** (`VALIDACION` con la cantidad disponible).
4. Insertar el movimiento (con cantidad original, unidad original, factor aplicado, cantidad base, usuario y hora del servidor).
5. Actualizar la existencia del producto.

**Garantías exigidas a la base:**
- Atomicidad: si algo falla no queda nada parcial.
- Idempotencia: la misma `claveIdempotencia` devuelve el resultado original sin duplicar.
- Concurrencia: dos operaciones simultáneas sobre el mismo producto no se pisan.
- Los movimientos no se editan ni se borran (restricción en la base).
- Una salida mayor a la existencia **siempre** se rechaza; nunca se convierte en ajuste, compra o ingreso.
- El estado de la interfaz nunca es la fuente oficial de la existencia.

## 5. Seguridad y permisos
- Los permisos se verifican en la capa confiable, no solo ocultando botones.
- Cada versión registra los permisos que necesita en su ESTADO (por ejemplo `productos.crear`);
  la Versión 18 los consolida en roles. Mientras tanto, todo usuario autenticado tiene acceso completo.
- Nunca poner claves secretas en variables `VITE_*` (quedan visibles en el navegador).
