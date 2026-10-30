import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { formatearCantidad, formatearDinero, formatearFechaDia, formatearFechaHora } from '../../compartido/utilidades/formato.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';

// Detalle de una compra con los ingresos que generó (Versión 5). Una compra confirmada no se edita.
export default function PaginaDetalleCompra() {
  const { id } = useParams();
  const datos = useDatos();
  const [carga, setCarga] = useState({ estado: 'cargando', compra: null, codigo: '', mensaje: '' });

  const cargar = useCallback(() => {
    let activo = true;
    setCarga({ estado: 'cargando', compra: null, codigo: '', mensaje: '' });
    datos.compras.obtenerCompra(id)
      .then((compra) => { if (activo) setCarga({ estado: 'listo', compra, codigo: '', mensaje: '' }); })
      .catch((e) => { if (activo) setCarga({ estado: 'error', compra: null, codigo: e?.codigo ?? '', mensaje: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos, id]);

  useEffect(() => cargar(), [cargar]);

  if (carga.estado === 'cargando') return <Cargando mensaje="Cargando compra…" />;
  if (carga.estado === 'error') {
    const noExiste = carga.codigo === CODIGOS.NO_ENCONTRADO;
    return (
      <EstadoVacio titulo={noExiste ? 'No se encontró la compra' : 'No se pudo cargar la compra'} mensaje={carga.mensaje}>
        {noExiste ? <Link className="boton" to="/compras">Volver a compras</Link> : <button type="button" className="boton" onClick={cargar}>Reintentar</button>}
      </EstadoVacio>
    );
  }

  const { compra } = carga;
  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Compra del {formatearFechaDia(compra.fechaCompra)}</h1>
        <Link className="boton boton--secundario" to="/compras">Volver a la lista</Link>
      </div>

      <dl className="ficha">
        <dt>Fecha de la compra</dt>
        <dd>{formatearFechaDia(compra.fechaCompra)}</dd>
        <dt>Registrada</dt>
        <dd>{formatearFechaHora(compra.registradaEn)}</dd>
        <dt>Total</dt>
        <dd><strong>{formatearDinero(compra.total)}</strong></dd>
        <dt>Nota</dt>
        <dd>{compra.nota ?? <span className="texto-suave">Sin nota</span>}</dd>
      </dl>

      <h2>Productos comprados</h2>
      <div className="tabla-contenedor">
        <table className="tabla">
          <caption className="solo-lectores">Líneas de la compra</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th><th scope="col" className="tabla__numero">Cantidad</th>
              <th scope="col" className="tabla__numero">Costo unitario</th><th scope="col" className="tabla__numero">Costo total</th>
              <th scope="col">Ingreso al inventario</th>
            </tr>
          </thead>
          <tbody>
            {compra.lineas.map((l) => (
              <tr key={l.id}>
                <td><Link to={`/productos/${l.producto.id}`}>{l.producto.nombre}</Link></td>
                <td className="tabla__numero">
                  {l.presentacion ? `${formatearCantidad(l.cantidad)} ${l.presentacion.nombre}` : formatearCantidad(l.cantidad, l.unidad?.abreviatura ?? '')}
                </td>
                <td className="tabla__numero">{formatearDinero(l.costoUnitario)}{l.presentacion && <small className="texto-suave"> por {l.presentacion.nombre}</small>}</td>
                <td className="tabla__numero">{formatearDinero(l.costoTotal)}</td>
                <td>
                  {l.movimiento
                    ? <>+{formatearCantidad(l.movimiento.cantidadBase, l.movimiento.unidadBase?.abreviatura ?? '')}{l.movimiento.redondeado && <small className="texto-suave"> (redondeado)</small>}</>
                    : <span className="texto-suave">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row" colSpan={3}>Total de la compra</th><td className="tabla__numero"><strong>{formatearDinero(compra.total)}</strong></td><td /></tr>
          </tfoot>
        </table>
      </div>

      <p className="texto-suave">
        Esta compra ya está reflejada en las <Link to="/inventario">existencias</Link>. Una compra confirmada no se edita: si hubo un error, se corrige con un ajuste o una anulación (próximamente).
      </p>
    </section>
  );
}
