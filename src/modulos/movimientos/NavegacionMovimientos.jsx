import { NavLink } from 'react-router-dom';

// Las vistas del módulo «Movimientos». Ingresos y Salidas son subconjuntos del historial completo («Todos»).
export default function NavegacionMovimientos() {
  const clase = ({ isActive }) => `subnavegacion__enlace ${isActive ? 'subnavegacion__enlace--activo' : ''}`;
  return (
    <nav className="subnavegacion" aria-label="Vistas de movimientos">
      <NavLink to="/movimientos" end className={clase}>Todos</NavLink>
      <NavLink to="/movimientos/ingresos" className={clase}>Ingresos</NavLink>
      <NavLink to="/movimientos/salidas" className={clase}>Salidas</NavLink>
      <NavLink to="/movimientos/consolidado" className={clase}>Consolidado</NavLink>
    </nav>
  );
}
