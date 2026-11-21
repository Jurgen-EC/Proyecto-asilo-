import { NavLink } from 'react-router-dom';

// Los reportes mensuales disponibles. Se agregan más en las versiones siguientes (gastos, consumo y costos).
export default function NavegacionReportes() {
  const clase = ({ isActive }) => `subnavegacion__enlace ${isActive ? 'subnavegacion__enlace--activo' : ''}`;
  return (
    <nav className="subnavegacion no-imprimir" aria-label="Reportes mensuales">
      <NavLink to="/reportes/inventario" className={clase}>Inventario</NavLink>
      <NavLink to="/reportes/compras" className={clase}>Compras</NavLink>
    </nav>
  );
}
