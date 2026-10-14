import { MODULOS } from '../../nucleo/modulos.js';
import { useAutenticacion } from '../../nucleo/autenticacion/ContextoAutenticacion.jsx';

export default function PaginaInicio() {
  const { usuario } = useAutenticacion();
  return (
    <section>
      <h1>Inicio</h1>
      <p className="texto-suave">Bienvenido, {usuario?.nombre}. Los módulos se irán habilitando en cada versión del sistema.</p>
      <div className="tarjetas">
        {MODULOS.map((m) => (
          <article key={m.id} className={`tarjeta ${m.estado !== 'disponible' ? 'tarjeta--deshabilitada' : ''}`} aria-disabled={m.estado !== 'disponible'}>
            <h2>{m.nombre}</h2>
            <p>{m.descripcion}</p>
            {m.estado !== 'disponible' && <span className="etiqueta">Próximamente · Versión {m.version}</span>}
          </article>
        ))}
      </div>
    </section>
  );
}
