import { useEffect, useId, useRef, useState } from 'react';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { useValorConRetardo } from '../utilidades/useValorConRetardo.js';

const MAX_OPCIONES = 8;

/**
 * Selector reutilizable de productos ACTIVOS, con buscador (sin mayúsculas ni tildes).
 * Todas las versiones siguientes lo usan: nadie escribe nombres de producto a mano.
 *
 * Props:
 *   valor     producto seleccionado ({ id, nombre, ... }) o null
 *   onChange  (producto | null) => void
 *   etiqueta  texto visible del campo (por defecto "Producto")
 *   error     mensaje de error del campo (opcional)
 */
export default function SelectorDeProducto({ valor = null, onChange, etiqueta = 'Producto', error = '', deshabilitado = false, id: idExterno }) {
  const datos = useDatos();
  const idGenerado = useId();
  const id = idExterno ?? `selector-${idGenerado}`;
  const idLista = `${id}-lista`;
  const idError = `${id}-error`;
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [carga, setCarga] = useState({ estado: 'inactivo', items: [], total: 0 });
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const consulta = useValorConRetardo(texto, 200);
  const peticion = useRef(0);
  const entrada = useRef(null);
  const enfocarAlLimpiar = useRef(false);

  useEffect(() => {
    if (valor || !abierto) return;
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, estado: 'cargando' }));
    datos.productos
      .listarProductos({ busqueda: consulta, estado: 'activos', tamanoPagina: MAX_OPCIONES })
      .then((r) => {
        if (numero !== peticion.current) return;
        setCarga({ estado: 'listo', items: r.items, total: r.total });
        setIndiceActivo(-1);
      })
      .catch((e) => {
        if (numero === peticion.current) setCarga({ estado: 'error', items: [], total: 0, mensaje: mensajeParaUsuario(e) });
      });
  }, [datos, consulta, abierto, valor]);

  useEffect(() => {
    if (!valor && enfocarAlLimpiar.current) {
      enfocarAlLimpiar.current = false;
      entrada.current?.focus();
    }
  }, [valor]);

  function elegir(producto) {
    setTexto('');
    setAbierto(false);
    setIndiceActivo(-1);
    onChange?.(producto);
  }

  function alTeclear(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setIndiceActivo((i) => Math.min(carga.items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceActivo((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && abierto && indiceActivo >= 0 && carga.items[indiceActivo]) {
      e.preventDefault(); // no enviar el formulario que contenga al selector
      elegir(carga.items[indiceActivo]);
    } else if (e.key === 'Escape' && abierto) {
      e.preventDefault();
      setAbierto(false);
    }
  }

  if (valor) {
    return (
      <div className="campo selector">
        <span className="campo__etiqueta" id={`${id}-etiqueta`}>{etiqueta}</span>
        <div className="selector__valor" role="group" aria-labelledby={`${id}-etiqueta`}>
          <span className="selector__nombre">{valor.nombre}</span>
          <button
            type="button" className="boton boton--secundario" disabled={deshabilitado}
            onClick={() => { enfocarAlLimpiar.current = true; onChange?.(null); }}
          >
            Cambiar
          </button>
        </div>
        {error && <p className="campo__error" id={idError} role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div
      className="campo selector"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setAbierto(false); }}
    >
      <label htmlFor={id}>{etiqueta}</label>
      <input
        ref={entrada} id={id} type="text" role="combobox" autoComplete="off" disabled={deshabilitado}
        aria-expanded={abierto} aria-controls={idLista} aria-autocomplete="list"
        aria-activedescendant={indiceActivo >= 0 ? `${id}-opcion-${indiceActivo}` : undefined}
        aria-invalid={error ? 'true' : undefined} aria-describedby={error ? idError : undefined}
        placeholder="Escribí para buscar…" value={texto}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)} onKeyDown={alTeclear}
      />
      {abierto && (
        <div className="selector__panel">
          <ul id={idLista} role="listbox" aria-label={`${etiqueta}: resultados`} className="selector__lista">
            {carga.items.map((p, i) => (
              <li
                key={p.id} id={`${id}-opcion-${i}`} role="option" aria-selected={i === indiceActivo}
                className={`selector__opcion ${i === indiceActivo ? 'selector__opcion--activa' : ''}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(p)}
              >
                {p.nombre}
              </li>
            ))}
          </ul>
          <p className="selector__estado" role="status">
            {carga.estado === 'cargando' && carga.items.length === 0 && 'Buscando…'}
            {carga.estado === 'error' && carga.mensaje}
            {carga.estado === 'listo' && carga.total === 0 && (consulta.trim()
              ? 'No hay productos activos que coincidan.'
              : 'Todavía no hay productos activos.')}
            {carga.estado === 'listo' && carga.total > MAX_OPCIONES && `Mostrando ${MAX_OPCIONES} de ${carga.total}. Escribí más para acotar.`}
          </p>
        </div>
      )}
      {error && <p className="campo__error" id={idError} role="alert">{error}</p>}
    </div>
  );
}
