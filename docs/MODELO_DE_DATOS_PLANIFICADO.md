# Modelo de datos planificado

Descripción neutral (sin depender de ninguna base). Se ajusta al motor elegido en ADR-001.
Los tipos: `texto`, `entero`, `decimal(p,s)`, `fecha`, `fecha_hora` (UTC), `booleano`, `id` (identificador único estable).
Todas las tablas incluyen `creado_en` y, cuando aplica, `creado_por` y `actualizado_en`.

## Versión 1 — usuarios
- **perfiles_usuario:** id (el mismo del mecanismo de autenticación), correo, nombre, activo (booleano).

## Versión 2 — productos
- **productos:** id, nombre, nombre_normalizado (único; minúsculas, sin tildes, espacios colapsados), activo, unidad_base_id (nulo hasta la V3).

## Versión 3 — unidades, presentaciones, conversiones
- **unidades:** id, nombre, abreviatura, dimension (`masa`|`volumen`|`conteo`), activo.
- **presentaciones:** id, producto_id, nombre, unidad_id, cantidad_contenida decimal(14,4), activo.
- **conversiones:** id, producto_id (nulo = general), unidad_origen_id, unidad_destino_id, factor decimal(18,6) > 0, vigente.
  Una conversión usada en un movimiento no se edita: se crea una nueva y la anterior queda no vigente.

## Versión 4 — movimientos y existencias
- **movimientos:** id, producto_id, tipo (`ingreso`|`salida`|`ajuste`), subtipo (`compra`|`salida_general`|`consumo`|`ajuste_conteo`|`inventario_inicial`|`anulacion`), cantidad_original decimal(14,4), unidad_original_id, conversion_id, factor_aplicado, cantidad_base decimal(14,4), unidad_base_id, sentido (+1/-1), fecha_hora (servidor), usuario_id, clave_idempotencia (única), referencia_tipo, referencia_id, anulado_por_id (nulo), nota. **Inmutable.**
- **existencias:** producto_id (único), cantidad_base decimal(14,4) ≥ 0, actualizado_en. Solo la modifica `registrarMovimiento`.

## Versión 5 — compras
- **compras:** id, fecha_compra (no futura), registrada_en, usuario_id, nota, total decimal(14,2).
- **compra_lineas:** id, compra_id, producto_id, presentacion_id (opcional), cantidad, unidad_id, costo_unitario decimal(14,2), costo_total decimal(14,2), movimiento_id.

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
