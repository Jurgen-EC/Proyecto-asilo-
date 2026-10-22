import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { NOMBRE_PRESENTACION_MAX } from '../../nucleo/datos/presentaciones.js';
import { formatearCantidad } from '../../compartido/utilidades/formato.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';

const FILTROS = [
  { valor: 'activas', texto: 'Activas' },
  { valor: 'inactivas', texto: 'Inactivas' },
  { valor: 'todas', texto: 'Todas' },
];
const FORMULARIO_VACIO = { id: null, nombre: '', cantidadContenida: '', unidadId: '' };

// Presentaciones de un producto (Versión 3, RF-006): Caja = 12 unidades, Bolsa = 900 ml, etc.
// Cada producto define las suyas: no se asume que todas las cajas contienen lo mismo.
export default function PestanaPresentaciones({ producto }) {
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const [estado, setEstado] = useState('activas');
  const [carga, setCarga] = useState({ cargando: true, error: '', lista: null, unidades: [], equivalentes: {} });
  const [formulario, setFormulario] = useState(null);
  const [unidadActualId, setUnidadActualId] = useState(null);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [aDesactivar, setADesactivar] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const peticion = useRef(0);
  const primerCampo = useRef(null);

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '' }));
    Promise.all([
      datos.presentaciones.listarPresentaciones(producto.id, { estado }),
      datos.unidades.listarUnidades({ estado: 'todas' }),
    ])
      .then(async ([lista, unidades]) => {
        // ¿Cuánto vale 1 de cada presentación en la unidad base? Si no hay equivalencia, se avisa (null).
        const equivalentes = {};
        if (producto.unidadBaseId) {
          await Promise.all(lista.filter((p) => p.activo).map(async (p) => {
            try {
              equivalentes[p.id] = (await datos.conversiones.convertir(producto.id, '1', { presentacionId: p.id }, producto.unidadBaseId)).cantidad;
            } catch { equivalentes[p.id] = null; }
          }));
        }
        if (numero === peticion.current) setCarga({ cargando: false, error: '', lista, unidades, equivalentes });
      })
      .catch((e) => { if (numero === peticion.current) setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) })); });
  }, [datos, producto.id, producto.unidadBaseId, estado]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (formulario) primerCampo.current?.focus(); }, [formulario?.id, formulario === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const { lista, unidades, cargando, error, equivalentes } = carga;
  const abreviaturaBase = unidades.find((u) => u.id === producto.unidadBaseId)?.abreviatura ?? '';
  const unidadPorId = Object.fromEntries(unidades.map((u) => [u.id, u]));

  function abrirNueva() {
    setErrores({});
    setUnidadActualId(null);
    setFormulario({ ...FORMULARIO_VACIO, unidadId: producto.unidadBaseId ?? '' }); // la unidad base es lo más común
  }
  function abrirEdicion(p) {
    setErrores({});
    setUnidadActualId(p.unidadId);
    setFormulario({ id: p.id, nombre: p.nombre, cantidadContenida: p.cantidadContenida, unidadId: p.unidadId });
  }
  const cambiarCampo = (campo) => (e) => setFormulario((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    if (enviando) return;
    setErrores({});
    setEnviando(true);
    const entrada = { nombre: formulario.nombre, unidadId: formulario.unidadId, cantidadContenida: formulario.cantidadContenida };
    try {
      if (formulario.id) await datos.presentaciones.editarPresentacion(formulario.id, entrada);
      else await datos.presentaciones.crearPresentacion(producto.id, entrada);
      notificaciones.exito(formulario.id ? 'Cambios guardados.' : 'Presentación creada.');
      setFormulario(null);
      cargar();
    } catch (err) {
      if (err?.campos) setErrores(err.campos);
      else notificaciones.error(mensajeParaUsuario(err));
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarEstado(presentacion, activo) {
    if (procesando) return;
    setProcesando(true);
    try {
      await datos.presentaciones.cambiarEstadoPresentacion(presentacion.id, activo);
      notificaciones.exito(activo ? 'Presentación activada.' : 'Presentación desactivada.');
      setADesactivar(null);
      cargar();
    } catch (err) {
      notificaciones.error(mensajeParaUsuario(err));
    } finally {
      setProcesando(false);
    }
  }

  function tabla() {
    if (!lista && cargando) return <Cargando mensaje="Cargando presentaciones…" />;
    if (!lista && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudieron cargar las presentaciones</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!lista) return null;
    if (lista.length === 0) {
      return (
        <EstadoVacio
          titulo={estado === 'inactivas' ? 'No hay presentaciones inactivas' : 'Este producto todavía no tiene presentaciones'}
          mensaje={estado === 'inactivas'
            ? 'Las presentaciones que desactives aparecerán aquí.'
            : 'Una presentación dice cuánto trae cada empaque. Por ejemplo: Caja = 12 unidades.'}
        />
      );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Presentaciones de {producto.nombre}</caption>
          <thead>
            <tr>
              <th scope="col">Presentación</th><th scope="col">Contenido</th><th scope="col">Equivale a (unidad base)</th><th scope="col">Estado</th>
              <th scope="col"><span className="solo-lectores">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{formatearCantidad(p.cantidadContenida, unidadPorId[p.unidadId]?.abreviatura ?? '')}</td>
                <td>
                  {!p.activo || !producto.unidadBaseId ? '—'
                    : equivalentes[p.id] != null ? formatearCantidad(equivalentes[p.id], abreviaturaBase)
                      : <span className="etiqueta etiqueta--aviso">Falta equivalencia</span>}
                </td>
                <td><span className={`etiqueta ${p.activo ? 'etiqueta--activo' : 'etiqueta--inactivo'}`}>{p.activo ? 'Activa' : 'Inactiva'}</span></td>
                <td className="tabla__acciones">
                  <button type="button" className="boton boton--secundario" onClick={() => abrirEdicion(p)} aria-label={`Editar presentación ${p.nombre}`}>Editar</button>{' '}
                  {p.activo ? (
                    <button type="button" className="boton boton--secundario" onClick={() => setADesactivar(p)} aria-label={`Desactivar presentación ${p.nombre}`}>Desactivar</button>
                  ) : (
                    <button type="button" className="boton boton--secundario" onClick={() => cambiarEstado(p, true)} disabled={procesando} aria-label={`Activar presentación ${p.nombre}`}>Activar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Unidades que se ofrecen: las activas y, al editar, la que la presentación ya tiene aunque esté inactiva.
  const opciones = unidades.filter((u) => u.activo || u.id === unidadActualId);

  return (
    <div>
      <div className="encabezado-pagina encabezado-pagina--interno">
        <h2>Presentaciones de {producto.nombre}</h2>
        {!formulario && <button type="button" className="boton" onClick={abrirNueva}>Nueva presentación</button>}
      </div>

      {formulario && (
        <form className="formulario-modulo formulario-modulo--separado" onSubmit={guardar} noValidate aria-label={formulario.id ? 'Editar presentación' : 'Nueva presentación'}>
          <h3>{formulario.id ? 'Editar presentación' : 'Nueva presentación'}</h3>
          <div className="campo">
            <label htmlFor="nombre-presentacion">Nombre de la presentación</label>
            <input
              id="nombre-presentacion" ref={primerCampo} type="text" autoComplete="off" maxLength={NOMBRE_PRESENTACION_MAX + 20}
              value={formulario.nombre} onChange={cambiarCampo('nombre')}
              aria-invalid={errores.nombre ? 'true' : undefined} aria-describedby={errores.nombre ? 'nombre-presentacion-error' : 'nombre-presentacion-ayuda'}
            />
            <p id="nombre-presentacion-ayuda" className="texto-suave campo__ayuda">Por ejemplo: Caja, Bolsa, Saco.</p>
            {errores.nombre && <p id="nombre-presentacion-error" className="campo__error" role="alert">{errores.nombre}</p>}
          </div>
          <div className="campo">
            <label htmlFor="cantidad-presentacion">Cantidad que contiene</label>
            <input
              id="cantidad-presentacion" type="text" inputMode="decimal" autoComplete="off"
              value={formulario.cantidadContenida} onChange={cambiarCampo('cantidadContenida')}
              aria-invalid={errores.cantidadContenida ? 'true' : undefined} aria-describedby={errores.cantidadContenida ? 'cantidad-presentacion-error' : undefined}
            />
            {errores.cantidadContenida && <p id="cantidad-presentacion-error" className="campo__error" role="alert">{errores.cantidadContenida}</p>}
          </div>
          <div className="campo">
            <label htmlFor="unidad-presentacion">Unidad del contenido</label>
            <select
              id="unidad-presentacion" value={formulario.unidadId} onChange={cambiarCampo('unidadId')}
              aria-invalid={errores.unidadId ? 'true' : undefined} aria-describedby={errores.unidadId ? 'unidad-presentacion-error' : undefined}
            >
              <option value="">Elegí una unidad…</option>
              {opciones.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura}){u.activo ? '' : ' · inactiva'}</option>)}
            </select>
            {errores.unidadId && <p id="unidad-presentacion-error" className="campo__error" role="alert">{errores.unidadId}</p>}
          </div>
          <div className="acciones-formulario">
            <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Guardando…' : formulario.id ? 'Guardar cambios' : 'Crear presentación'}</button>
            <button type="button" className="boton boton--secundario" onClick={() => setFormulario(null)} disabled={enviando}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="herramientas">
        <div className="campo">
          <label htmlFor="filtro-estado-presentacion">Mostrar</label>
          <select id="filtro-estado-presentacion" value={estado} onChange={(e) => setEstado(e.target.value)}>
            {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
          </select>
        </div>
      </div>

      {lista && error && (
        <p className="error-formulario" role="alert">{error} <button type="button" className="boton boton--secundario" onClick={cargar}>Reintentar</button></p>
      )}
      {tabla()}
      <p className="texto-suave">
        Si falta una unidad, creala en <Link to="/unidades">Unidades y conversiones</Link>.
      </p>

      <DialogoConfirmacion
        abierto={Boolean(aDesactivar)} titulo="¿Desactivar esta presentación?" textoConfirmar="Desactivar" peligroso ocupado={procesando}
        mensaje={aDesactivar ? `«${aDesactivar.nombre}» dejará de ofrecerse en operaciones nuevas. Seguirá en el historial y podés activarla de nuevo cuando quieras.` : ''}
        onConfirmar={() => cambiarEstado(aDesactivar, false)} onCancelar={() => setADesactivar(null)}
      />
    </div>
  );
}
