import { Navigate, Route, Routes } from 'react-router-dom';
import PaginaReporteInventario from './PaginaReporteInventario.jsx';
import PaginaReporteCompras from './PaginaReporteCompras.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas del módulo (Versión 9), todas de solo lectura: /reportes (lleva al de inventario), /reportes/inventario y /reportes/compras
export default function ModuloReportes() {
  return (
    <Routes>
      <Route index element={<Navigate to="inventario" replace />} />
      <Route path="inventario" element={<PaginaReporteInventario />} />
      <Route path="compras" element={<PaginaReporteCompras />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
