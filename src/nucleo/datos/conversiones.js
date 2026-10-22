// REGLAS DE LAS CONVERSIONES ENTRE UNIDADES Y LA FUNCIÓN CENTRAL convertir (Versión 3, RF-007)
// Funciones puras, sin acceso a datos: las usa el adaptador demo y las debe reutilizar cualquier adaptador real.
//
// Una conversión dice: 1 <unidad origen> = <factor> <unidad destino>. Es GENERAL (productoId nulo, sirve para
// todos los productos y solo entre unidades que miden lo mismo) o de UN PRODUCTO (puede cruzar dimensiones,
// por ejemplo 1 litro de aceite = 0,92 kg). Una fila sirve en los dos sentidos: la inversa se deduce (1 / factor).
// NUNCA se asume una equivalencia: si no está configurada, se lanza un error.
import { ErrorDatos, ConversionNoConfigurada, CODIGOS } from './errores.js';
import {
  leerDecimal, decimalesDe, comparar, multiplicar, dividir, redondear, aDecimal, DECIMALES_CANTIDAD,
} from '../../compartido/utilidades/decimales.js';

export const DECIMALES_FACTOR = 6; // decimal(18,6)
const FACTOR_MAXIMO = '999999999999';
const CANTIDAD_MAXIMA = '9999999999.9999';

/** Valida el factor escrito por una persona. Devuelve { factor } en texto exacto o { mensaje }. */
export function leerFactor(valor) {
  const d = leerDecimal(valor);
  if (d === null) return { mensaje: 'Escribí el factor con números (por ejemplo 1000 o 0,92).' };
  if (comparar(d, 0) <= 0) return { mensaje: 'El factor debe ser mayor que cero.' };
  if (decimalesDe(d) > DECIMALES_FACTOR) return { mensaje: `Usá como máximo ${DECIMALES_FACTOR} decimales.` };
  if (comparar(d, FACTOR_MAXIMO) > 0) return { mensaje: 'El factor es demasiado grande.' };
  return { factor: d.toFixed() };
}

function mensajeUnidad(id, unidades, obligatorio) {
  if (typeof id !== 'string' || !id) return obligatorio;
  const u = unidades.find((x) => x.id === id);
  if (!u) return 'La unidad elegida no existe.';
  if (!u.activo) return 'La unidad elegida está inactiva. Elegí otra o activala primero.';
  return '';
}

/** Valida una conversión nueva. `productoId` nulo = general. Lanza VALIDACION con los mensajes por campo juntos. */
export function validarConversion({ unidadOrigenId, unidadDestinoId, factor } = {}, unidades, { productoId = null } = {}) {
  const campos = {};
  const mOrigen = mensajeUnidad(unidadOrigenId, unidades, 'Elegí la unidad de origen.');
  const mDestino = mensajeUnidad(unidadDestinoId, unidades, 'Elegí la unidad de destino.');
  if (mOrigen) campos.unidadOrigenId = mOrigen;
  if (mDestino) campos.unidadDestinoId = mDestino;
  if (!mOrigen && !mDestino) {
    if (unidadOrigenId === unidadDestinoId) {
      campos.unidadDestinoId = 'La unidad de destino tiene que ser distinta de la de origen.';
    } else if (productoId === null) {
      const o = unidades.find((u) => u.id === unidadOrigenId);
      const d = unidades.find((u) => u.id === unidadDestinoId);
      if (o.dimension !== d.dimension) {
        campos.unidadDestinoId = 'Una equivalencia general solo puede ser entre unidades que miden lo mismo. Para masa ↔ volumen, configurala dentro del producto.';
      }
    }
  }
  const { mensaje, factor: factorLimpio } = leerFactor(factor);
  if (mensaje) campos.factor = mensaje;
  const primero = Object.values(campos)[0];
  if (primero) throw new ErrorDatos(CODIGOS.VALIDACION, primero, campos);
  return { unidadOrigenId, unidadDestinoId, factor: factorLimpio };
}

/** Otra conversión VIGENTE del mismo alcance (producto o general) entre el mismo par de unidades, en cualquier sentido. */
export function detectarConversionDuplicada(conversiones, productoId, unidadAId, unidadBId) {
  return conversiones.find((c) => c.vigente && c.productoId === productoId
    && ((c.unidadOrigenId === unidadAId && c.unidadDestinoId === unidadBId)
      || (c.unidadOrigenId === unidadBId && c.unidadDestinoId === unidadAId))) ?? null;
}

export function errorConversionDuplicada() {
  const mensaje = 'Ya existe una equivalencia vigente entre esas unidades. Para cambiarla, cambiá su factor.';
  return new ErrorDatos(CODIGOS.VALIDACION, mensaje, { unidadDestinoId: mensaje });
}

export function errorFactorSinCambio() {
  const mensaje = 'El factor es el mismo que el actual.';
  return new ErrorDatos(CODIGOS.VALIDACION, mensaje, { factor: mensaje });
}

