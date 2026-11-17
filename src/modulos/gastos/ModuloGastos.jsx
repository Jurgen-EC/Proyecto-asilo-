import { Route, Routes } from 'react-router-dom';
import PaginaListaGastos from './PaginaListaGastos.jsx';
import FormularioGasto from './FormularioGasto.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas de los gastos (Versión 8): /gastos y /gastos/nuevo
export default function ModuloGastos() {
  return (
    <Routes>
      <Route index element={<PaginaListaGastos />} />
      <Route path="nuevo" element={<FormularioGasto />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
