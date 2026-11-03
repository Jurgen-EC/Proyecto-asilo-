import { Route, Routes } from 'react-router-dom';
import PaginaListaOperaciones from './PaginaListaOperaciones.jsx';
import FormularioDeOperacion from './FormularioDeOperacion.jsx';
import NoEncontrado from '../NoEncontrado.jsx';

// Rutas de las salidas (Versión 6): /salidas y /salidas/nueva
export default function ModuloSalidas() {
  return (
    <Routes>
      <Route index element={<PaginaListaOperaciones clase="salida" />} />
      <Route path="nueva" element={<FormularioDeOperacion clase="salida" />} />
      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  );
}
