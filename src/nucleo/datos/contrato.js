/**
 * CONTRATO DE LA CAPA DE DATOS
 * ----------------------------------------------------------------------------
 * Ninguna pantalla ni componente habla directamente con una base de datos.
 * Todo pasa por un "adaptador" que cumple este contrato. Hoy existe solo el
 * adaptador de demostración (adaptadorDemo.js). Cuando se defina la base de
 * datos real se escribe un adaptador nuevo y se registra en index.js; el resto
 * del sistema no cambia.
 *
 * Detalle completo (operaciones futuras, tablas, reglas): docs/CONTRATO_DATOS.md
 *
 * Forma de un adaptador:
 * {
 *   nombre: string,                 // 'demo', ...
 *   esDemo: boolean,                // true solo en el adaptador de demostración
 *   autenticacion: {
 *     iniciarSesion(correo, clave) -> Promise<Usuario>   // lanza ErrorDatos(CREDENCIALES_INVALIDAS)
 *     cerrarSesion()               -> Promise<void>
 *     obtenerSesion()              -> Promise<Usuario | null>
 *     alCambiarSesion(callback)    -> () => void          // devuelve la función para desuscribirse
 *   }
 * }
 *
 *   productos: {                    // Versión 2. Todas exigen sesión (SIN_SESION).
 *     crearProducto({ nombre, unidadBaseId })        -> Promise<Producto>   // VALIDACION (campos.nombre / campos.unidadBaseId) | NOMBRE_DUPLICADO
 *     editarProducto(id, { nombre, unidadBaseId? })  -> Promise<Producto>   // VALIDACION | NOMBRE_DUPLICADO | NO_ENCONTRADO
 *                                                    // Si no se envía unidadBaseId, la actual no cambia.
 *     obtenerProducto(id)                            -> Promise<Producto>   // NO_ENCONTRADO
 *     listarProductos({ busqueda, estado, pagina, tamanoPagina, soloCompletos })
 *                                                    -> Promise<{ items, total, pagina, tamanoPagina, totalPaginas }>
 *                                                    // estado: 'activos' (defecto) | 'inactivos' | 'todos'; orden por nombre
 *     cambiarEstadoProducto(id, activo: boolean)     -> Promise<Producto>   // NO_ENCONTRADO
 *   }                                 // No existe eliminarProducto: los productos nunca se borran, se desactivan.
 *
 *   unidades: {                     // Versión 3. Todas exigen sesión (SIN_SESION).
 *     crearUnidad({ nombre, abreviatura, dimension })        -> Promise<Unidad>   // VALIDACION (con campos)
 *     editarUnidad(id, { nombre, abreviatura, dimension })   -> Promise<Unidad>   // VALIDACION | NO_ENCONTRADO
 *     obtenerUnidad(id)                                      -> Promise<Unidad>   // NO_ENCONTRADO
 *     listarUnidades({ estado })                             -> Promise<Unidad[]> // estado: 'activas' (defecto) | 'inactivas' | 'todas'
 *     cambiarEstadoUnidad(id, activo: boolean)               -> Promise<Unidad>   // NO_ENCONTRADO | VALIDACION
 *   }                                 // No existe eliminarUnidad: las unidades nunca se borran, se desactivan.
 *
 *   presentaciones: {               // Versión 3. Todas exigen sesión (SIN_SESION).
 *     crearPresentacion(productoId, { nombre, unidadId, cantidadContenida })   -> Promise<Presentacion>  // NO_ENCONTRADO (producto) | VALIDACION (con campos)
 *     editarPresentacion(id, { nombre, unidadId, cantidadContenida })          -> Promise<Presentacion>  // NO_ENCONTRADO | VALIDACION
 *     obtenerPresentacion(id)                                                  -> Promise<Presentacion>  // NO_ENCONTRADO
 *     listarPresentaciones(productoId, { estado })                             -> Promise<Presentacion[]> // 'activas' (defecto) | 'inactivas' | 'todas'; NO_ENCONTRADO si no existe el producto
 *     cambiarEstadoPresentacion(id, activo: boolean)                           -> Promise<Presentacion>  // NO_ENCONTRADO | VALIDACION
 *   }                                 // No existe eliminarPresentacion: se desactivan.
 *
 *   conversiones: {                 // Versión 3. Todas exigen sesión (SIN_SESION).
 *     crearConversion({ productoId|null, unidadOrigenId, unidadDestinoId, factor })  -> Promise<Conversion>  // VALIDACION (con campos) | NO_ENCONTRADO (producto)
 *     cambiarFactorConversion(id, factor)    -> Promise<Conversion>   // crea una versión NUEVA y deja la anterior no vigente; VALIDACION | NO_ENCONTRADO
 *     retirarConversion(id)                  -> Promise<Conversion>   // la deja no vigente (no se borra); NO_ENCONTRADO | VALIDACION
 *     obtenerConversion(id)                  -> Promise<Conversion>   // NO_ENCONTRADO
 *     listarConversiones({ productoId = null, vigentes = true }) -> Promise<Conversion[]>  // productoId null = generales
 *     convertir(productoId, cantidad, origen, destino) -> Promise<{ cantidad, factor, conversionId, redondeado, presentacionOrigenId, presentacionDestinoId }>
 *         // origen/destino: id de unidad o { presentacionId }. Errores: CONVERSION_NO_CONFIGURADA (ConversionNoConfigurada),
 *         // UNIDAD_INCOMPATIBLE, VALIDACION, NO_ENCONTRADO. NUNCA asume una equivalencia.
 *   }
 *
 *   inventario: {                  // Versión 4. Todas exigen sesión (SIN_SESION). ÚNICA vía para cambiar existencias.
 *     registrarMovimiento({ productoId, tipo, subtipo, cantidad, unidadId | presentacionId, sentido?, referenciaTipo?, referenciaId?, nota?, claveIdempotencia })
 *         -> Promise<{ movimiento, existencia, repetido }>
 *         // UNA sola transacción: valida producto (existente, activo, completo) -> convierte a la unidad base (datos.conversiones.convertir)
 *         // -> si resta, verifica existencia suficiente -> inserta el movimiento -> actualiza la existencia. Si algo falla, no queda nada.
 *         // Idempotente: la misma claveIdempotencia devuelve el movimiento original (repetido: true). Fecha, hora y usuario los fija la capa de datos.
 *         // Errores: VALIDACION (con campos; una salida mayor a la existencia lleva campos.cantidad y `disponible`), NO_ENCONTRADO,
 *         // CONVERSION_NO_CONFIGURADA, UNIDAD_INCOMPATIBLE, OPERACION_DUPLICADA (clave reutilizada con otra operación)
 *     listarExistencias({ busqueda, estado, pagina, tamanoPagina })
 *         -> Promise<{ items: [{ productoId, nombre, activo, unidadBase: {id, nombre, abreviatura}, cantidadBase, actualizadoEn, sinExistencia }],
 *                      total, pagina, tamanoPagina, totalPaginas, incompletos }>   // solo productos COMPLETOS; `incompletos` = los que no aparecen
 *     obtenerExistencia(productoId) -> Promise<{ productoId, cantidadBase, unidadBase, actualizadoEn, sinExistencia }>   // NO_ENCONTRADO
 *     verificarConsistencia()       -> Promise<{ consistente, productosRevisados, movimientosRevisados, discrepancias[] }>
 *     alCambiarInventario(callback) -> () => void   // tiempo real: callback({ productoId, movimientoId }) tras cada movimiento aceptado
 *   }                                 // No existe editar ni eliminar movimientos: son inmutables. Se corrigen con movimientos nuevos (V12).
 *
 *   compras: {                     // Versión 5. Todas exigen sesión (SIN_SESION). Compra e ingreso son UNA sola operación.
 *     registrarCompra({ fechaCompra 'AAAA-MM-DD', nota?, lineas: [{ productoId, unidadId | presentacionId, cantidad, costoUnitario | costoTotal }], claveIdempotencia })
 *         -> Promise<{ compra: Compra (con lineas), repetido }>
 *         // UNA sola transacción: valida la compra -> por CADA línea ejecuta el mismo núcleo que registrarMovimiento (ingreso, subtipo 'compra',
 *         // referencia a la compra) -> guarda compra, líneas, movimientos y existencias. Si cualquier línea falla, NO queda nada guardado.
 *         // Idempotente: la misma claveIdempotencia devuelve la compra original (repetido: true); con otra compra distinta -> OPERACION_DUPLICADA.
 *         // Errores: VALIDACION (con campos: fechaCompra, nota, lineas, y por línea `lineas.N.productoId|unidadId|cantidad|costo`, N desde 0),
 *         // NO_ENCONTRADO, CONVERSION_NO_CONFIGURADA, UNIDAD_INCOMPATIBLE (estos con `linea` y campos de la línea), OPERACION_DUPLICADA
 *     listarCompras({ desde, hasta, productoId, pagina, tamanoPagina }) -> Promise<{ items: [{ ...Compra sin lineas, cantidadLineas, productos[] }], total, pagina, tamanoPagina, totalPaginas }>
 *         // desde/hasta 'AAAA-MM-DD' inclusivos; más reciente primero; VALIDACION si las fechas no son válidas; NO_ENCONTRADO si el producto no existe
 *     obtenerCompra(id) -> Promise<Compra con lineas enriquecidas (producto, unidad, presentacion, movimiento generado)>   // NO_ENCONTRADO
 *   }                                 // No existe editar ni eliminar compras: una compra confirmada no se edita (se corrige en la V12).
 *
 * Usuario:  { id: string, correo: string, nombre: string }
 * Producto: { id, nombre, nombreNormalizado, activo, unidadBaseId (obligatoria desde la V3; null = INCOMPLETO),
 *             creadoEn, actualizadoEn (ISO), creadoPor (id del usuario) }
 * Reglas del catálogo (nombre 2-120, sin espacios sobrantes, único normalizado): ver productos.js
 * Unidad:   { id, nombre, abreviatura, dimension: 'masa'|'volumen'|'conteo', activo, sugerida,
 *             nombreNormalizado, abreviaturaNormalizada, creadoEn, actualizadoEn (ISO), creadoPor }
 * Reglas de las unidades (nombre y abreviatura únicos normalizados): ver unidades.js
 * Presentacion: { id, productoId, nombre, nombreNormalizado, unidadId, cantidadContenida (texto decimal > 0, hasta 4 decimales),
 *                 activo, creadoEn, actualizadoEn (ISO), creadoPor }.  Ejemplo: Caja = 12 unidades.
 * Reglas de las presentaciones (nombre único por producto, cantidad > 0): ver presentaciones.js
 * Compra:   { id, fechaCompra ('AAAA-MM-DD', elegida por el usuario, no futura), registradaEn (ISO, del servidor), usuarioId, nota, total (texto, 2 decimales) }
 * LineaCompra: { id, compraId, productoId, presentacionId (o null), cantidad, unidadId, costoUnitario, costoTotal (textos, 2 decimales), movimientoId }
 * Reglas de las compras (costos, fecha, validación por línea): ver compras.js
 * Conversion: { id, productoId (null = general), unidadOrigenId, unidadDestinoId, factor (1 origen = factor destino), vigente,
 *               sugerida, reemplazaId, reemplazadaPorId, creadoEn, creadoPor }.  Reglas y función de cálculo: conversiones.js
 * Movimiento: { id, productoId, tipo, subtipo, sentido (1 | -1), cantidadOriginal, unidadOriginalId, presentacionOriginalId (o null),
 *               factorAplicado, conversionId (o null), redondeado, cantidadBase, unidadBaseId, fechaHora (ISO, del servidor),
 *               usuarioId, claveIdempotencia, referenciaTipo, referenciaId, nota }.  Reglas puras: inventario.js
 *
 * Las versiones siguientes AGREGAN secciones al adaptador (productos, unidades,
 * movimientos, ...) sin cambiar las existentes. Ver docs/CONTRATO_DATOS.md.
 */

