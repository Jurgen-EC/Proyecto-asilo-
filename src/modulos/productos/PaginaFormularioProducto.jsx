import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { NOMBRE_MAX, NOMBRE_MIN } from '../../nucleo/datos/productos.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';

// Crear (/productos/nuevo) y editar (/productos/:id/editar). Las reglas de validación
// viven en la capa de datos; aquí solo se muestran sus mensajes junto al campo.
export default function PaginaFormularioProducto() {
  const { id } = useParams();
  const editando = Boolean(id);
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const navegar = useNavigate();
  const entrada = useRef(null);

  const [nombre, setNombre] = useState('');
  const [errorNombre, setErrorNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carga, setCarga] = useState({ estado: editando ? 'cargando' : 'listo', codigo: '', mensaje: '' });

  useEffect(() => {
    if (!editando) return undefined;
    let activo = true;
    setCarga({ estado: 'cargando', codigo: '', mensaje: '' });
    datos.productos.obtenerProducto(id)
      .then((p) => { if (activo) { setNombre(p.nombre); setCarga({ estado: 'listo', codigo: '', mensaje: '' }); } })
      .catch((e) => { if (activo) setCarga({ estado: 'error', codigo: e?.codigo ?? '', mensaje: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos, id, editando]);

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setErrorNombre('');
    setEnviando(true);
    try {
      const producto = editando
        ? await datos.productos.editarProducto(id, { nombre })
        : await datos.productos.crearProducto({ nombre });
      notificaciones.exito(editando ? 'Cambios guardados.' : 'Producto creado.');
      navegar(`/productos/${producto.id}`);
    } catch (err) {
      const mensajeCampo = err?.campos?.nombre;
      if (mensajeCampo) {
        setErrorNombre(mensajeCampo);
        entrada.current?.focus();
      } else {
        notificaciones.error(mensajeParaUsuario(err));
      }
      setEnviando(false);
    }
  }

  if (carga.estado === 'cargando') return <Cargando mensaje="Cargando producto…" />;
  if (carga.estado === 'error') {
    return (
      <EstadoVacio
        titulo={carga.codigo === CODIGOS.NO_ENCONTRADO ? 'No se encontró el producto' : 'No se pudo cargar el producto'}
        mensaje={carga.mensaje}
      >
        <Link className="boton" to="/productos">Volver a productos</Link>
      </EstadoVacio>
    );
  }

  const volver = editando ? `/productos/${id}` : '/productos';
  return (
    <section>
      <h1>{editando ? 'Editar producto' : 'Nuevo producto'}</h1>
      <form className="formulario-modulo" onSubmit={enviar} noValidate>
        <div className="campo">
          <label htmlFor="nombre-producto">Nombre del producto</label>
          <input
            id="nombre-producto" ref={entrada} type="text" autoComplete="off" autoFocus
            value={nombre} onChange={(e) => setNombre(e.target.value)}
            aria-invalid={errorNombre ? 'true' : undefined}
            aria-describedby={errorNombre ? 'nombre-producto-error' : 'nombre-producto-ayuda'}
          />
          <p id="nombre-producto-ayuda" className="texto-suave campo__ayuda">Entre {NOMBRE_MIN} y {NOMBRE_MAX} caracteres. No se permiten dos productos con el mismo nombre.</p>
          {errorNombre && <p id="nombre-producto-error" className="campo__error" role="alert">{errorNombre}</p>}
        </div>
        <div className="acciones-formulario">
          <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear producto'}</button>
          <Link className="boton boton--secundario" to={volver}>Cancelar</Link>
        </div>
      </form>
    </section>
  );
}
