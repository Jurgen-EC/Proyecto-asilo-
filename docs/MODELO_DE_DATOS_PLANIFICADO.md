# Modelo de datos planificado

Descripción neutral (sin depender de ninguna base). Se ajusta al motor elegido en ADR-001.
Los tipos: `texto`, `entero`, `decimal(p,s)`, `fecha`, `fecha_hora` (UTC), `booleano`, `id` (identificador único estable).
Todas las tablas incluyen `creado_en` y, cuando aplica, `creado_por` y `actualizado_en`.

## Versión 1 — usuarios
- **perfiles_usuario:** id (el mismo del mecanismo de autenticación), correo, nombre, activo (booleano).

## Versión 2 — productos
- **productos:** id, nombre, nombre_normalizado (único; minúsculas, sin tildes, espacios colapsados), activo, unidad_base_id (nulo hasta la V3).

## Versión 3 — unidades, presentaciones, conversiones
**Construida en la V3** (ver `ESTADO_V3.md` para el detalle de campos).
- **unidades:** id, nombre, abreviatura, dimension (`masa`|`volumen`|`conteo`), activo, sugerida, nombre_normalizado (único), abreviatura_normalizada (único).
- **presentaciones:** id, producto_id, nombre, nombre_normalizado (único por producto), unidad_id, cantidad_contenida decimal(14,4) > 0, activo.
- **conversiones:** id, producto_id (nulo = general), unidad_origen_id, unidad_destino_id, factor decimal(18,6) > 0, vigente, sugerida, reemplaza_id, reemplazada_por_id.
  1 origen = factor destino; sirve en los dos sentidos. Una sola vigente por par de unidades y alcance. El factor no se edita: se crea una versión nueva y la anterior queda no vigente.
- **productos.unidad_base_id:** obligatoria al crear, llave foránea a `unidades` (nula solo en productos heredados de la V2 = INCOMPLETOS).
- Datos iniciales: unidades kg, g, l, ml, u (sugeridas) y conversiones generales kg→g = 1000, l→ml = 1000.

## Versión 4 — movimientos y existencias
**Construida en la V4** (ver `ESTADO_V4.md` para el detalle).
- **movimientos:** id, producto_id, tipo (`ingreso`|`salida`|`ajuste`), subtipo (`compra`|`salida_general`|`consumo`|`ajuste_conteo`|`inventario_inicial`|`anulacion`),
  sentido (+1/-1), cantidad_original decimal(14,4), unidad_original_id, **presentacion_original_id** (nulo; si se registró en cajas, bolsas, etc.),
  conversion_id (nulo si no hubo conversión), factor_aplicado (factor total usado, decimal de alta precisión, p. ej. decimal(38,20)), **redondeado** (booleano),
  cantidad_base decimal(14,4) > 0, unidad_base_id, fecha_hora (servidor), usuario_id, clave_idempotencia (única), referencia_tipo, referencia_id, nota. **Inmutable.**
- **existencias:** producto_id (único), cantidad_base decimal(14,4) ≥ 0, actualizado_en. Solo la modifica `registrarMovimiento`.
- Restricciones: `clave_idempotencia` única; `sentido` solo +1 o -1; `cantidad_base > 0` en movimientos y `>= 0` en existencias; sin `UPDATE` ni `DELETE` sobre movimientos.
- **Cambios respecto al modelo original:** se agregaron `presentacion_original_id` y `redondeado` (trazabilidad de lo registrado) y **se quitó `anulado_por_id`**, porque
  contradice la inmutabilidad (habría que modificar el movimiento original). La V12 resuelve las anulaciones con un movimiento nuevo (`subtipo = anulacion`) que referencia al original (`referencia_tipo`, `referencia_id`).

## Versión 5 — compras
**Construida en la V5** (ver `ESTADO_V5.md` para el detalle de campos).
- **compras:** id, fecha_compra (fecha de calendario, no futura), registrada_en (servidor), usuario_id, nota (opcional), total decimal(14,2), clave_idempotencia (única). Inmutable.
- **compra_lineas:** id, compra_id, producto_id, presentacion_id (opcional), cantidad decimal(14,4) > 0 (con presentación, número de presentaciones), unidad_id, costo_unitario decimal(14,2) > 0, costo_total decimal(14,2) > 0, movimiento_id (único).
- Cada línea genera exactamente un movimiento (`ingreso` / `compra`, `referencia_tipo = 'compra'`, `referencia_id` = compra) con clave `<clave de la compra>:<n>`. Compra, líneas, movimientos y existencias se confirman en **una** transacción.

## Versión 6 — salidas y consumos
- **salidas:** id, movimiento_id, motivo, nota.
- **consumos:** id, movimiento_id, nota, costo_importe decimal(14,2) (nulo), costo_origen (`manual`).

## Versión 8 — gastos
- **gastos:** id, fecha_gasto, concepto, importe decimal(14,2), producto_id (opcional), compra_id (opcional), nota.
  No existe tabla ni campo de costo promedio: fórmula pendiente de aprobación del hogar.

## Versión 11 — conteos
- **conteos:** id, iniciado_en, finalizado_en, estado (`en_curso`|`finalizado`), usuario_id, nota.
- **conteo_lineas:** id, conteo_id, producto_id, cantidad_fisica, unidad_id, cantidad_fisica_base, existencia_digital_base (copia al contar), diferencia.

## Versión 12 — ajustes
- **ajustes:** id, conteo_linea_id (único), producto_id, cantidad_previa, cantidad_nueva, diferencia, motivo (≥ 10 caracteres), usuario_id, movimiento_id.

## Versión 13 — desinfección
- **desinfecciones:** id, producto_id, cantidad, unidad_id, estado (`pendiente`|`desinfectada`), registrado_en/por, desinfectada_en/por, origen_id (opcional).

## Versiones 14–15 — recetas
- **platillos:** id, nombre, activo.
- **recetas:** id, platillo_id, version, porciones_base > 0, estado (`borrador`|`estandarizada`), es_carne.
- **receta_ingredientes:** id, receta_id, producto_id, cantidad > 0, unidad_id (sin repetir producto por receta).

## Versión 17 — importaciones
- **importaciones:** id, nombre_archivo, usuario_id, fecha_hora, filas_totales, filas_cargadas, filas_con_error.

## Versión 18 — permisos
- Se define con la matriz de roles aprobada. Ver el listado de permisos que cada versión registre en su ESTADO.

## Excluido del alcance
Todo lo del módulo nutricional de residentes (RF-058 a RF-073). No crear tablas para eso.
