import { NavLink } from 'react-router-dom';

// Gastos y costos de adquisición son pantallas distintas del mismo módulo: esta navegación las separa claramente.
export default function NavegacionCostos() {
  const clase = ({ isActive }) => `subnavegacion__enlace ${isActive ? 'subnavegacion__enlace--activo' : ''}`;
  return (
    <nav className="subnavegacion" aria-label="Gastos y costos">
      <NavLink to="/gastos" className={clase}>Gastos</NavLink>
      <NavLink to="/costos" className={clase}>Costos de adquisición</NavLink>
    </nav>
  );
}
