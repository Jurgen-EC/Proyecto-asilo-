import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { formatearFechaHora } from '../../compartido/utilidades/formato.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';

export default function PaginaDetalleProducto() {
  const { id } = useParams();
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const [carga, setCarga] = useState({ estado: 'cargando', producto: null, codigo: '', mensaje: '' });
  const [confirmando, setConfirmando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(() => {
    let activo = true;
    setCarga({ estado: 'cargando', producto: null, codigo: '', mensaje: '' });
    datos.productos.obtenerProducto(id)
      .then((producto) => { if (activo) setCarga({ estado: 'listo', producto, codigo: '', mensaje: '' }); })
      .catch((e) => { if (activo) setCarga({ estado: 'error', producto: null, codigo: e?.codigo ?? '', mensaje: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos, id]);

  useEffect(() => cargar(), [cargar]);

  async function cambiarEstado(activo) {
    if (procesando) return;
    setProcesando(true);
    try {
      const producto = await datos.productos.cambiarEstadoProducto(id, activo);
      setCarga({ estado: 'listo', producto, codigo: '', mensaje: '' });
      notificaciones.exito(activo ? 'Producto activado.' : 'Producto desactivado.');
      setConfirmando(false);
    } catch (e) {
      notificaciones.error(mensajeParaUsuario(e));
    } finally {
      setProcesando(false);
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

  const { producto } = carga;
  return (
    <section>
      <div className="encabezado-pagina">
        <h1>{producto.nombre}</h1>
        <Link className="boton boton--secundario" to="/productos">Volver a la lista</Link>
      </div>

      <dl className="ficha">
        <dt>Nombre</dt>
        <dd>{producto.nombre}</dd>
        <dt>Estado</dt>
        <dd><span className={`etiqueta ${producto.activo ? 'etiqueta--activo' : 'etiqueta--inactivo'}`}>{producto.activo ? 'Activo' : 'Inactivo'}</span></dd>
        <dt>Creado</dt>
        <dd>{formatearFechaHora(producto.creadoEn)}</dd>
        <dt>Última modificación</dt>
        <dd>{formatearFechaHora(producto.actualizadoEn)}</dd>
      </dl>

      {!producto.activo && (
        <p className="texto-suave">Este producto está inactivo: no aparece al elegir productos en operaciones nuevas, pero se conserva en el historial.</p>
      )}

      <div className="acciones-formulario">
        <Link className="boton" to={`/productos/${producto.id}/editar`}>Editar</Link>
        {producto.activo ? (
          <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(true)}>Desactivar</button>
        ) : (
          <button type="button" className="boton boton--secundario" onClick={() => cambiarEstado(true)} disabled={procesando}>{procesando ? 'Activando…' : 'Activar'}</button>
        )}
      </div>

      <DialogoConfirmacion
        abierto={confirmando} titulo="¿Desactivar este producto?" textoConfirmar="Desactivar" peligroso ocupado={procesando}
        mensaje={`«${producto.nombre}» dejará de aparecer al elegir productos en operaciones nuevas. Seguirá en la lista de inactivos y podés activarlo de nuevo cuando quieras.`}
        onConfirmar={() => cambiarEstado(false)} onCancelar={() => setConfirmando(false)}
      />
    </section>
  );
}