/**
 * Busca la equivalencia VIGENTE entre dos unidades: primero la del producto, luego la general.
 * Devuelve { factor: Decimal, conversionId } o null. Si la fila está en sentido contrario, el factor es 1 / factor.
 */
export function buscarEquivalencia(conversiones, productoId, origenId, destinoId) {
  for (const alcance of [productoId, null]) {
    for (const c of conversiones) {
      if (!c.vigente || c.productoId !== alcance) continue;
      if (c.unidadOrigenId === origenId && c.unidadDestinoId === destinoId) return { factor: aDecimal(c.factor), conversionId: c.id };
      if (c.unidadOrigenId === destinoId && c.unidadDestinoId === origenId) return { factor: dividir(1, c.factor), conversionId: c.id };
    }
    if (alcance === null) break;
  }
  return null;
}

function errorCantidad(mensaje) {
  return new ErrorDatos(CODIGOS.VALIDACION, mensaje, { cantidad: mensaje });
}

/** Resuelve un extremo: { unidadId } o { presentacionId } -> { unidadId, vecesUnidad (Decimal), presentacionId }. */
function resolverExtremo(extremo, { productoId, unidades, presentaciones, nombre }) {
  if (typeof extremo === 'string') extremo = { unidadId: extremo };
  if (extremo?.presentacionId) {
    const p = presentaciones.find((x) => x.id === extremo.presentacionId);
    if (!p || p.productoId !== productoId) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO, 'La presentación no existe para este producto.');
    if (!p.activo) throw new ErrorDatos(CODIGOS.VALIDACION, 'La presentación está inactiva.', { [nombre]: 'La presentación está inactiva.' });
    return { unidadId: p.unidadId, vecesUnidad: aDecimal(p.cantidadContenida), presentacionId: p.id };
  }
  if (!extremo?.unidadId || !unidades.some((u) => u.id === extremo.unidadId)) {
    throw new ErrorDatos(CODIGOS.NO_ENCONTRADO, 'La unidad no existe.');
  }
  return { unidadId: extremo.unidadId, vecesUnidad: aDecimal(1), presentacionId: null };
}

/**
 * FUNCIÓN CENTRAL de conversión. Convierte `cantidad` desde `origen` hasta `destino` para un producto.
 * origen y destino: id de unidad, { unidadId } o { presentacionId } (ej.: 3 cajas de 12 unidades -> 36 unidades).
 * Devuelve { cantidad (texto, 4 decimales máx.), factor (texto, el aplicado en total), conversionId, redondeado,
 *            presentacionOrigenId, presentacionDestinoId }.
 * Errores: ConversionNoConfigurada (no hay equivalencia), UNIDAD_INCOMPATIBLE (dimensiones distintas sin equivalencia
 * del producto), VALIDACION (cantidad), NO_ENCONTRADO.
 */
export function convertirCantidad({ productoId, cantidad, origen, destino, unidades, presentaciones, conversiones }) {
  const c = leerDecimal(cantidad);
  if (c === null) throw errorCantidad('Escribí la cantidad con números (por ejemplo 3 o 0,5).');
  if (comparar(c, 0) <= 0) throw errorCantidad('La cantidad debe ser mayor que cero.');
  if (comparar(c, CANTIDAD_MAXIMA) > 0) throw errorCantidad('La cantidad es demasiado grande.');

  const de = resolverExtremo(origen, { productoId, unidades, presentaciones, nombre: 'origen' });
  const a = resolverExtremo(destino, { productoId, unidades, presentaciones, nombre: 'destino' });

  let factorUnidades = aDecimal(1);
  let conversionId = null;
  if (de.unidadId !== a.unidadId) {
    const eq = buscarEquivalencia(conversiones, productoId, de.unidadId, a.unidadId);
    if (!eq) {
      const uo = unidades.find((u) => u.id === de.unidadId);
      const ud = unidades.find((u) => u.id === a.unidadId);
      if (uo.dimension !== ud.dimension) throw new ErrorDatos(CODIGOS.UNIDAD_INCOMPATIBLE);
      throw new ConversionNoConfigurada();
    }
    factorUnidades = eq.factor;
    conversionId = eq.conversionId;
  }
  // factor total = (contenido de la presentación de origen) × (equivalencia entre unidades) ÷ (contenido de la de destino)
  const factor = dividir(multiplicar(de.vecesUnidad, factorUnidades), a.vecesUnidad);
  const exacto = multiplicar(c, factor);
  const resultado = redondear(exacto, DECIMALES_CANTIDAD);
  return {
    cantidad: resultado.toFixed(),
    factor: factor.toFixed(),
    conversionId,
    redondeado: !resultado.equals(exacto),
    presentacionOrigenId: de.presentacionId,
    presentacionDestinoId: a.presentacionId,
  };
}
