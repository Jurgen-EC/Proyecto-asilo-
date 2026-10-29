import { Route, Routes } from 'react-router-dom';
import PaginaListaCompras from './PaginaListaCompras.jsx';
import PaginaDetalleCompra from './PaginaDetalleCompra.jsx';
import PaginaNuevaCompra from './PaginaNuevaCompra.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas del módulo (Versión 5): /compras, /compras/nueva, /compras/:id
export default function ModuloCompras() {
  return (
    <Routes>
      <Route index element={<PaginaListaCompras />} />
      <Route path="nueva" element={<PaginaNuevaCompra />} />
      <Route path=":id" element={<PaginaDetalleCompra />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