const SECCIONES_REQUERIDAS = {
  autenticacion: ['iniciarSesion', 'cerrarSesion', 'obtenerSesion', 'alCambiarSesion'],
  productos: ['crearProducto', 'editarProducto', 'obtenerProducto', 'listarProductos', 'cambiarEstadoProducto'],
  unidades: ['crearUnidad', 'editarUnidad', 'obtenerUnidad', 'listarUnidades', 'cambiarEstadoUnidad'],
  compras: ['registrarCompra', 'listarCompras', 'obtenerCompra'],
  conversiones: ['crearConversion', 'cambiarFactorConversion', 'retirarConversion', 'obtenerConversion', 'listarConversiones', 'convertir'],
  presentaciones: ['crearPresentacion', 'editarPresentacion', 'obtenerPresentacion', 'listarPresentaciones', 'cambiarEstadoPresentacion'],
  inventario: ['registrarMovimiento', 'listarExistencias', 'obtenerExistencia', 'verificarConsistencia', 'alCambiarInventario'],
};

export function validarAdaptador(adaptador) {
  if (!adaptador || typeof adaptador !== 'object') {
    throw new Error('El adaptador de datos no es válido.');
  }
  if (typeof adaptador.nombre !== 'string') {
    throw new Error('El adaptador de datos debe declarar su "nombre".');
  }
  if (typeof adaptador.esDemo !== 'boolean') {
    throw new Error('El adaptador de datos debe declarar si "esDemo" es verdadero o falso.');
  }
  for (const [seccion, metodos] of Object.entries(SECCIONES_REQUERIDAS)) {
    for (const metodo of metodos) {
      if (typeof adaptador[seccion]?.[metodo] !== 'function') {
        throw new Error(`El adaptador "${adaptador.nombre}" no implementa ${seccion}.${metodo}().`);
      }
    }
  }
  return adaptador;
}
