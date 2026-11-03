import { Route, Routes } from 'react-router-dom';
import PaginaListaOperaciones from './PaginaListaOperaciones.jsx';
import FormularioDeOperacion from './FormularioDeOperacion.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas de los consumos (Versión 6): /consumos y /consumos/nuevo
export default function ModuloConsumos() {
  return (
    <Routes>
      <Route index element={<PaginaListaOperaciones clase="consumo" />} />
      <Route path="nuevo" element={<FormularioDeOperacion clase="consumo" />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
