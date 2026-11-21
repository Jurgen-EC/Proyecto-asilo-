import { formatearCantidad } from '../../compartido/utilidades/formato.js';

/** «+7 kg», «−1 kg» o «0 kg»: el signo deja claro si suma o resta. */
export function conSigno(valor, abreviatura) {
  if (String(valor).startsWith('-')) return `−${formatearCantidad(String(valor).slice(1), abreviatura)}`;
  return Number(valor) === 0 ? formatearCantidad(valor, abreviatura) : `+${formatearCantidad(valor, abreviatura)}`;
}

/** Dirección de una lista (historial o compras) con el mismo producto y período del reporte: sirve para comprobar un total. */
export function enlaceA(ruta, { productoId, desde, hasta, extra = {} } = {}) {
  const p = new URLSearchParams();
  if (productoId) p.set('producto', productoId);
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  for (const [clave, valor] of Object.entries(extra)) p.set(clave, valor);
  const texto = p.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}
