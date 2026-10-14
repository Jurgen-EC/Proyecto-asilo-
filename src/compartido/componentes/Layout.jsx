import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAutenticacion } from '../../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { MODULOS } from '../../nucleo/modulos.js';
import { useNotificaciones } from './Notificaciones.jsx';
import BannerDemo from './BannerDemo.jsx';

export default function Layout() {
  const { usuario, cerrarSesion, esDemo } = useAutenticacion();
  const notificaciones = useNotificaciones();
  const navegar = useNavigate();

  async function salir() {
    try {
      await cerrarSesion();
      navegar('/iniciar-sesion', { replace: true });
    } catch {
      notificaciones.error('No se pudo cerrar la sesión. Intentá de nuevo.');
    }
  }

  return (
    <div className="aplicacion">
      {esDemo && <BannerDemo />}
      <header className="encabezado">
        <div className="encabezado__titulo">
          <strong>Inventario de Cocina</strong>
          <span>Hogar de Ancianos Jafeth Jiménez Morales</span>
        </div>
        <div className="encabezado__usuario">
          <span>{usuario?.nombre}</span>
          <button type="button" className="boton boton--secundario" onClick={salir}>Cerrar sesión</button>
        </div>
      </header>
      <div className="cuerpo">
        <nav className="menu" aria-label="Módulos del sistema">
          <NavLink to="/" end className={({ isActive }) => `menu__enlace ${isActive ? 'menu__enlace--activo' : ''}`}>Inicio</NavLink>
          {MODULOS.map((m) =>
            m.estado === 'disponible' ? (
              <NavLink key={m.id} to={m.ruta} className={({ isActive }) => `menu__enlace ${isActive ? 'menu__enlace--activo' : ''}`}>{m.nombre}</NavLink>
            ) : (
              <span key={m.id} className="menu__enlace menu__enlace--deshabilitado" aria-disabled="true">
                {m.nombre}<small>Próximamente</small>
              </span>
            ),
          )}
        </nav>
        <main className="contenido"><Outlet /></main>
      </div>
    </div>
  );
}
