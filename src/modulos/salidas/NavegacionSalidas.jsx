import { NavLink } from 'react-router-dom';

// Salida y consumo son conceptos DISTINTOS (cada uno con sus datos, su listado y su formulario): esta navegación los separa
// claramente dentro del módulo «Salidas y consumo».
export default function NavegacionSalidas() {
  const clase = ({ isActive }) => `subnavegacion__enlace ${isActive ? 'subnavegacion__enlace--activo' : ''}`;
  return (
    <nav className="subnavegacion" aria-label="Salidas y consumos">
      <NavLink to="/salidas" className={clase}>Salidas</NavLink>
      <NavLink to="/consumos" className={clase}>Consumos</NavLink>
    </nav>
  );
}
