import { Route, Routes } from 'react-router-dom';
import PaginaCostos from './PaginaCostos.jsx';
import PaginaHistorialCostos from './PaginaHistorialCostos.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas de los costos de adquisición (Versión 8): /costos y /costos/:productoId
export default function ModuloCostos() {
  return (
    <Routes>
      <Route index element={<PaginaCostos />} />
      <Route path=":productoId" element={<PaginaHistorialCostos />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
