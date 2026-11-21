// Abre el diálogo de impresión del navegador. Lo que se imprime lo define la hoja de estilos de impresión (estilos.css).
export default function BotonImprimir({ deshabilitado = false }) {
  return (
    <button type="button" className="boton boton--secundario no-imprimir" disabled={deshabilitado} onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
