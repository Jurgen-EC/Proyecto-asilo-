// REGLAS DE NEGOCIO DE LAS SALIDAS Y LOS CONSUMOS (Versión 6: RF-010, RF-011, RF-014, RF-015)
// Funciones puras, sin acceso a datos. Las usa el adaptador de demostración y las debe reutilizar (o replicar dentro de
// la base, en una función transaccional) cualquier adaptador real.
//
// DECISIÓN DEL EQUIPO (PROPUESTA TÉCNICA, pendiente de validar con el hogar): SALIDA y CONSUMO son conceptos DISTINTOS.
// Ambos descuentan existencias, pero cada uno tiene su propia tabla, su propio servicio y sus propias pantallas:
//   - Salida: se saca un producto por un MOTIVO (texto). Genera un movimiento tipo 'salida', subtipo 'salida_general'.
//   - Consumo: se gasta un producto en la cocina (sin motivo; el costo llega en la V8). Genera un movimiento tipo 'salida', subtipo 'consumo'.
// Cada operación genera EXACTAMENTE UN movimiento (un producto por operación) por la función central de la V4, de modo que
// ambas aparezcan como Salidas en el historial y el consolidado (V7) sin perder su distinción.
import { ErrorDatos, CODIGOS } from './errores.js';
import { lanzarSiHayCampos } from './productos.js';
import { claveDeLinea, normalizarConsultaCompras, TAMANO_PAGINA_COMPRAS, TAMANO_PAGINA_COMPRAS_MAX } from './compras.js';
import { limpiarEspacios } from '../../compartido/utilidades/texto.js';
import { leerDecimal, comparar } from '../../compartido/utilidades/decimales.js';

export const MOTIVO_MAX = 200; // PROVISIONAL
export const NOTA_OPERACION_MAX = 500;
export const CLAVE_OPERACION_MAX = 80; // deja espacio para el sufijo de la clave del movimiento (ver claveDelMovimiento)
export const TAMANO_PAGINA_OPERACIONES = TAMANO_PAGINA_COMPRAS;
export const TAMANO_PAGINA_OPERACIONES_MAX = TAMANO_PAGINA_COMPRAS_MAX;

/** Clases de operación. Cada una con su nombre, su subtipo de movimiento y su tipo de referencia. */
export const CLASES_OPERACION = Object.freeze({
  salida: Object.freeze({ clase: 'salida', subtipo: 'salida_general', referenciaTipo: 'salida', requiereMotivo: true }),
  consumo: Object.freeze({ clase: 'consumo', subtipo: 'consumo', referenciaTipo: 'consumo', requiereMotivo: false }),
});

const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

/** Mensaje de error de una cantidad escrita, o '' si es válida (mayor que cero y con números). */
export function mensajeCantidad(valor) {
  if (vacio(valor)) return 'Escribí la cantidad.';
  const d = leerDecimal(valor);
  if (d === null) return 'Escribí la cantidad con números (por ejemplo 3 o 0,5).';
  if (comparar(d, 0) <= 0) return 'La cantidad debe ser mayor que cero.';
  return '';
}

/** Clave de idempotencia del ÚNICO movimiento de la operación, derivada de la clave de la operación (igual que en las compras). */
export const claveDelMovimiento = (claveOperacion) => claveDeLinea(claveOperacion, 0);

/**
 * Valida y normaliza la entrada de `registrarSalida` (clase 'salida') o `registrarConsumo` (clase 'consumo').
 * Lanza VALIDACION con TODOS los mensajes por campo juntos.
 * Entrada: { productoId, cantidad, unidadId | presentacionId, motivo (solo salidas), nota?, claveIdempotencia }.
 * Si hay presentacionId, `cantidad` es el número de presentaciones (1 caja) y no se envía unidadId.
 * La fecha y la hora, el usuario y el id los asigna la capa de datos. Un consumo NO tiene motivo: si llega, se ignora.
 */
