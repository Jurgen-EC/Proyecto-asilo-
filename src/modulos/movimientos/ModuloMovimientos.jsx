import { Route, Routes } from 'react-router-dom';
import PaginaMovimientos from './PaginaMovimientos.jsx';
import PaginaDetalleMovimiento from './PaginaDetalleMovimiento.jsx';
import PaginaConsolidado from './PaginaConsolidado.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas del módulo (Versión 7), todas de solo lectura:
//   /movimientos (historial completo), /movimientos/ingresos, /movimientos/salidas, /movimientos/consolidado y /movimientos/:id (detalle)
export default function ModuloMovimientos() {
  return (
    <Routes>
      <Route index element={<PaginaMovimientos vista="todos" />} />
      <Route path="ingresos" element={<PaginaMovimientos vista="ingreso" />} />
      <Route path="salidas" element={<PaginaMovimientos vista="salida" />} />
      <Route path="consolidado" element={<PaginaConsolidado />} />
      <Route path=":id" element={<PaginaDetalleMovimiento />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
