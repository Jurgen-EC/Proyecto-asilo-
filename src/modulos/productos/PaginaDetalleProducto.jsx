import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { productoIncompleto } from '../../nucleo/datos/productos.js';
import { formatearFechaHora } from '../../compartido/utilidades/formato.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';
import Pestanas, { idPanel, idPestana } from '../../compartido/componentes/Pestanas.jsx';
import PestanaPresentaciones from './PestanaPresentaciones.jsx';
import PestanaConversiones from './PestanaConversiones.jsx';

const PESTANAS = [
  { id: 'datos', texto: 'Datos' },
  { id: 'presentaciones', texto: 'Presentaciones' },
  { id: 'conversiones', texto: 'Conversiones' },
];
const ID_BASE = 'producto';

export default function PaginaDetalleProducto() {
  const { id } = useParams();
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const [params, setParams] = useSearchParams();
  const pestana = PESTANAS.some((p) => p.id === params.get('pestana')) ? params.get('pestana') : 'datos';
  const [carga, setCarga] = useState({ estado: 'cargando', producto: null, unidadBase: null, codigo: '', mensaje: '' });
  const [confirmando, setConfirmando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(() => {
    let activo = true;
    setCarga({ estado: 'cargando', producto: null, unidadBase: null, codigo: '', mensaje: '' });
    datos.productos.obtenerProducto(id)
      .then(async (producto) => {
        // La unidad base es un dato complementario: si no se puede leer, se muestra el producto igual.
        let unidadBase = null;
        if (producto.unidadBaseId) {
          try { unidadBase = await datos.unidades.obtenerUnidad(producto.unidadBaseId); } catch { unidadBase = null; }
        }
        if (activo) setCarga({ estado: 'listo', producto, unidadBase, codigo: '', mensaje: '' });
      })
      .catch((e) => { if (activo) setCarga({ estado: 'error', producto: null, unidadBase: null, codigo: e?.codigo ?? '', mensaje: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos, id]);

  useEffect(() => cargar(), [cargar]);

  async function cambiarEstado(activo) {
    if (procesando) return;
    setProcesando(true);
    try {
      const producto = await datos.productos.cambiarEstadoProducto(id, activo);
      setCarga((c) => ({ ...c, estado: 'listo', producto, codigo: '', mensaje: '' }));
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

  const { producto, unidadBase } = carga;
  const incompleto = productoIncompleto(producto);
  const cambiarPestana = (id) => setParams((actuales) => {
    const nuevos = new URLSearchParams(actuales);
    if (id === 'datos') nuevos.delete('pestana'); else nuevos.set('pestana', id);
    return nuevos;
  }, { replace: true });
  return (
    <section>
      <div className="encabezado-pagina">
        <h1>{producto.nombre}</h1>
        <Link className="boton boton--secundario" to="/productos">Volver a la lista</Link>
      </div>

      <Pestanas etiqueta="Secciones del producto" pestanas={PESTANAS} activa={pestana} onCambiar={cambiarPestana} idBase={ID_BASE} />
      <div role="tabpanel" id={idPanel(ID_BASE, pestana)} aria-labelledby={idPestana(ID_BASE, pestana)} className="pestanas__panel">
        {pestana === 'presentaciones' ? (
          <PestanaPresentaciones producto={producto} />
        ) : pestana === 'conversiones' ? (
          <PestanaConversiones producto={producto} />
        ) : (
          <>
          <dl className="ficha">
            <dt>Nombre</dt>
            <dd>{producto.nombre}</dd>
            <dt>Estado</dt>
            <dd><span className={`etiqueta ${producto.activo ? 'etiqueta--activo' : 'etiqueta--inactivo'}`}>{producto.activo ? 'Activo' : 'Inactivo'}</span></dd>
            <dt>Unidad base</dt>
            <dd>
              {incompleto
                ? <span className="etiqueta etiqueta--aviso">Incompleto · sin unidad base</span>
                : unidadBase ? `${unidadBase.nombre} (${unidadBase.abreviatura})` : 'No se pudo cargar la unidad'}
            </dd>
            <dt>Creado</dt>
            <dd>{formatearFechaHora(producto.creadoEn)}</dd>
            <dt>Última modificación</dt>
            <dd>{formatearFechaHora(producto.actualizadoEn)}</dd>
          </dl>

          {incompleto && (
            <p className="texto-suave">Este producto está incompleto: todavía no tiene unidad base, por eso no se puede usar en operaciones. Editalo para elegirla.</p>
          )}
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
          </>
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
