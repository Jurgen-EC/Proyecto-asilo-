// REGLAS DE NEGOCIO DE LAS COMPRAS (Versión 5: RF-008, RF-009, RF-013, RF-026)
// Funciones puras, sin acceso a datos. Las usa el adaptador de demostración y las debe reutilizar (o replicar dentro de
// la base, en una función transaccional) cualquier adaptador real.
//
// DECISIÓN DEL EQUIPO: registrar una compra AUMENTA automáticamente el inventario. Compra e ingreso son UNA sola operación:
// no hay captura doble y no se puede duplicar. Cada línea de la compra genera exactamente un movimiento de ingreso
// (tipo 'ingreso', subtipo 'compra') por la función central registrarMovimiento, todo en una sola transacción.
import { ErrorDatos, CODIGOS } from './errores.js';
import { lanzarSiHayCampos } from './productos.js';
import { limpiarEspacios } from '../../compartido/utilidades/texto.js';
import {
  aDecimal, leerDecimal, decimalesDe, comparar, multiplicar, dividir, redondearDinero, DECIMALES_DINERO,
} from '../../compartido/utilidades/decimales.js';

export const MAX_LINEAS = 200;
export const NOTA_COMPRA_MAX = 500;
export const CLAVE_COMPRA_MAX = 80; // deja espacio para el sufijo de la clave de cada línea (ver claveDeLinea)
export const IMPORTE_MAXIMO = '999999999999.99'; // decimal(14,2)
export const TAMANO_PAGINA_COMPRAS = 20;
export const TAMANO_PAGINA_COMPRAS_MAX = 100;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿Es una fecha de calendario real en formato 'AAAA-MM-DD'? */
export function esFechaValida(valor) {
  const m = FECHA.exec(String(valor ?? ''));
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Mensaje de error de una fecha de compra, o '' si es válida. `hoy` = 'AAAA-MM-DD' en hora de Costa Rica. */
export function mensajeFechaCompra(valor, hoy) {
  if (typeof valor !== 'string' || !valor.trim()) return 'Elegí la fecha de la compra.';
  if (!esFechaValida(valor)) return 'La fecha de la compra no es válida.';
  if (valor > hoy) return 'La fecha de la compra no puede ser futura.';
  return '';
}

/** Clave de idempotencia de la línea N (1, 2, 3…) derivada de la clave de la compra. */
export const claveDeLinea = (claveCompra, indice) => `${claveCompra}:${indice + 1}`;

function leerImporte(valor, etiqueta) {
  const d = leerDecimal(valor);
  if (d === null) return { mensaje: `Escribí ${etiqueta} con números (por ejemplo 1250,75).` };
  if (comparar(d, 0) <= 0) return { mensaje: `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} debe ser mayor que cero.` };
  if (decimalesDe(d) > DECIMALES_DINERO) return { mensaje: `Usá como máximo ${DECIMALES_DINERO} decimales en ${etiqueta}.` };
  if (comparar(d, IMPORTE_MAXIMO) > 0) return { mensaje: `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} es demasiado grande.` };
  return { importe: d };
}

const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * Calcula los DOS costos de una línea a partir de uno solo: el sistema calcula el otro y guarda ambos.
 *   - costoUnitario dado: costoTotal = cantidad × costoUnitario (redondeado a 2 decimales).
 *   - costoTotal dado:   costoUnitario = costoTotal ÷ cantidad (redondeado a 2 decimales); el total escrito se conserva tal cual.
 * Devuelve { costoUnitario, costoTotal } (textos con 2 decimales) o { mensaje }. PROVISIONAL: costos mayores que cero y
 * redondeo half-up a 2 decimales (regla de redondeo pendiente con el hogar).
 */
export function calcularCostosDeLinea({ cantidad, costoUnitario, costoTotal }) {
  const hayUnitario = !vacio(costoUnitario);
  const hayTotal = !vacio(costoTotal);
  if (!hayUnitario && !hayTotal) return { mensaje: 'Escribí el costo unitario o el costo total.' };
  if (hayUnitario && hayTotal) return { mensaje: 'Escribí solo uno: el costo unitario o el costo total. El sistema calcula el otro.' };
  const c = leerDecimal(cantidad);
  if (c === null || comparar(c, 0) <= 0) return { mensaje: 'Primero escribí una cantidad válida para poder calcular el costo.' };
  if (hayUnitario) {
    const { mensaje, importe } = leerImporte(costoUnitario, 'el costo unitario');
    if (mensaje) return { mensaje };
    const total = redondearDinero(multiplicar(c, importe));
    if (comparar(total, 0) <= 0) return { mensaje: 'El costo total queda en cero. Revisá la cantidad y el costo unitario.' };
    if (comparar(total, IMPORTE_MAXIMO) > 0) return { mensaje: 'El costo total es demasiado grande.' };
    return { costoUnitario: importe.toFixed(DECIMALES_DINERO), costoTotal: total.toFixed(DECIMALES_DINERO) };
  }
  const { mensaje, importe } = leerImporte(costoTotal, 'el costo total');
  if (mensaje) return { mensaje };
  const unitario = redondearDinero(dividir(importe, c));
  if (comparar(unitario, 0) <= 0) return { mensaje: 'El costo unitario queda en cero. Revisá la cantidad y el costo total.' };
  return { costoUnitario: unitario.toFixed(DECIMALES_DINERO), costoTotal: importe.toFixed(DECIMALES_DINERO) };
}

/** Suma exacta de los costos totales de las líneas (texto con 2 decimales). */
export const totalDeLineas = (lineas) =>
  lineas.reduce((suma, l) => suma.plus(l.costoTotal), aDecimal(0)).toFixed(DECIMALES_DINERO);

/**
 * Valida y normaliza la entrada de `registrarCompra`. Lanza VALIDACION con TODOS los mensajes por campo juntos.
 * Los campos de una línea llevan su posición: `lineas.0.cantidad`, `lineas.1.costo`… (0 = primera línea).
 * Entrada: { fechaCompra 'AAAA-MM-DD', nota?, lineas: [{ productoId, unidadId | presentacionId, cantidad, costoUnitario | costoTotal }], claveIdempotencia }.
 * Si hay presentacionId, `cantidad` es el número de presentaciones (3 cajas) y no se envía unidadId.
 * La fecha de registro, el usuario y el total los asigna la capa de datos.
 */
export function validarCompra(entrada, { hoy }) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const campos = {};

  const mFecha = mensajeFechaCompra(e.fechaCompra, hoy);
  if (mFecha) campos.fechaCompra = mFecha;

  const claveIdempotencia = typeof e.claveIdempotencia === 'string' ? limpiarEspacios(e.claveIdempotencia) : '';
  if (!claveIdempotencia) campos.claveIdempotencia = 'Falta la clave de idempotencia de la compra.';
  else if (claveIdempotencia.length > CLAVE_COMPRA_MAX) campos.claveIdempotencia = `La clave de idempotencia de la compra no puede pasar de ${CLAVE_COMPRA_MAX} caracteres.`;

  let nota = null;
  if (e.nota !== undefined && e.nota !== null) {
    if (typeof e.nota !== 'string') campos.nota = 'La nota debe ser texto.';
    else if (limpiarEspacios(e.nota).length > NOTA_COMPRA_MAX) campos.nota = `La nota no puede pasar de ${NOTA_COMPRA_MAX} caracteres.`;
    else nota = limpiarEspacios(e.nota) || null;
  }

  const lineas = [];
  if (!Array.isArray(e.lineas) || e.lineas.length === 0) {
    campos.lineas = 'Agregá al menos un producto a la compra.';
  } else if (e.lineas.length > MAX_LINEAS) {
    campos.lineas = `Una compra no puede tener más de ${MAX_LINEAS} líneas.`;
  } else {
    e.lineas.forEach((l, i) => {
      const linea = l && typeof l === 'object' ? l : {};
      const clave = (campo) => `lineas.${i}.${campo}`;
      if (typeof linea.productoId !== 'string' || !linea.productoId) campos[clave('productoId')] = 'Elegí el producto.';
      const unidadId = typeof linea.unidadId === 'string' && linea.unidadId ? linea.unidadId : null;
      const presentacionId = typeof linea.presentacionId === 'string' && linea.presentacionId ? linea.presentacionId : null;
      if (!unidadId && !presentacionId) campos[clave('unidadId')] = 'Elegí la unidad o la presentación.';
      else if (unidadId && presentacionId) campos[clave('unidadId')] = 'Indicá la unidad o la presentación, no las dos.';
      const cantidad = leerDecimal(linea.cantidad);
      if (vacio(linea.cantidad)) campos[clave('cantidad')] = 'Escribí la cantidad.';
      else if (cantidad === null) campos[clave('cantidad')] = 'Escribí la cantidad con números (por ejemplo 3 o 0,5).';
      else if (comparar(cantidad, 0) <= 0) campos[clave('cantidad')] = 'La cantidad debe ser mayor que cero.';
      let costos = {};
      if (cantidad !== null && comparar(cantidad, 0) > 0) {
        costos = calcularCostosDeLinea({ cantidad: linea.cantidad, costoUnitario: linea.costoUnitario, costoTotal: linea.costoTotal });
        if (costos.mensaje) campos[clave('costo')] = costos.mensaje;
      } else if (vacio(linea.costoUnitario) && vacio(linea.costoTotal)) {
        campos[clave('costo')] = 'Escribí el costo unitario o el costo total.';
      }
      lineas.push({
        productoId: linea.productoId, unidadId, presentacionId, cantidad: cantidad ? cantidad.toFixed() : linea.cantidad,
        costoUnitario: costos.costoUnitario ?? null, costoTotal: costos.costoTotal ?? null,
      });
    });
  }

  lanzarSiHayCampos(campos);
  return { fechaCompra: e.fechaCompra, nota, claveIdempotencia, lineas };
}

