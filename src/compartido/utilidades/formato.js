// Formato de fechas y dinero para toda la interfaz.
// Fechas: siempre en hora de Costa Rica. Dinero: colones (PROVISIONAL: confirmar con el hogar).
import { aDecimal, DECIMALES_DINERO } from './decimales.js';

export const ZONA_HORARIA = 'America/Costa_Rica';
export const MONEDA = 'CRC';

const aFecha = (v) => (v instanceof Date ? v : new Date(v));

export function formatearFecha(valor) {
  const f = aFecha(valor);
  if (Number.isNaN(f.getTime())) return '';
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: ZONA_HORARIA, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(f);
}

export function formatearFechaHora(valor) {
  const f = aFecha(valor);
  if (Number.isNaN(f.getTime())) return '';
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: ZONA_HORARIA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(f);
}

export function formatearDinero(valor) {
  const exacto = aDecimal(valor).toFixed(DECIMALES_DINERO);
  return new Intl.NumberFormat('es-CR', {
    style: 'currency', currency: MONEDA, minimumFractionDigits: DECIMALES_DINERO, maximumFractionDigits: DECIMALES_DINERO,
  }).format(exacto);
}

export function formatearCantidad(valor, unidad = '') {
  const texto = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 4 }).format(aDecimal(valor).toString());
  return unidad ? `${texto} ${unidad}` : texto;
}

/** Fecha de hoy en Costa Rica como 'AAAA-MM-DD' (la usan las reglas de «fecha no futura»). */
export function hoyEnCostaRica(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

/** Muestra una fecha de calendario 'AAAA-MM-DD' como dd/mm/aaaa SIN convertir zonas horarias (es un día, no un instante). */
export function formatearFechaDia(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
