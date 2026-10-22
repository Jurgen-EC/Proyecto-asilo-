import { useCallback, useEffect, useRef, useState } from 'react';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import {
  DIMENSIONES, ETIQUETA_DIMENSION, NOMBRE_UNIDAD_MAX, ABREVIATURA_MAX,
} from '../../nucleo/datos/unidades.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';
import GestorConversiones from './GestorConversiones.jsx';

const FILTROS = [
  { valor: 'activas', texto: 'Activas' },
  { valor: 'inactivas', texto: 'Inactivas' },
  { valor: 'todas', texto: 'Todas' },
];
const FORMULARIO_VACIO = { id: null, nombre: '', abreviatura: '', dimension: '' };

// Administración de unidades de medida (Versión 3, RF-005). Las reglas viven en la capa de datos;
// aquí solo se muestran sus mensajes junto a cada campo.
export default function PaginaUnidades() {
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const [estado, setEstado] = useState('activas');
  const [carga, setCarga] = useState({ cargando: true, error: '', unidades: null });
  const [formulario, setFormulario] = useState(null); // null = cerrado
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [aDesactivar, setADesactivar] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const peticion = useRef(0);
  const primerCampo = useRef(null);

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '' }));
    datos.unidades.listarUnidades({ estado })
      .then((unidades) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', unidades }); })
      .catch((e) => { if (numero === peticion.current) setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) })); });
  }, [datos, estado]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (formulario) primerCampo.current?.focus(); }, [formulario?.id, formulario === null]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirNueva() { setErrores({}); setFormulario({ ...FORMULARIO_VACIO }); }
  function abrirEdicion(u) {
    setErrores({});
    setFormulario({ id: u.id, nombre: u.nombre, abreviatura: u.abreviatura, dimension: u.dimension });
  }
  const cambiarCampo = (campo) => (e) => setFormulario((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    if (enviando) return;
    setErrores({});
    setEnviando(true);
    const entrada = { nombre: formulario.nombre, abreviatura: formulario.abreviatura, dimension: formulario.dimension };
    try {
      if (formulario.id) await datos.unidades.editarUnidad(formulario.id, entrada);
      else await datos.unidades.crearUnidad(entrada);
      notificaciones.exito(formulario.id ? 'Cambios guardados.' : 'Unidad creada.');
      setFormulario(null);
      cargar();
    } catch (err) {
      if (err?.campos) setErrores(err.campos);
      else notificaciones.error(mensajeParaUsuario(err));
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarEstado(unidad, activo) {
    if (procesando) return;
    setProcesando(true);
    try {
      await datos.unidades.cambiarEstadoUnidad(unidad.id, activo);
      notificaciones.exito(activo ? 'Unidad activada.' : 'Unidad desactivada.');
      setADesactivar(null);
      cargar();
    } catch (err) {
      notificaciones.error(mensajeParaUsuario(err));
    } finally {
      setProcesando(false);
    }
  }

  const { unidades, cargando, error } = carga;

  function tabla() {
    if (!unidades && cargando) return <Cargando mensaje="Cargando unidades…" />;
    if (!unidades && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudieron cargar las unidades</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!unidades) return null;
    if (unidades.length === 0) {
      return (
        <EstadoVacio
          titulo={estado === 'inactivas' ? 'No hay unidades inactivas' : 'No hay unidades para mostrar'}
          mensaje={estado === 'inactivas' ? 'Las unidades que desactives aparecerán aquí.' : 'Creá una unidad nueva o revisá el filtro.'}
        />
      );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Lista de unidades de medida</caption>
          <thead>
            <tr>
              <th scope="col">Nombre</th><th scope="col">Abreviatura</th><th scope="col">Mide</th><th scope="col">Estado</th>
              <th scope="col"><span className="solo-lectores">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => (
              <tr key={u.id}>
                <td>{u.nombre}{u.sugerida && <> <span className="etiqueta">Sugerida</span></>}</td>
                <td>{u.abreviatura}</td>
                <td>{ETIQUETA_DIMENSION[u.dimension]}</td>
                <td><span className={`etiqueta ${u.activo ? 'etiqueta--activo' : 'etiqueta--inactivo'}`}>{u.activo ? 'Activa' : 'Inactiva'}</span></td>
                <td className="tabla__acciones">
                  <button type="button" className="boton boton--secundario" onClick={() => abrirEdicion(u)} aria-label={`Editar ${u.nombre}`}>Editar</button>{' '}
                  {u.activo ? (
                    <button type="button" className="boton boton--secundario" onClick={() => setADesactivar(u)} aria-label={`Desactivar ${u.nombre}`}>Desactivar</button>
                  ) : (
                    <button type="button" className="boton boton--secundario" onClick={() => cambiarEstado(u, true)} disabled={procesando} aria-label={`Activar ${u.nombre}`}>Activar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Unidades de medida</h1>
        {!formulario && <button type="button" className="boton" onClick={abrirNueva}>Nueva unidad</button>}
      </div>
      <p className="texto-suave">
        Las unidades sugeridas se pueden editar. Una unidad nunca se borra: si ya no se usa, se desactiva y sigue en el historial.
      </p>

      {formulario && (
        <form className="formulario-modulo formulario-modulo--separado" onSubmit={guardar} noValidate aria-label={formulario.id ? 'Editar unidad' : 'Nueva unidad'}>
          <h2>{formulario.id ? 'Editar unidad' : 'Nueva unidad'}</h2>
          <div className="campo">
            <label htmlFor="nombre-unidad">Nombre de la unidad</label>
            <input
              id="nombre-unidad" ref={primerCampo} type="text" autoComplete="off" maxLength={NOMBRE_UNIDAD_MAX + 20}
              value={formulario.nombre} onChange={cambiarCampo('nombre')}
              aria-invalid={errores.nombre ? 'true' : undefined} aria-describedby={errores.nombre ? 'nombre-unidad-error' : undefined}
            />
            {errores.nombre && <p id="nombre-unidad-error" className="campo__error" role="alert">{errores.nombre}</p>}
          </div>
          <div className="campo">
            <label htmlFor="abreviatura-unidad">Abreviatura</label>
            <input
              id="abreviatura-unidad" type="text" autoComplete="off" maxLength={ABREVIATURA_MAX + 10}
              value={formulario.abreviatura} onChange={cambiarCampo('abreviatura')}
              aria-invalid={errores.abreviatura ? 'true' : undefined} aria-describedby={errores.abreviatura ? 'abreviatura-unidad-error' : 'abreviatura-unidad-ayuda'}
            />
            <p id="abreviatura-unidad-ayuda" className="texto-suave campo__ayuda">Por ejemplo: kg, g, l, ml.</p>
            {errores.abreviatura && <p id="abreviatura-unidad-error" className="campo__error" role="alert">{errores.abreviatura}</p>}
          </div>
          <div className="campo">
            <label htmlFor="dimension-unidad">¿Qué mide?</label>
            <select
              id="dimension-unidad" value={formulario.dimension} onChange={cambiarCampo('dimension')}
              aria-invalid={errores.dimension ? 'true' : undefined} aria-describedby={errores.dimension ? 'dimension-unidad-error' : undefined}
            >
              <option value="">Elegí una opción…</option>
              {DIMENSIONES.map((d) => <option key={d} value={d}>{ETIQUETA_DIMENSION[d]}</option>)}
            </select>
            {errores.dimension && <p id="dimension-unidad-error" className="campo__error" role="alert">{errores.dimension}</p>}
          </div>
          <div className="acciones-formulario">
            <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Guardando…' : formulario.id ? 'Guardar cambios' : 'Crear unidad'}</button>
            <button type="button" className="boton boton--secundario" onClick={() => setFormulario(null)} disabled={enviando}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="herramientas">
        <div className="campo">
          <label htmlFor="filtro-estado-unidad">Mostrar</label>
          <select id="filtro-estado-unidad" value={estado} onChange={(e) => setEstado(e.target.value)}>
            {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
          </select>
        </div>
      </div>

      {unidades && error && (
        <p className="error-formulario" role="alert">{error} <button type="button" className="boton boton--secundario" onClick={cargar}>Reintentar</button></p>
      )}
      {tabla()}

      <DialogoConfirmacion
        abierto={Boolean(aDesactivar)} titulo="¿Desactivar esta unidad?" textoConfirmar="Desactivar" peligroso ocupado={procesando}
        mensaje={aDesactivar ? `«${aDesactivar.nombre}» dejará de ofrecerse al configurar productos nuevos. Lo que ya la usa no cambia, y podés activarla de nuevo cuando quieras.` : ''}
        onConfirmar={() => cambiarEstado(aDesactivar, false)} onCancelar={() => setADesactivar(null)}
      />

      <hr className="separador" />
      <GestorConversiones productoId={null} />
    </section>
  );
}
