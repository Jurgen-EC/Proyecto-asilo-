import { Navigate, Route, Routes } from 'react-router-dom';
import RutaProtegida from './nucleo/autenticacion/RutaProtegida.jsx';
import Layout from './compartido/componentes/Layout.jsx';
import PaginaInicio from './modulos/inicio/PaginaInicio.jsx';
import PaginaIniciarSesion from './modulos/autenticacion/PaginaIniciarSesion.jsx';
import NoEncontrado from './modulos/NoEncontrado.jsx';
import ModuloProductos from './modulos/productos/ModuloProductos.jsx';

// Aquí se registran las rutas de cada módulo al construirlo (Versión 3 en adelante).
export default function App() {
  return (
    <Routes>
      <Route path="/iniciar-sesion" element={<PaginaIniciarSesion />} />
      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          <Route index element={<PaginaInicio />} />
          <Route path="productos/*" element={<ModuloProductos />} />
        </Route>
      </Route>
      <Route path="/inicio" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
