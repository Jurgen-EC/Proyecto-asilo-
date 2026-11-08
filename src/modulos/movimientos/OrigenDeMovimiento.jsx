import { Link } from 'react-router-dom';
import { ETIQUETAS_ORIGEN } from './textos.js';

// Origen de un movimiento en una sola palabra: la compra tiene su propia pantalla de detalle, así que se enlaza.
export default function OrigenDeMovimiento({ referencia }) {
  if (!referencia) return <span className="texto-suave">—</span>;
  const nombre = ETIQUETAS_ORIGEN[referencia.tipo] ?? referencia.tipo;
  if (referencia.tipo === 'compra') return <Link to={`/compras/${referencia.id}`}>{nombre}</Link>;
  return <span>{nombre}</span>;
}
