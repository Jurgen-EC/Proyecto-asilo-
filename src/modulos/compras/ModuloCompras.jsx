import { Route, Routes } from 'react-router-dom';
import PaginaListaCompras from './PaginaListaCompras.jsx';
import PaginaDetalleCompra from './PaginaDetalleCompra.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas del módulo (Versión 5): /compras, /compras/:id  (/compras/nueva se agrega con el formulario)
export default function ModuloCompras() {
  return (
    <Routes>
      <Route index element={<PaginaListaCompras />} />
      <Route path=":id" element={<PaginaDetalleCompra />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
