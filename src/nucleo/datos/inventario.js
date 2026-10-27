// REGLAS DEL NÚCLEO DE MOVIMIENTOS Y EXISTENCIAS (Versión 4: RF-016 a RF-018, RF-040 a RF-043)
// Funciones puras, sin acceso a datos. Las usa el adaptador de demostración y las debe reutilizar
// (o replicar dentro de la base, en una función transaccional) cualquier adaptador real.
//
// IDEA CENTRAL: `registrarMovimiento` es la ÚNICA forma de cambiar existencias. Registra el movimiento y
// actualiza la existencia en UNA sola transacción; si algo falla, no queda nada guardado.
import { ErrorDatos, CODIGOS } from './errores.js';
import { lanzarSiHayCampos } from './productos.js';
import { limpiarEspacios } from '../../compartido/utilidades/texto.js';
import { aDecimal, leerDecimal, multiplicar, comparar } from '../../compartido/utilidades/decimales.js';
import { formatearCantidad } from '../../compartido/utilidades/formato.js';

export const TIPOS_MOVIMIENTO = Object.freeze(['ingreso', 'salida', 'ajuste']);
// PROVISIONAL: qué subtipos admite cada tipo. La V5 usa compra; la V6, salida_general y consumo; la V12, ajuste_conteo y anulacion.
export const SUBTIPOS_POR_TIPO = Object.freeze({
  ingreso: Object.freeze(['compra', 'inventario_inicial']),
  salida: Object.freeze(['salida_general', 'consumo']),
  ajuste: Object.freeze(['ajuste_conteo', 'anulacion']),
});
export const NOTA_MAX = 500;
export const CLAVE_MAX = 100;
export const REFERENCIA_MAX = 100;

