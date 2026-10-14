import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAutenticacion } from './ContextoAutenticacion.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';

// NOTA DE SEGURIDAD: esta protección es solo de interfaz. Cuando exista la base de
// datos real, los permisos también se verifican en la capa de datos / servidor (Versión 18).
export default function RutaProtegida() {
  const { usuario, cargando } = useAutenticacion();
  const ubicacion = useLocation();
  if (cargando) return <Cargando mensaje="Verificando sesión…" />;
  if (!usuario) return <Navigate to="/iniciar-sesion" replace state={{ desde: ubicacion.pathname }} />;
  return <Outlet />;
}
