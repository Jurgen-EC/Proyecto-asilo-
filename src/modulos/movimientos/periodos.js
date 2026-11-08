import { hoyEnCostaRica } from '../../compartido/utilidades/formato.js';

const dosDigitos = (n) => String(n).padStart(2, '0');
const comoDia = (d) => `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`;

/**
 * Primer y último día de un mes, como 'AAAA-MM-DD'. `desplazamiento`: 0 = este mes, -1 = el mes anterior
 * (según el día de hoy en Costa Rica).
 */
export function rangoDelMes(desplazamiento = 0, hoy = hoyEnCostaRica()) {
  const [anio, mes] = hoy.split('-').map(Number);
  return {
    desde: comoDia(new Date(Date.UTC(anio, mes - 1 + desplazamiento, 1))),
    hasta: comoDia(new Date(Date.UTC(anio, mes + desplazamiento, 0))),
  };
}
