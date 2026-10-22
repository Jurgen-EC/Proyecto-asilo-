import { useRef } from 'react';

/** Identificador del panel de una pestaña (para aria-controls y para el contenedor del contenido). */
export const idPanel = (idBase, id) => `${idBase}-panel-${id}`;
export const idPestana = (idBase, id) => `${idBase}-pestana-${id}`;

/**
 * Barra de pestañas accesible (se maneja con ratón o con las flechas del teclado).
 * Solo dibuja la barra: quien la usa dibuja el panel activo con role="tabpanel",
 * id={idPanel(idBase, activa)} y aria-labelledby={idPestana(idBase, activa)}.
 *
 *   pestanas  [{ id, texto }]
 *   activa    id de la pestaña activa
 *   onCambiar (id) => void
 */
export default function Pestanas({ etiqueta, pestanas, activa, onCambiar, idBase = 'pestanas' }) {
  const refs = useRef({});

  function alTeclear(e, indice) {
    let destino = null;
    if (e.key === 'ArrowRight') destino = (indice + 1) % pestanas.length;
    else if (e.key === 'ArrowLeft') destino = (indice - 1 + pestanas.length) % pestanas.length;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = pestanas.length - 1;
    if (destino === null) return;
    e.preventDefault();
    const { id } = pestanas[destino];
    onCambiar(id);
    refs.current[id]?.focus();
  }

  return (
    <div className="pestanas" role="tablist" aria-label={etiqueta}>
      {pestanas.map((p, i) => (
        <button
          key={p.id} ref={(el) => { refs.current[p.id] = el; }} type="button" role="tab"
          id={idPestana(idBase, p.id)} aria-controls={idPanel(idBase, p.id)} aria-selected={p.id === activa}
          tabIndex={p.id === activa ? 0 : -1}
          className={`pestanas__boton ${p.id === activa ? 'pestanas__boton--activa' : ''}`}
          onClick={() => onCambiar(p.id)} onKeyDown={(e) => alTeclear(e, i)}
        >
          {p.texto}
        </button>
      ))}
    </div>
  );
}
