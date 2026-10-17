import { Link } from 'react-router-dom';
import { MODULOS } from '../../nucleo/modulos.js';
import { useAutenticacion } from '../../nucleo/autenticacion/ContextoAutenticacion.jsx';

export default function PaginaInicio() {
  const { usuario } = useAutenticacion();
  return (
    <section>
      <h1>Inicio</h1>
      <p className="texto-suave">Bienvenido, {usuario?.nombre}. Los módulos se irán habilitando en cada versión del sistema.</p>
      <div className="tarjetas">
        {MODULOS.map((m) => {
          const disponible = m.estado === 'disponible';
          const cuerpo = (
            <>
              <h2>{m.nombre}</h2>
              <p>{m.descripcion}</p>
              {!disponible && <span className="etiqueta">Próximamente · Versión {m.version}</span>}
            </>
          );
          return disponible ? (
            <Link key={m.id} to={m.ruta} className="tarjeta tarjeta--enlace">{cuerpo}</Link>
          ) : (
            <article key={m.id} className="tarjeta tarjeta--deshabilitada" aria-disabled="true">{cuerpo}</article>
          );
        })}
      </div>
    </section>
  );
}
