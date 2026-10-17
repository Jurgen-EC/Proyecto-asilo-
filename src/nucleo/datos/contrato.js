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
 *     crearProducto({ nombre })                      -> Promise<Producto>   // VALIDACION | NOMBRE_DUPLICADO
 *     editarProducto(id, { nombre })                 -> Promise<Producto>   // VALIDACION | NOMBRE_DUPLICADO | NO_ENCONTRADO
 *     obtenerProducto(id)                            -> Promise<Producto>   // NO_ENCONTRADO
 *     listarProductos({ busqueda, estado, pagina, tamanoPagina })
 *                                                    -> Promise<{ items, total, pagina, tamanoPagina, totalPaginas }>
 *                                                    // estado: 'activos' (defecto) | 'inactivos' | 'todos'; orden por nombre
 *     cambiarEstadoProducto(id, activo: boolean)     -> Promise<Producto>   // NO_ENCONTRADO
 *   }                                 // No existe eliminarProducto: los productos nunca se borran, se desactivan.
 *
 * Usuario:  { id: string, correo: string, nombre: string }
 * Producto: { id, nombre, nombreNormalizado, activo, unidadBaseId (null hasta la V3),
 *             creadoEn, actualizadoEn (ISO), creadoPor (id del usuario) }
 * Reglas del catálogo (nombre 2-120, sin espacios sobrantes, único normalizado): ver productos.js
 *
 * Las versiones siguientes AGREGAN secciones al adaptador (productos, unidades,
 * movimientos, ...) sin cambiar las existentes. Ver docs/CONTRATO_DATOS.md.
 */

const SECCIONES_REQUERIDAS = {
  autenticacion: ['iniciarSesion', 'cerrarSesion', 'obtenerSesion', 'alCambiarSesion'],
  productos: ['crearProducto', 'editarProducto', 'obtenerProducto', 'listarProductos', 'cambiarEstadoProducto'],
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
