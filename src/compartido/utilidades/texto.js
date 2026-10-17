// Normalización de texto para comparar nombres y buscar.
// Dos niveles, a propósito:
//  - normalizarNombre: para la UNICIDAD de nombres. Minúsculas, sin tildes, espacios
//    colapsados. Conserva la ñ como letra propia (piña y pina son productos distintos).
//    PROVISIONAL: confirmar con el hogar.
//  - normalizarBusqueda: para el BUSCADOR. Además trata la ñ como n, para que quien
//    escribe "pina" encuentre "Piña".

/** Quita espacios al inicio y al final y colapsa los espacios internos repetidos. */
export function limpiarEspacios(valor) {
  return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizarNombre(valor) {
  return limpiarEspacios(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/n\u0303/g, '\u00f1') // conserva la ñ
    .replace(/[\u0300-\u036f]/g, '') // quita las demás marcas (tildes, diéresis)
    .normalize('NFC');
}

export function normalizarBusqueda(valor) {
  return normalizarNombre(valor).replace(/\u00f1/g, 'n');
}
