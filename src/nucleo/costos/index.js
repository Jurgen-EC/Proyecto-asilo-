// MÓDULO AISLADO DE COSTOS (Versión 8)
//
// El COSTO PROMEDIO está BLOQUEADO (RF-027, RF-028, RF-029): depende de una fórmula que el hogar todavía NO aprobó.
// Este módulo deja esa lógica AISLADA y lista: cuando el hogar apruebe la fórmula, se implementa AQUÍ (y solo aquí) y las
// pantallas que ya la llaman empiezan a mostrar el valor sin cambiar nada más.
//
// NO asumir promedio ponderado, promedio simple, último costo ni costo por unidad base. Nada en el sistema presenta un
// promedio como oficial: hasta entonces la interfaz dice «Pendiente de definición».
//
// El historial de costos de adquisición (lo que costó cada línea de compra) es información REAL y se muestra tal cual, sin
// rotularla como promedio y sin promediarla.

export const TEXTO_COSTO_PENDIENTE = 'Pendiente de definición';

/** Se lanza mientras el hogar no apruebe la fórmula del costo promedio. */
export class FormulaPendiente extends Error {
  constructor(mensaje = 'La fórmula del costo promedio está pendiente de aprobación del hogar.') {
    super(mensaje);
    this.name = 'FormulaPendiente';
    this.codigo = 'FORMULA_PENDIENTE';
  }
}

/**
 * Costo promedio de un producto. BLOQUEADO: siempre lanza `FormulaPendiente`.
 * `historial`: las líneas de compra del producto (lo que una fórmula aprobada necesitaría).
 */
// eslint-disable-next-line no-unused-vars
export function calcularCostoPromedio(historial) {
  throw new FormulaPendiente();
}

/**
 * Lo que la pantalla muestra en la columna «Costo promedio»: el valor si algún día existe la fórmula, o «Pendiente de definición».
 * La pantalla SIEMPRE pasa por aquí: así, al aprobarse la fórmula, solo cambia `calcularCostoPromedio`.
 */
export function costoPromedioParaMostrar(historial) {
  try {
    return { pendiente: false, valor: calcularCostoPromedio(historial) };
  } catch (error) {
    if (error instanceof FormulaPendiente) return { pendiente: true, texto: TEXTO_COSTO_PENDIENTE };
    throw error;
  }
}

/**
 * ¿Está cerrado el período al que pertenece un día ('AAAA-MM-DD')? El costo de un consumo solo se puede editar mientras NO haya cierre.
 * El «cierre» todavía NO existe como concepto (se define con los reportes mensuales, V9 y V10): por ahora ningún período está cerrado.
 */
// eslint-disable-next-line no-unused-vars
export function periodoCerrado(dia) {
  return false;
}
