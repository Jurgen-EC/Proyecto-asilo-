// REGLAS DE NEGOCIO DEL CATÁLOGO DE PRODUCTOS (Versión 2)
// Funciones puras, sin acceso a datos. Las usa el adaptador de demostración y las
// debe reutilizar (o replicar en la base: restricción de unicidad sobre
// nombre_normalizado, longitud, etc.) cualquier adaptador real. La validación vive
// aquí, en la capa de datos, y NO solo en el formulario.
import { ErrorDatos, CODIGOS } from './errores.js';
import { limpiarEspacios, normalizarNombre, normalizarBusqueda } from '../../compartido/utilidades/texto.js';

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 120;
export const ESTADOS_FILTRO = Object.freeze(['activos', 'inactivos', 'todos']);
export const TAMANO_PAGINA_DEFECTO = 20; // PROVISIONAL
export const TAMANO_PAGINA_MAX = 100;

/** Valida y limpia el nombre. Lanza VALIDACION con { campos: { nombre } } si no cumple. */
export function validarNombreProducto(nombre) {
  const limpio = limpiarEspacios(typeof nombre === 'string' ? nombre : '');
  let mensaje = '';
  if (!limpio) mensaje = 'El nombre es obligatorio.';
  else if (limpio.length < NOMBRE_MIN) mensaje = `El nombre debe tener al menos ${NOMBRE_MIN} caracteres.`;
  else if (limpio.length > NOMBRE_MAX) mensaje = `El nombre no puede tener más de ${NOMBRE_MAX} caracteres.`;
  if (mensaje) throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { nombre: mensaje });
  return { nombre: limpio, nombreNormalizado: normalizarNombre(limpio) };
}

/** Error para un nombre repetido (comparación normalizada). */
export function errorNombreDuplicado(existente) {
  const mensaje = existente?.activo === false
    ? 'Ya existe un producto con ese nombre, pero está inactivo. Buscalo en la lista de inactivos para volver a activarlo.'
    : 'Ya existe un producto con ese nombre.';
  return new ErrorDatos(CODIGOS.NOMBRE_DUPLICADO, mensaje, { nombre: mensaje });
}

/** Completa y acota los parámetros de listarProductos. */
export function normalizarConsulta({ busqueda = '', estado = 'activos', pagina = 1, tamanoPagina = TAMANO_PAGINA_DEFECTO } = {}) {
  const tamano = Math.min(TAMANO_PAGINA_MAX, Math.max(1, Math.floor(Number(tamanoPagina)) || TAMANO_PAGINA_DEFECTO));
  return {
    busqueda: String(busqueda ?? ''),
    estado: ESTADOS_FILTRO.includes(estado) ? estado : 'activos',
    pagina: Math.max(1, Math.floor(Number(pagina)) || 1),
    tamanoPagina: tamano,
  };
}

/** Aplica filtro de estado y búsqueda (sin tildes ni mayúsculas; todas las palabras deben aparecer) y ordena por nombre. */
export function filtrarYOrdenar(productos, { busqueda, estado }) {
  const palabras = normalizarBusqueda(busqueda).split(' ').filter(Boolean);
  return productos
    .filter((p) => estado === 'todos' || (estado === 'activos' ? p.activo : !p.activo))
    .filter((p) => {
      const nombre = normalizarBusqueda(p.nombre);
      return palabras.every((palabra) => nombre.includes(palabra));
    })
    .sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado, 'es'));
}

/** Devuelve la página pedida (acotada al rango válido) y los totales. */
export function paginar(lista, pagina, tamanoPagina) {
  const total = lista.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanoPagina));
  const actual = Math.min(pagina, totalPaginas);
  const desde = (actual - 1) * tamanoPagina;
  return { items: lista.slice(desde, desde + tamanoPagina), total, pagina: actual, tamanoPagina, totalPaginas };
}
