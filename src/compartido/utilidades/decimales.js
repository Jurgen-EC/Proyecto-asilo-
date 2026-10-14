// Cálculo con decimales exactos. NUNCA usar números flotantes (0.1 + 0.2) para
// dinero o cantidades. Toda cantidad y todo importe del sistema pasa por aquí.
import Decimal from 'decimal.js';

export const DECIMALES_CANTIDAD = 4; // PROVISIONAL: confirmar con el hogar
export const DECIMALES_DINERO = 2;
export const MODO_REDONDEO = Decimal.ROUND_HALF_UP; // PROVISIONAL: regla de redondeo pendiente

Decimal.set({ precision: 28, rounding: MODO_REDONDEO });

export const aDecimal = (v) => (v instanceof Decimal ? v : new Decimal(v));
export const sumar = (a, b) => aDecimal(a).plus(b);
export const restar = (a, b) => aDecimal(a).minus(b);
export const multiplicar = (a, b) => aDecimal(a).times(b);
export const dividir = (a, b) => aDecimal(a).div(b);
export const comparar = (a, b) => aDecimal(a).comparedTo(b); // -1, 0 o 1
export const redondear = (v, decimales = DECIMALES_CANTIDAD) =>
  aDecimal(v).toDecimalPlaces(decimales, MODO_REDONDEO);
export const redondearDinero = (v) => redondear(v, DECIMALES_DINERO);
export { Decimal };
