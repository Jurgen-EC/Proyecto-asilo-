import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { NOMBRE_MAX, NOMBRE_MIN } from '../../nucleo/datos/productos.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';

// Crear (/productos/nuevo) y editar (/productos/:id/editar). Las reglas de validación
// viven en la capa de datos; aquí solo se muestran sus mensajes junto a cada campo.
// Desde la Versión 3 el producto exige una unidad base (la unidad en que se controla su existencia).
export default function PaginaFormularioProducto() {
  const { id } = useParams();
  const editando = Boolean(id);
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const navegar = useNavigate();
  const entradaNombre = useRef(null);
  const entradaUnidad = useRef(null);

  const [nombre, setNombre] = useState('');
  const [unidadBaseId, setUnidadBaseId] = useState('');
  const [unidadActualId, setUnidadActualId] = useState(null);
  const [unidades, setUnidades] = useState([]);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [carga, setCarga] = useState({ estado: 'cargando', codigo: '', mensaje: '' });

  useEffect(() => {
    let activo = true;
    setCarga({ estado: 'cargando', codigo: '', mensaje: '' });
    Promise.all([
      datos.unidades.listarUnidades({ estado: 'todas' }),
      editando ? datos.productos.obtenerProducto(id) : Promise.resolve(null),
    ])
      .then(([lista, producto]) => {
        if (!activo) return;
        setUnidades(lista);
        if (producto) {
          setNombre(producto.nombre);
          setUnidadBaseId(producto.unidadBaseId ?? '');
          setUnidadActualId(producto.unidadBaseId ?? null);
        }
        setCarga({ estado: 'listo', codigo: '', mensaje: '' });
      })
      .catch((e) => { if (activo) setCarga({ estado: 'error', codigo: e?.codigo ?? '', mensaje: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos, id, editando]);

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setErrores({});
    setEnviando(true);
    try {
      const entrada = { nombre, unidadBaseId };
      const producto = editando
        ? await datos.productos.editarProducto(id, entrada)
        : await datos.productos.crearProducto(entrada);
      notificaciones.exito(editando ? 'Cambios guardados.' : 'Producto creado.');
      navegar(`/productos/${producto.id}`);
    } catch (err) {
      if (err?.campos) {
        setErrores(err.campos);
        (err.campos.nombre ? entradaNombre : entradaUnidad).current?.focus();
      } else {
        notificaciones.error(mensajeParaUsuario(err));
      }
      setEnviando(false);
    }
  }

  if (carga.estado === 'cargando') return <Cargando mensaje="Cargando…" />;
  if (carga.estado === 'error') {
    return (
      <EstadoVacio
        titulo={carga.codigo === CODIGOS.NO_ENCONTRADO ? 'No se encontró el producto' : 'No se pudo cargar el formulario'}
        mensaje={carga.mensaje}
      >
        <Link className="boton" to="/productos">Volver a productos</Link>
      </EstadoVacio>
    );
  }

  // Se ofrecen las unidades activas y, al editar, también la unidad actual del producto aunque esté inactiva.
  const opciones = unidades.filter((u) => u.activo || u.id === unidadActualId);
  const volver = editando ? `/productos/${id}` : '/productos';
  return (
    <section>
      <h1>{editando ? 'Editar producto' : 'Nuevo producto'}</h1>
      <form className="formulario-modulo" onSubmit={enviar} noValidate>
        <div className="campo">
          <label htmlFor="nombre-producto">Nombre del producto</label>
          <input
            id="nombre-producto" ref={entradaNombre} type="text" autoComplete="off" autoFocus
            value={nombre} onChange={(e) => setNombre(e.target.value)}
            aria-invalid={errores.nombre ? 'true' : undefined}
            aria-describedby={errores.nombre ? 'nombre-producto-error' : 'nombre-producto-ayuda'}
          />
          <p id="nombre-producto-ayuda" className="texto-suave campo__ayuda">Entre {NOMBRE_MIN} y {NOMBRE_MAX} caracteres. No se permiten dos productos con el mismo nombre.</p>
          {errores.nombre && <p id="nombre-producto-error" className="campo__error" role="alert">{errores.nombre}</p>}
        </div>
        <div className="campo">
          <label htmlFor="unidad-base-producto">Unidad base</label>
          <select
            id="unidad-base-producto" ref={entradaUnidad} value={unidadBaseId} onChange={(e) => setUnidadBaseId(e.target.value)}
            aria-invalid={errores.unidadBaseId ? 'true' : undefined}
            aria-describedby={errores.unidadBaseId ? 'unidad-base-producto-error' : 'unidad-base-producto-ayuda'}
          >
            <option value="">Elegí una unidad…</option>
            {opciones.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura}){u.activo ? '' : ' · inactiva'}</option>
            ))}
          </select>
          <p id="unidad-base-producto-ayuda" className="texto-suave campo__ayuda">
            La unidad en la que se controla la existencia del producto (por ejemplo, kilogramo para la papa).
            {' '}Si falta una unidad, creala en <Link to="/unidades">Unidades y conversiones</Link>.
          </p>
          {errores.unidadBaseId && <p id="unidad-base-producto-error" className="campo__error" role="alert">{errores.unidadBaseId}</p>}
        </div>
        <div className="acciones-formulario">
          <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear producto'}</button>
          <Link className="boton boton--secundario" to={volver}>Cancelar</Link>
        </div>
      </form>
    </section>
  );
}
