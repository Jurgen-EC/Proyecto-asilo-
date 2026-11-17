import { costoPromedioParaMostrar } from '../../nucleo/costos/index.js';
import { formatearDinero } from '../../compartido/utilidades/formato.js';

/**
 * Celda «Costo promedio». SIEMPRE pasa por el módulo aislado de costos: mientras el hogar no apruebe la fórmula muestra
 * «Pendiente de definición». Nada en el sistema presenta un promedio como oficial.
 */
export default function CostoPromedio({ historial }) {
  const r = costoPromedioParaMostrar(historial);
  if (r.pendiente) return <span className="etiqueta etiqueta--aviso">{r.texto}</span>;
  return <span>{formatearDinero(r.valor)}</span>;
}