export function validarOperacion(entrada, clase) {
  const { requiereMotivo } = CLASES_OPERACION[clase];
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const campos = {};

  if (typeof e.productoId !== 'string' || !e.productoId) campos.productoId = 'Elegí el producto.';

  const unidadId = typeof e.unidadId === 'string' && e.unidadId ? e.unidadId : null;
  const presentacionId = typeof e.presentacionId === 'string' && e.presentacionId ? e.presentacionId : null;
  if (!unidadId && !presentacionId) campos.unidadId = 'Elegí la unidad o la presentación.';
  else if (unidadId && presentacionId) campos.unidadId = 'Indicá la unidad o la presentación, no las dos.';

  const mCantidad = mensajeCantidad(e.cantidad);
  if (mCantidad) campos.cantidad = mCantidad;

  let motivo = null;
  if (requiereMotivo) {
    const limpio = typeof e.motivo === 'string' ? limpiarEspacios(e.motivo) : '';
    if (!limpio) campos.motivo = 'Escribí el motivo de la salida.';
    else if (limpio.length > MOTIVO_MAX) campos.motivo = `El motivo no puede pasar de ${MOTIVO_MAX} caracteres.`;
    else motivo = limpio;
  }

  let nota = null;
  if (e.nota !== undefined && e.nota !== null) {
    if (typeof e.nota !== 'string') campos.nota = 'La nota debe ser texto.';
    else if (limpiarEspacios(e.nota).length > NOTA_OPERACION_MAX) campos.nota = `La nota no puede pasar de ${NOTA_OPERACION_MAX} caracteres.`;
    else nota = limpiarEspacios(e.nota) || null;
  }

  const claveIdempotencia = typeof e.claveIdempotencia === 'string' ? limpiarEspacios(e.claveIdempotencia) : '';
  if (!claveIdempotencia) campos.claveIdempotencia = 'Falta la clave de idempotencia de la operación.';
  else if (claveIdempotencia.length > CLAVE_OPERACION_MAX) campos.claveIdempotencia = `La clave de idempotencia no puede pasar de ${CLAVE_OPERACION_MAX} caracteres.`;

  lanzarSiHayCampos(campos);
  return {
    productoId: e.productoId, unidadId, presentacionId, cantidad: leerDecimal(e.cantidad).toFixed(), motivo, nota, claveIdempotencia,
  };
}

/**
 * ¿La operación pedida es la misma que ya quedó registrada con esa clave? (para decidir entre repetir y rechazar).
 * `registro`: la salida o el consumo guardado; `movimiento`: el movimiento que generó.
 */
export function operacionCoincide(n, registro, movimiento) {
  if (!movimiento) return false;
  const mismaUnidad = n.presentacionId
    ? movimiento.presentacionOriginalId === n.presentacionId
    : movimiento.presentacionOriginalId === null && movimiento.unidadOriginalId === n.unidadId;
  return n.productoId === movimiento.productoId
    && leerDecimal(n.cantidad).equals(movimiento.cantidadOriginal)
    && mismaUnidad
    && (n.motivo ?? null) === (registro.motivo ?? null)
    && n.nota === registro.nota;
}

/**
 * Un error al registrar el movimiento de la operación se devuelve con el MISMO código y con mensajes por campo
 * (productoId, cantidad, unidadId), para que el formulario los muestre junto a cada campo.
 */
export function errorDeOperacion(error) {
  if (error.campos) return error;
  const campos = {};
  if (error.codigo === CODIGOS.CONVERSION_NO_CONFIGURADA || error.codigo === CODIGOS.UNIDAD_INCOMPATIBLE) {
    campos.unidadId = error.message;
  } else if (error.codigo === CODIGOS.NO_ENCONTRADO) {
    campos.productoId = error.message;
  } else {
    return error;
  }
  const nuevo = new ErrorDatos(error.codigo, error.message, campos);
  if (error.disponible !== undefined) nuevo.disponible = error.disponible;
  return nuevo;
}

/** Filtros y página de listarSalidas / listarConsumos (mismas reglas de fechas que las compras). */
export const normalizarConsultaOperaciones = normalizarConsultaCompras;