/** Clave de idempotencia nueva: una por intento de operación del usuario (se reutiliza al reintentar). */
export function generarClaveIdempotencia() {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const textoOpcional = (v) => (typeof v === 'string' && limpiarEspacios(v) ? limpiarEspacios(v) : null);

/**
 * Valida y normaliza la entrada de `registrarMovimiento`. Lanza VALIDACION con todos los mensajes por campo juntos.
 * Entrada: { productoId, tipo, subtipo, cantidad, unidadId | presentacionId, sentido (solo ajustes),
 *            referenciaTipo, referenciaId, nota, claveIdempotencia }.
 * La fecha, la hora y el usuario NO se reciben: los asigna la capa de datos.
 */
export function validarEntradaMovimiento(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const campos = {};

  if (typeof e.productoId !== 'string' || !e.productoId) campos.productoId = 'Elegí el producto.';

  const tipoValido = TIPOS_MOVIMIENTO.includes(e.tipo);
  if (!tipoValido) campos.tipo = 'El tipo de movimiento no es válido.';
  else if (!SUBTIPOS_POR_TIPO[e.tipo].includes(e.subtipo)) campos.subtipo = 'El subtipo no corresponde a ese tipo de movimiento.';

  // El sentido lo fija el tipo: ingreso suma, salida resta. Un ajuste debe indicarlo (PROVISIONAL, lo afina la V12).
  let sentido = null;
  if (e.tipo === 'ingreso') sentido = 1;
  else if (e.tipo === 'salida') sentido = -1;
  else if (e.tipo === 'ajuste') {
    if (e.sentido === 1 || e.sentido === -1) sentido = e.sentido;
    else campos.sentido = 'Un ajuste debe indicar si suma (1) o resta (-1).';
  }

  const unidadId = typeof e.unidadId === 'string' && e.unidadId ? e.unidadId : null;
  const presentacionId = typeof e.presentacionId === 'string' && e.presentacionId ? e.presentacionId : null;
  if (!unidadId && !presentacionId) campos.unidadId = 'Elegí la unidad de la cantidad.';
  else if (unidadId && presentacionId) campos.unidadId = 'Indicá la unidad o la presentación, no las dos.';

  if (e.cantidad === undefined || e.cantidad === null || String(e.cantidad).trim() === '') campos.cantidad = 'Escribí la cantidad.';

  const claveIdempotencia = typeof e.claveIdempotencia === 'string' ? limpiarEspacios(e.claveIdempotencia) : '';
  if (!claveIdempotencia) campos.claveIdempotencia = 'Falta la clave de idempotencia de la operación.';
  else if (claveIdempotencia.length > CLAVE_MAX) campos.claveIdempotencia = `La clave de idempotencia no puede pasar de ${CLAVE_MAX} caracteres.`;

  const nota = textoOpcional(e.nota);
  if (e.nota !== undefined && e.nota !== null && typeof e.nota !== 'string') campos.nota = 'La nota debe ser texto.';
  else if (nota && nota.length > NOTA_MAX) campos.nota = `La nota no puede pasar de ${NOTA_MAX} caracteres.`;

  const referenciaTipo = textoOpcional(e.referenciaTipo);
  const referenciaId = textoOpcional(e.referenciaId);
  if (Boolean(referenciaTipo) !== Boolean(referenciaId)) campos.referenciaId = 'Indicá el tipo y el identificador de la referencia juntos.';
  else if ((referenciaTipo?.length ?? 0) > REFERENCIA_MAX || (referenciaId?.length ?? 0) > REFERENCIA_MAX) {
    campos.referenciaId = `La referencia no puede pasar de ${REFERENCIA_MAX} caracteres.`;
  }

  lanzarSiHayCampos(campos);
  return {
    productoId: e.productoId, tipo: e.tipo, subtipo: e.subtipo, sentido, cantidad: e.cantidad,
    unidadId, presentacionId, referenciaTipo, referenciaId, nota, claveIdempotencia,
  };
}

/** ¿La operación pedida es la misma que ya quedó registrada con esa clave? (para decidir entre repetir y rechazar) */
export function entradaCoincideConMovimiento(n, m) {
  const mismaCantidad = leerDecimal(n.cantidad)?.equals(m.cantidadOriginal) ?? false;
  const mismaUnidad = n.presentacionId
    ? m.presentacionOriginalId === n.presentacionId
    : m.presentacionOriginalId === null && m.unidadOriginalId === n.unidadId;
  return n.productoId === m.productoId && n.tipo === m.tipo && n.subtipo === m.subtipo && n.sentido === m.sentido
    && mismaCantidad && mismaUnidad
    && n.referenciaTipo === m.referenciaTipo && n.referenciaId === m.referenciaId && n.nota === m.nota;
}

export function errorClaveReutilizada() {
  return new ErrorDatos(
    CODIGOS.OPERACION_DUPLICADA,
    'Esa clave de idempotencia ya se usó para otra operación distinta. Generá una clave nueva para una operación nueva.',
  );
}

/** Salida (o ajuste negativo) mayor que la existencia: se rechaza sin cambiar nada y se informa lo disponible. */
export function errorExistenciaInsuficiente({ nombre, disponible, abreviatura }) {
  const mensaje = `No hay cantidad suficiente de «${nombre}». Disponible: ${formatearCantidad(disponible, abreviatura)}.`;
  const error = new ErrorDatos(CODIGOS.VALIDACION, mensaje, { cantidad: mensaje });
  error.disponible = aDecimal(disponible).toFixed(); // texto decimal, en la unidad base del producto
  return error;
}

/** Nueva existencia = existencia actual + sentido × cantidad base. Nunca puede quedar negativa. */
export function aplicarMovimiento(existenciaActual, sentido, cantidadBase) {
  return aDecimal(existenciaActual).plus(multiplicar(sentido, cantidadBase));
}

export const esNegativa = (valor) => comparar(valor, 0) < 0;

/**
 * Compara la suma de los movimientos contra la existencia guardada de cada producto.
 * `movimientos`: [{ productoId, sentido, cantidadBase }]; `existencias`: [{ productoId, cantidadBase }].
 */
export function calcularConsistencia(movimientos, existencias) {
  const sumas = new Map();
  for (const m of movimientos) {
    sumas.set(m.productoId, (sumas.get(m.productoId) ?? aDecimal(0)).plus(multiplicar(m.sentido, m.cantidadBase)));
  }
  const guardadas = new Map(existencias.map((x) => [x.productoId, aDecimal(x.cantidadBase)]));
  const ids = new Set([...sumas.keys(), ...guardadas.keys()]);
  const discrepancias = [];
  for (const id of ids) {
    const calculada = sumas.get(id) ?? aDecimal(0);
    const guardada = guardadas.get(id) ?? null;
    if (guardada === null || !calculada.equals(guardada) || guardada.isNegative()) {
      discrepancias.push({
        productoId: id,
        existenciaGuardada: guardada === null ? null : guardada.toFixed(),
        existenciaCalculada: calculada.toFixed(),
      });
    }
  }
  return { consistente: discrepancias.length === 0, productosRevisados: ids.size, movimientosRevisados: movimientos.length, discrepancias };
}
