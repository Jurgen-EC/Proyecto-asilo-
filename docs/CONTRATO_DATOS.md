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
  `CONEXION`, `OPERACION_DUPLICADA`, `DESCONOCIDO`. El adaptador traduce los errores de la
  base a estos códigos; la interfaz muestra `mensajeUsuario`, nunca el mensaje técnico.
- Identificadores: texto estable (UUID recomendado). Nunca se reutilizan.
- Cantidades y dinero viajan como **texto decimal** (por ejemplo `"3.5"`) y se calculan con
  `decimales.js`; nunca como números flotantes.
- Fechas y horas se guardan en UTC, las asigna el servidor, y se muestran en `America/Costa_Rica`.
- Nada se elimina físicamente: se desactiva o se anula con un movimiento nuevo.

## 2. Sección implementada (Versión 1): `autenticacion`
| Operación | Resultado | Errores |
|---|---|---|
| `iniciarSesion(correo, clave)` | `Usuario {id, correo, nombre}` y deja sesión activa | `CREDENCIALES_INVALIDAS`, `VALIDACION`, `CONEXION` |
| `cerrarSesion()` | nada | `CONEXION` |
| `obtenerSesion()` | `Usuario` o `null` | — |
| `alCambiarSesion(callback)` | función para desuscribirse; el callback recibe `Usuario` o `null` | — |

Cualquier adaptador debe pasar `ejecutarPruebasDeContrato` (`src/nucleo/datos/pruebasDeContrato.js`).

## 3. Secciones previstas (se agregan al construir cada módulo)
| Versión | Sección | Operaciones |
|---|---|---|
| 2 | `productos` | `listar({busqueda, estado, pagina})`, `obtener(id)`, `crear(datos)`, `editar(id, datos)`, `cambiarEstado(id, activo)` |
| 3 | `unidades`, `presentaciones`, `conversiones` | CRUD de cada una; `convertir(productoId, cantidad, unidadOrigenId, unidadDestinoId)` → `{cantidad, factor, conversionId}` o error `ConversionNoConfigurada` |
| 4 | `inventario` | `registrarMovimiento(entrada)` (ver sección 4), `listarExistencias({busqueda, pagina})`, `verificarConsistencia()` |
| 5 | `compras` | `registrarCompra({fechaCompra, lineas[], nota, claveIdempotencia})`, `listar`, `obtener` |
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

**Entrada:** `{ productoId, tipo: 'ingreso'|'salida'|'ajuste', subtipo, cantidad, unidadId, referenciaTipo, referenciaId, nota, claveIdempotencia }`

**Debe ejecutar todo en una sola transacción:**
1. Validar producto existente y activo.
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
