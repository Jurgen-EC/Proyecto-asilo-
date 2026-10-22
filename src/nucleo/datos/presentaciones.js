// REGLAS DE NEGOCIO DE LAS PRESENTACIONES DE UN PRODUCTO (Versión 3, RF-006)
// Una presentación es una forma concreta de comprar o manejar un producto (Caja, Bolsa, Saco...)
// y dice cuánto contiene, en qué unidad. Ejemplo: Caja = 12 unidades.
// NO se asume que todas las cajas contienen lo mismo: la equivalencia es de cada producto y presentación.
// Funciones puras: las usa el adaptador demo y las debe reutilizar cualquier adaptador real.
import { ErrorDatos, CODIGOS } from './errores.js';
import { limpiarEspacios, normalizarNombre } from '../../compartido/utilidades/texto.js';
import { leerDecimal, decimalesDe, DECIMALES_CANTIDAD, comparar } from '../../compartido/utilidades/decimales.js';

export const NOMBRE_PRESENTACION_MIN = 2;
export const NOMBRE_PRESENTACION_MAX = 60;
export const ESTADOS_PRESENTACION = Object.freeze(['activas', 'inactivas', 'todas']);
const CANTIDAD_MAXIMA = '9999999999.9999'; // decimal(14,4)

function mensajeUnidadContenido(unidadId, unidades, unidadActualId) {
  if (typeof unidadId !== 'string' || !unidadId) return 'Elegí la unidad en la que se mide el contenido.';
  const unidad = unidades.find((u) => u.id === unidadId);
  if (!unidad) return 'La unidad elegida no existe.';
  if (!unidad.activo && unidadId !== unidadActualId) return 'La unidad elegida está inactiva. Elegí otra o activala primero.';
  return '';
}

function mensajeCantidad(valor) {
  const d = leerDecimal(valor);
  if (d === null) return { mensaje: 'Escribí la cantidad con números (por ejemplo 12 o 0,5).' };
  if (comparar(d, 0) <= 0) return { mensaje: 'La cantidad debe ser mayor que cero.' };
  if (decimalesDe(d) > DECIMALES_CANTIDAD) return { mensaje: `Usá como máximo ${DECIMALES_CANTIDAD} decimales.` };
  if (comparar(d, CANTIDAD_MAXIMA) > 0) return { mensaje: 'La cantidad es demasiado grande.' };
  return { cantidad: d.toFixed() };
}

/**
 * Valida y limpia una presentación. `unidades` es la lista completa de unidades.
 * `unidadActualId`: unidad que la presentación ya tiene (se acepta aunque esté inactiva).
 * Lanza VALIDACION con todos los mensajes por campo juntos.
 */
export function validarPresentacion({ nombre, unidadId, cantidadContenida } = {}, unidades, { unidadActualId = null } = {}) {
  const limpio = limpiarEspacios(typeof nombre === 'string' ? nombre : '');
  const campos = {};
  if (!limpio) campos.nombre = 'El nombre es obligatorio.';
  else if (limpio.length < NOMBRE_PRESENTACION_MIN) campos.nombre = `El nombre debe tener al menos ${NOMBRE_PRESENTACION_MIN} caracteres.`;
  else if (limpio.length > NOMBRE_PRESENTACION_MAX) campos.nombre = `El nombre no puede tener más de ${NOMBRE_PRESENTACION_MAX} caracteres.`;
  const mensajeUnidad = mensajeUnidadContenido(unidadId, unidades, unidadActualId);
  if (mensajeUnidad) campos.unidadId = mensajeUnidad;
  const { mensaje, cantidad } = mensajeCantidad(cantidadContenida);
  if (mensaje) campos.cantidadContenida = mensaje;
  const primero = Object.values(campos)[0];
  if (primero) throw new ErrorDatos(CODIGOS.VALIDACION, primero, campos);
  return { nombre: limpio, nombreNormalizado: normalizarNombre(limpio), unidadId, cantidadContenida: cantidad };
}

/** Otra presentación del MISMO producto con el mismo nombre (comparación normalizada). */
export function detectarPresentacionDuplicada(presentaciones, productoId, nombreNormalizado, idExcluido = null) {
  return presentaciones.find((p) => p.productoId === productoId && p.id !== idExcluido && p.nombreNormalizado === nombreNormalizado) ?? null;
}

export function errorPresentacionDuplicada(existente) {
  const mensaje = existente.activo === false
    ? 'Este producto ya tiene una presentación con ese nombre, pero está inactiva. Buscala en las inactivas para volver a activarla.'
    : 'Este producto ya tiene una presentación con ese nombre.';
  return new ErrorDatos(CODIGOS.VALIDACION, mensaje, { nombre: mensaje });
}

export function filtrarPresentaciones(presentaciones, estado = 'activas') {
  const e = ESTADOS_PRESENTACION.includes(estado) ? estado : 'activas';
  return presentaciones
    .filter((p) => e === 'todas' || (e === 'activas' ? p.activo : !p.activo))
    .sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado, 'es'));
}
