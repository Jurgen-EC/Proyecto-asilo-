import { Link } from 'react-router-dom';

export default function NoEncontrado() {
  return (
    <div className="pagina-centrada">
      <h1>Página no encontrada</h1>
      <p>La dirección que buscás no existe o todavía no está disponible.</p>
      <Link className="boton" to="/">Volver al inicio</Link>
    </div>
  );
}
