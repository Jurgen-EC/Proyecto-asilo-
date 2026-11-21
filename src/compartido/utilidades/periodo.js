import { hoyEnCostaRica } from './formato.js';

// Períodos mensuales: un mes se escribe 'AAAA-MM' (por ejemplo '2026-03'). «Hoy» siempre es el de Costa Rica.
export const NOMBRES_DE_MESES = Object.freeze([
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]);
const dosDigitos = (n) => String(n).padStart(2, '0');

export const esMesValido = (mes) => typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);

/** El mes de hoy ('AAAA-MM'), según la fecha de Costa Rica. */
export const mesDeHoy = (hoy = hoyEnCostaRica()) => hoy.slice(0, 7);

/** El mes que está `desplazamiento` meses antes (negativo) o después (positivo) de `mes`. */
export function desplazarMes(mes, desplazamiento) {
  const [anio, numero] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(anio, numero - 1 + desplazamiento, 1));
  return `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}`;
}

/** «marzo de 2026», o '' si el mes no es válido. */
export function nombreDelMes(mes) {
  if (!esMesValido(mes)) return '';
  const [anio, numero] = mes.split('-');
  return `${NOMBRES_DE_MESES[Number(numero) - 1]} de ${anio}`;
}

/** Primer y último día del mes, como 'AAAA-MM-DD'. */
export function rangoDeMes(mes) {
  const [anio, numero] = mes.split('-').map(Number);
  return { desde: `${mes}-01`, hasta: `${mes}-${dosDigitos(new Date(Date.UTC(anio, numero, 0)).getUTCDate())}` };
}
