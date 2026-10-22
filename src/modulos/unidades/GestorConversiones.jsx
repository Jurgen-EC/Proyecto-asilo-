import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';

const FORMULARIO_VACIO = { unidadOrigenId: '', unidadDestinoId: '', factor: '' };

/** «1 kg = 1000 g». El factor se muestra con coma decimal, como se escribe en Costa Rica. */
export function textoEquivalencia(c, unidadPorId) {
  const origen = unidadPorId[c.unidadOrigenId]?.abreviatura ?? '?';
  const destino = unidadPorId[c.unidadDestinoId]?.abreviatura ?? '?';
  return `1 ${origen} = ${String(c.factor).replace('.', ',')} ${destino}`;
}

/**
 * Equivalencias entre unidades (Versión 3, RF-007).
 *   productoId = null  -> equivalencias GENERALES (valen para todos los productos, solo entre unidades que miden lo mismo)
 *   productoId = id    -> equivalencias de ESE producto (pueden cruzar masa y volumen; tienen prioridad sobre las generales)
 * Cambiar un factor crea una versión nueva y deja la anterior en el historial: nunca se pisa lo anterior.
 */
export default function GestorConversiones({ productoId = null, titulo }) {
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const idBase = useId();
  const [verHistorial, setVerHistorial] = useState(false);
  const [carga, setCarga] = useState({ cargando: true, error: '', lista: null, unidades: [] });
  const [formulario, setFormulario] = useState(null);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [cambio, setCambio] = useState(null); // { id, texto, factor, error }
  const [aRetirar, setARetirar] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const peticion = useRef(0);

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '' }));
    Promise.all([
      datos.conversiones.listarConversiones({ productoId, vigentes: !verHistorial }),
      datos.unidades.listarUnidades({ estado: 'todas' }),
    ])
      .then(([lista, unidades]) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', lista, unidades }); })
      .catch((e) => { if (numero === peticion.current) setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) })); });
  }, [datos, productoId, verHistorial]);

  useEffect(() => { cargar(); }, [cargar]);

  const { lista, unidades, cargando, error } = carga;
  const unidadPorId = Object.fromEntries(unidades.map((u) => [u.id, u]));
  const activas = unidades.filter((u) => u.activo);
  const cambiarCampo = (campo) => (e) => setFormulario((f) => ({ ...f, [campo]: e.target.value }));
  const id = (nombre) => `${idBase}-${nombre}`;

  async function crear(e) {
    e.preventDefault();
    if (enviando) return;
    setErrores({});
    setEnviando(true);
    try {
      await datos.conversiones.crearConversion({ productoId, ...formulario });
      notificaciones.exito('Equivalencia creada.');
      setFormulario(null);
      cargar();
    } catch (err) {
      if (err?.campos) setErrores(err.campos);
      else notificaciones.error(mensajeParaUsuario(err));
    } finally {
      setEnviando(false);
    }
  }

  async function guardarCambio(e) {
    e.preventDefault();
    if (procesando) return;
    setProcesando(true);
    try {
      await datos.conversiones.cambiarFactorConversion(cambio.id, cambio.factor);
      notificaciones.exito('Factor cambiado. La versión anterior quedó en el historial.');
      setCambio(null);
      cargar();
    } catch (err) {
      setCambio((c) => ({ ...c, error: err?.campos?.factor ?? mensajeParaUsuario(err) }));
    } finally {
      setProcesando(false);
    }
  }

  async function retirar() {
    if (procesando) return;
    setProcesando(true);
    try {
      await datos.conversiones.retirarConversion(aRetirar.id);
      notificaciones.exito('Equivalencia retirada.');
      setARetirar(null);
      cargar();
    } catch (err) {
      notificaciones.error(mensajeParaUsuario(err));
    } finally {
      setProcesando(false);
    }
  }

  function contenido() {
    if (!lista && cargando) return <Cargando mensaje="Cargando equivalencias…" />;
    if (!lista && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudieron cargar las equivalencias</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!lista) return null;
    if (lista.length === 0) {
      return (
        <EstadoVacio
          titulo="Todavía no hay equivalencias"
          mensaje={productoId
            ? 'Las equivalencias generales (como kg ↔ g) ya valen para este producto. Agregá una acá solo si necesita una propia, por ejemplo 1 l = 0,92 kg.'
            : 'Creá una equivalencia para poder convertir entre unidades.'}
        />
      );
    }
    return (
      <ul className="equivalencias" aria-busy={cargando}>
        {lista.map((c) => {
          const texto = textoEquivalencia(c, unidadPorId);
          const enCambio = cambio?.id === c.id;
          return (
            <li key={c.id} className={`equivalencias__item ${c.vigente ? '' : 'equivalencias__item--anterior'}`}>
              <div className="equivalencias__fila">
                <span className="equivalencias__texto">{texto}</span>
                {c.sugerida && <span className="etiqueta">Sugerida</span>}
                {!c.vigente && <span className="etiqueta etiqueta--inactivo">{c.reemplazadaPorId ? 'Reemplazada' : 'Retirada'}</span>}
                {c.vigente && !enCambio && (
                  <span className="equivalencias__acciones">
                    <button type="button" className="boton boton--secundario" onClick={() => setCambio({ id: c.id, texto, factor: String(c.factor).replace('.', ','), error: '' })} aria-label={`Cambiar factor de ${texto}`}>Cambiar factor</button>
                    <button type="button" className="boton boton--secundario" onClick={() => setARetirar({ id: c.id, texto })} aria-label={`Retirar ${texto}`}>Retirar</button>
                  </span>
                )}
              </div>
              {enCambio && (
                <form className="equivalencias__cambio" onSubmit={guardarCambio} noValidate aria-label={`Nuevo factor de ${texto}`}>
                  <div className="campo">
                    <label htmlFor={id('nuevo-factor')}>Nuevo factor</label>
                    <input
                      id={id('nuevo-factor')} type="text" inputMode="decimal" autoComplete="off" autoFocus
                      value={cambio.factor} onChange={(e) => setCambio((x) => ({ ...x, factor: e.target.value }))}
                      aria-invalid={cambio.error ? 'true' : undefined} aria-describedby={id('nuevo-factor-ayuda')}
                    />
                    <p id={id('nuevo-factor-ayuda')} className="texto-suave campo__ayuda">Se crea una versión nueva; la anterior queda en el historial y no se modifica.</p>
                    {cambio.error && <p className="campo__error" role="alert">{cambio.error}</p>}
                  </div>
                  <div className="acciones-formulario">
                    <button type="submit" className="boton" disabled={procesando}>{procesando ? 'Guardando…' : 'Guardar nuevo factor'}</button>
                    <button type="button" className="boton boton--secundario" onClick={() => setCambio(null)} disabled={procesando}>Cancelar</button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="gestor-conversiones">
      <div className="encabezado-pagina encabezado-pagina--interno">
        <h2>{titulo ?? (productoId ? 'Equivalencias de este producto' : 'Equivalencias generales')}</h2>
        {!formulario && <button type="button" className="boton" onClick={() => { setErrores({}); setFormulario({ ...FORMULARIO_VACIO }); }}>Nueva equivalencia</button>}
      </div>
      <p className="texto-suave">
        {productoId
          ? 'Dicen cuántas unidades de destino hay en 1 de origen. Valen en los dos sentidos y tienen prioridad sobre las generales. Nunca se asume una equivalencia que no esté acá.'
          : 'Valen para todos los productos y solo entre unidades que miden lo mismo (por ejemplo kg y g). Valen en los dos sentidos.'}
      </p>

      {formulario && (
        <form className="formulario-modulo formulario-modulo--separado" onSubmit={crear} noValidate aria-label="Nueva equivalencia">
          <h3>Nueva equivalencia</h3>
          <div className="campo">
            <label htmlFor={id('origen')}>Unidad de origen</label>
            <select id={id('origen')} value={formulario.unidadOrigenId} onChange={cambiarCampo('unidadOrigenId')} aria-invalid={errores.unidadOrigenId ? 'true' : undefined} aria-describedby={errores.unidadOrigenId ? id('origen-error') : undefined}>
              <option value="">Elegí una unidad…</option>
              {activas.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
            </select>
            {errores.unidadOrigenId && <p id={id('origen-error')} className="campo__error" role="alert">{errores.unidadOrigenId}</p>}
          </div>
          <div className="campo">
            <label htmlFor={id('factor')}>Cuánto vale 1 unidad de origen</label>
            <input id={id('factor')} type="text" inputMode="decimal" autoComplete="off" value={formulario.factor} onChange={cambiarCampo('factor')} aria-invalid={errores.factor ? 'true' : undefined} aria-describedby={errores.factor ? id('factor-error') : id('factor-ayuda')} />
            <p id={id('factor-ayuda')} className="texto-suave campo__ayuda">Por ejemplo: 1 kg = 1000 g → escribí 1000.</p>
            {errores.factor && <p id={id('factor-error')} className="campo__error" role="alert">{errores.factor}</p>}
          </div>
          <div className="campo">
            <label htmlFor={id('destino')}>Unidad de destino</label>
            <select id={id('destino')} value={formulario.unidadDestinoId} onChange={cambiarCampo('unidadDestinoId')} aria-invalid={errores.unidadDestinoId ? 'true' : undefined} aria-describedby={errores.unidadDestinoId ? id('destino-error') : undefined}>
              <option value="">Elegí una unidad…</option>
              {activas.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
            </select>
            {errores.unidadDestinoId && <p id={id('destino-error')} className="campo__error" role="alert">{errores.unidadDestinoId}</p>}
          </div>
          <div className="acciones-formulario">
            <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Crear equivalencia'}</button>
            <button type="button" className="boton boton--secundario" onClick={() => setFormulario(null)} disabled={enviando}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="herramientas">
        <label className="casilla">
          <input type="checkbox" checked={verHistorial} onChange={(e) => setVerHistorial(e.target.checked)} />
          Ver versiones anteriores y retiradas
        </label>
      </div>

      {lista && error && <p className="error-formulario" role="alert">{error} <button type="button" className="boton boton--secundario" onClick={cargar}>Reintentar</button></p>}
      {contenido()}

      <DialogoConfirmacion
        abierto={Boolean(aRetirar)} titulo="¿Retirar esta equivalencia?" textoConfirmar="Retirar" peligroso ocupado={procesando}
        mensaje={aRetirar ? `«${aRetirar.texto}» dejará de usarse para convertir. Queda en el historial. Mientras no haya otra equivalencia, esas unidades no se podrán convertir.` : ''}
        onConfirmar={retirar} onCancelar={() => setARetirar(null)}
      />
    </div>
  );
}
