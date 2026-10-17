import { Route, Routes } from 'react-router-dom';
import PaginaListaProductos from './PaginaListaProductos.jsx';
import PaginaFormularioProducto from './PaginaFormularioProducto.jsx';
import PaginaDetalleProducto from './PaginaDetalleProducto.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas del módulo (Versión 2): /productos, /productos/nuevo, /productos/:id, /productos/:id/editar
export default function ModuloProductos() {
  return (
    <Routes>
      <Route index element={<PaginaListaProductos />} />
      <Route path="nuevo" element={<PaginaFormularioProducto />} />
      <Route path=":id" element={<PaginaDetalleProducto />} />
      <Route path=":id/editar" element={<PaginaFormularioProducto />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
