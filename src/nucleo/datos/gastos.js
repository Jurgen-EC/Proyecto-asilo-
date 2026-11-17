// REGLAS DE NEGOCIO DE LOS GASTOS (Versión 8: RF-012)
// Funciones puras, sin acceso a datos. Las usa el adaptador de demostración y las debe reutilizar (o replicar dentro de la
// base) cualquier adaptador real.
//
// Un gasto es un importe asociado, si se quiere, a un producto y/o a una compra. REGLA: un gasto relacionado a una compra
// (`compraId`) se identifica como RELACIONADO y NO se suma automáticamente a nada: el costo de adquisición de la compra no
// cambia. Cómo se evita contar dos veces el mismo importe se decide al aprobarse la fórmula de costos (pendiente del hogar).
import { lanzarSiHayCampos } from './productos.js';
import { esFechaValida, leerImporte, normalizarConsultaCompras } from './compras.js';
import { limpiarEspacios } from '../../compartido/utilidades/texto.js';
import { DECIMALES_DINERO } from '../../compartido/utilidades/decimales.js';

export const CONCEPTO_MIN = 3; // PROVISIONAL
export const CONCEPTO_MAX = 120;
export const NOTA_GASTO_MAX = 500;
export const CLAVE_GASTO_MAX = 80;

/** Mensaje de error de una fecha de gasto, o '' si es válida. `hoy` = 'AAAA-MM-DD' en hora de Costa Rica. */
export function mensajeFechaGasto(valor, hoy) {
  if (typeof valor !== 'string' || !valor.trim()) return 'Elegí la fecha del gasto.';
  if (!esFechaValida(valor)) return 'La fecha del gasto no es válida.';
  if (valor > hoy) return 'La fecha del gasto no puede ser futura.';
  return '';
}

const textoOpcional = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Valida y normaliza la entrada de `registrarGasto`. Lanza VALIDACION con TODOS los mensajes por campo juntos.
 * Entrada: { fechaGasto 'AAAA-MM-DD', concepto, importe, productoId?, compraId?, nota?, claveIdempotencia }.
 * El usuario, la hora de registro y el id los asigna la capa de datos. La existencia del producto y de la compra la verifica el adaptador.
 */
export function validarGasto(entrada, { hoy }) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const campos = {};

  const mFecha = mensajeFechaGasto(e.fechaGasto, hoy);
  if (mFecha) campos.fechaGasto = mFecha;

  const concepto = typeof e.concepto === 'string' ? limpiarEspacios(e.concepto) : '';
  if (!concepto) campos.concepto = 'Escribí el concepto del gasto.';
  else if (concepto.length < CONCEPTO_MIN) campos.concepto = `El concepto debe tener al menos ${CONCEPTO_MIN} caracteres.`;
  else if (concepto.length > CONCEPTO_MAX) campos.concepto = `El concepto no puede pasar de ${CONCEPTO_MAX} caracteres.`;

  let importe = null;
  if (e.importe === undefined || e.importe === null || String(e.importe).trim() === '') campos.importe = 'Escribí el importe del gasto.';
  else {
    const r = leerImporte(e.importe, 'el importe');
    if (r.mensaje) campos.importe = r.mensaje;
    else importe = r.importe.toFixed(DECIMALES_DINERO);
  }

  const productoId = textoOpcional(e.productoId);
  if (e.productoId !== undefined && e.productoId !== null && e.productoId !== '' && typeof e.productoId !== 'string') campos.productoId = 'El producto no es válido.';
  const compraId = textoOpcional(e.compraId);
  if (e.compraId !== undefined && e.compraId !== null && e.compraId !== '' && typeof e.compraId !== 'string') campos.compraId = 'La compra no es válida.';

  let nota = null;
  if (e.nota !== undefined && e.nota !== null) {
    if (typeof e.nota !== 'string') campos.nota = 'La nota debe ser texto.';
    else if (limpiarEspacios(e.nota).length > NOTA_GASTO_MAX) campos.nota = `La nota no puede pasar de ${NOTA_GASTO_MAX} caracteres.`;
    else nota = limpiarEspacios(e.nota) || null;
  }

  const claveIdempotencia = typeof e.claveIdempotencia === 'string' ? limpiarEspacios(e.claveIdempotencia) : '';
  if (!claveIdempotencia) campos.claveIdempotencia = 'Falta la clave de idempotencia de la operación.';
  else if (claveIdempotencia.length > CLAVE_GASTO_MAX) campos.claveIdempotencia = `La clave de idempotencia no puede pasar de ${CLAVE_GASTO_MAX} caracteres.`;

  lanzarSiHayCampos(campos);
  return { fechaGasto: e.fechaGasto, concepto, importe, productoId, compraId, nota, claveIdempotencia };
}

/** ¿El gasto pedido es el mismo que ya quedó registrado con esa clave? (para decidir entre repetir y rechazar) */
export function gastoCoincide(n, previo) {
  return n.fechaGasto === previo.fechaGasto && n.concepto === previo.concepto && n.importe === previo.importe
    && n.productoId === (previo.productoId ?? null) && n.compraId === (previo.compraId ?? null) && n.nota === (previo.nota ?? null);
}

/** Filtros y página de listarGastos: los de las compras (desde, hasta, productoId, pagina) más `compraId`. */
export function normalizarConsultaGastos(consulta = {}) {
  return { ...normalizarConsultaCompras(consulta), compraId: typeof consulta?.compraId === 'string' ? consulta.compraId : '' };
}
