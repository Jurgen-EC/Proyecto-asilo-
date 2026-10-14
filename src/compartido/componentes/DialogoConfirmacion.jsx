import { useEffect, useRef } from 'react';

export default function DialogoConfirmacion({
  abierto, titulo, mensaje, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar',
  peligroso = false, ocupado = false, onConfirmar, onCancelar, children,
}) {
  const botonCancelar = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    botonCancelar.current?.focus();
    const alTeclear = (e) => { if (e.key === 'Escape' && !ocupado) onCancelar?.(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto, ocupado, onCancelar]);
  if (!abierto) return null;
  return (
    <div className="dialogo-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) onCancelar?.(); }}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo">
        <h2 id="dialogo-titulo">{titulo}</h2>
        {mensaje && <p>{mensaje}</p>}
        {children}
        <div className="dialogo__acciones">
          <button type="button" className="boton boton--secundario" ref={botonCancelar} onClick={onCancelar} disabled={ocupado}>{textoCancelar}</button>
          <button type="button" className={`boton ${peligroso ? 'boton--peligro' : ''}`} onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? 'Procesando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