/**
 * ¿La compra pedida es la misma que ya quedó registrada con esa clave? (para decidir entre repetir y rechazar).
 * `previa`: la compra guardada; `lineasPrevias`: sus líneas guardadas (en orden).
 */
export function compraCoincide(n, previa, lineasPrevias) {
  if (n.fechaCompra !== previa.fechaCompra || n.nota !== previa.nota || n.lineas.length !== lineasPrevias.length) return false;
  return n.lineas.every((l, i) => {
    const g = lineasPrevias[i];
    const mismaUnidad = l.presentacionId ? g.presentacionId === l.presentacionId : g.presentacionId === null && g.unidadId === l.unidadId;
    return l.productoId === g.productoId && mismaUnidad
      && aDecimal(l.cantidad).equals(g.cantidad)
      && aDecimal(l.costoUnitario).equals(g.costoUnitario) && aDecimal(l.costoTotal).equals(g.costoTotal);
  });
}

/**
 * Un error al registrar la línea N (0 = primera) se devuelve con el MISMO código, indicando de qué línea es:
 * mensaje «Línea 2: …» y los mensajes por campo con la posición (`lineas.1.cantidad`).
 */
export function errorDeLinea(error, indice) {
  const n = indice + 1;
  const detalle = error.message;
  const campos = {};
  if (error.campos) {
    for (const [campo, mensaje] of Object.entries(error.campos)) {
      const destino = campo === 'productoId' || campo === 'cantidad' || campo === 'unidadId' ? campo : 'cantidad';
      campos[`lineas.${indice}.${destino}`] = mensaje;
    }
  } else if (error.codigo === CODIGOS.CONVERSION_NO_CONFIGURADA || error.codigo === CODIGOS.UNIDAD_INCOMPATIBLE) {
    campos[`lineas.${indice}.unidadId`] = detalle;
  } else {
    campos[`lineas.${indice}.${/presentaci|unidad/i.test(detalle) ? 'unidadId' : 'productoId'}`] = detalle;
  }
  const nuevo = new ErrorDatos(error.codigo, `Línea ${n}: ${detalle}`, campos);
  nuevo.linea = n;
  if (error.disponible !== undefined) nuevo.disponible = error.disponible;
  return nuevo;
}

/** Filtros y página de listarCompras. Lanza VALIDACION si las fechas no son válidas o el rango está al revés. */
export function normalizarConsultaCompras({ desde = '', hasta = '', productoId = '', pagina = 1, tamanoPagina = TAMANO_PAGINA_COMPRAS } = {}) {
  const campos = {};
  if (desde && !esFechaValida(desde)) campos.desde = 'La fecha «desde» no es válida.';
  if (hasta && !esFechaValida(hasta)) campos.hasta = 'La fecha «hasta» no es válida.';
  if (!campos.desde && !campos.hasta && desde && hasta && desde > hasta) campos.hasta = 'La fecha «hasta» no puede ser anterior a «desde».';
  lanzarSiHayCampos(campos);
  return {
    desde: desde || '', hasta: hasta || '', productoId: productoId || '',
    pagina: Math.max(1, Math.floor(Number(pagina)) || 1),
    tamanoPagina: Math.min(TAMANO_PAGINA_COMPRAS_MAX, Math.max(1, Math.floor(Number(tamanoPagina)) || TAMANO_PAGINA_COMPRAS)),
  };
}
