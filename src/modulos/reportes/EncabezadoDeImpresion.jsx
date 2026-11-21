import { formatearFechaHora } from '../../compartido/utilidades/formato.js';

// Solo se ve al imprimir (en pantalla está oculto): título, período y fecha de generación del reporte.
export default function EncabezadoDeImpresion({ titulo, subtitulo = '', periodo = '', generadoEn = null }) {
  return (
    <header className="encabezado-impresion">
      <p className="encabezado-impresion__institucion">Hogar de Ancianos Jafeth Jiménez Morales</p>
      <h2>{subtitulo ? `${titulo}: ${subtitulo}` : titulo}</h2>
      {periodo && <p>Período: {periodo}</p>}
      {generadoEn && <p>Generado el {formatearFechaHora(generadoEn)}</p>}
    </header>
  );
}
