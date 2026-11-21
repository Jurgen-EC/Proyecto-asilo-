import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { formatearCantidad, formatearDinero, formatearFechaDia } from '../../compartido/utilidades/formato.js';
import { mesDeHoy, nombreDelMes } from '../../compartido/utilidades/periodo.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import SelectorDePeriodo from '../../compartido/componentes/SelectorDePeriodo.jsx';
import NavegacionReportes from './NavegacionReportes.jsx';
import EncabezadoDeImpresion from './EncabezadoDeImpresion.jsx';
import BotonImprimir from './BotonImprimir.jsx';
import { enlaceA } from './formatoReportes.js';

// «3 × Caja (36 u)» o «5 kg»: la cantidad tal como se registró y, si fue por presentación, su equivalente en la unidad base.
function cantidadDeLinea(linea, unidadBase) {
  if (linea.presentacion) return `${formatearCantidad(linea.cantidad)} × ${linea.presentacion.nombre} (${formatearCantidad(linea.cantidadBase, unidadBase?.abreviatura ?? '')})`;
  return formatearCantidad(linea.cantidad, linea.unidad?.abreviatura ?? '');
}

// Reporte mensual de compras (solo lectura): las compras del mes agrupadas por producto, con subtotales y total general.
// El mes se cuenta por la FECHA DE LA COMPRA. Los costos son los registrados en cada línea: no se promedian.
// El mes vive en la dirección (?mes=AAAA-MM).
export default function PaginaReporteCompras() {
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const mes = params.get('mes') || mesDeHoy();
  const [carga, setCarga] = useState({ cargando: true, error: '', errores: {}, reporte: null, generadoEn: null });
  const peticion = useRef(0);

  const elegirMes = useCallback((nuevo) => {
    setParams((actuales) => {
      const nuevos = new URLSearchParams(actuales);
      if (nuevo) nuevos.set('mes', nuevo); else nuevos.delete('mes');
      return nuevos;
    }, { replace: true });
  }, [setParams]);

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '', errores: {} }));
    datos.reportes.comprasMensuales({ mes })
      .then((reporte) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', errores: {}, reporte, generadoEn: new Date().toISOString() }); })
      .catch((e) => {
        if (numero !== peticion.current) return;
        if (e?.campos) setCarga({ cargando: false, error: '', errores: e.campos, reporte: null, generadoEn: null });
        else setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) }));
      });
  }, [datos, mes]);

  useEffect(() => { cargar(); }, [cargar]);

  const { reporte, cargando, error, errores, generadoEn } = carga;
  const nombreMes = nombreDelMes(mes);

  function contenido() {
    if (!reporte && cargando) return <Cargando mensaje="Preparando el reporte…" />;
    if (!reporte && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudo preparar el reporte</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!reporte) return null;
    if (reporte.grupos.length === 0) {
      return (
        <EstadoVacio titulo={`No hay compras en ${nombreMes}`} mensaje="No se registraron compras con fecha de este mes. Probá con otro mes.">
          <Link className="boton boton--secundario" to="/compras/nueva">Registrar una compra</Link>
        </EstadoVacio>
      );
    }
    const alMes = (extra) => enlaceA('/compras', { ...extra, desde: reporte.desde, hasta: reporte.hasta });
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Compras de {nombreMes} por producto</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Compra</th>
              <th scope="col" className="tabla__numero">Cantidad</th>
              <th scope="col" className="tabla__numero">Costo unitario</th>
              <th scope="col" className="tabla__numero">Total</th>
            </tr>
          </thead>
          {reporte.grupos.map((g) => {
            const nombre = g.producto.nombre;
            return (
              <tbody key={g.producto.id}>
                <tr className="fila-grupo">
                  <th scope="rowgroup" colSpan={5}>
                    <Link to={`/productos/${g.producto.id}`}>{nombre}</Link>
                    {!g.producto.activo && <span className="etiqueta etiqueta--inactivo">Inactivo</span>}
                  </th>
                </tr>
                {g.lineas.map((l) => (
                  <tr key={l.lineaId}>
                    <td>{formatearFechaDia(l.fechaCompra)}</td>
                    <td><Link to={`/compras/${l.compraId}`} aria-label={`Ver la compra del ${formatearFechaDia(l.fechaCompra)} de ${nombre}`}>Ver compra</Link></td>
                    <td className="tabla__numero">{cantidadDeLinea(l, g.unidadBase)}</td>
                    <td className="tabla__numero">{formatearDinero(l.costoUnitario)}</td>
                    <td className="tabla__numero">{formatearDinero(l.costoTotal)}</td>
                  </tr>
                ))}
                <tr className="fila-subtotal">
                  <th scope="row" colSpan={2}>Subtotal de {nombre}</th>
                  <td className="tabla__numero">{formatearCantidad(g.subtotalCantidadBase, g.unidadBase?.abreviatura ?? '')}</td>
                  <td />
                  <td className="tabla__numero">
                    <Link to={alMes({ productoId: g.producto.id })} aria-label={`Ver las compras de ${nombre} de ${nombreMes}`}>{formatearDinero(g.subtotalCosto)}</Link>
                  </td>
                </tr>
              </tbody>
            );
          })}
          <tfoot>
            <tr>
              <th scope="row" colSpan={4}>Total general</th>
              <td className="tabla__numero"><Link to={alMes({})} aria-label={`Ver todas las compras de ${nombreMes}`}>{formatearDinero(reporte.totalGeneral)}</Link></td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  const resumen = reporte && reporte.grupos.length > 0
    ? `${reporte.cantidadCompras} ${reporte.cantidadCompras === 1 ? 'compra' : 'compras'} · ${reporte.cantidadLineas} ${reporte.cantidadLineas === 1 ? 'línea' : 'líneas'} · ${nombreMes}`
    : '';

  return (
    <section>
      <NavegacionReportes />
      <EncabezadoDeImpresion titulo="Reporte de compras" periodo={nombreMes} generadoEn={generadoEn} />
      <div className="encabezado-pagina no-imprimir">
        <h1>Reporte de compras</h1>
        <BotonImprimir deshabilitado={!reporte || reporte.grupos.length === 0} />
      </div>
      <p className="texto-suave no-imprimir">
        Las compras del mes (según la fecha de la compra), agrupadas por producto, con su subtotal y el total general.
        Los costos son los que se registraron en cada compra: no se promedian.
      </p>

      <div className="herramientas no-imprimir">
        <SelectorDePeriodo id="rep-compras-periodo" valor={mes} error={errores.mes} onChange={elegirMes} />
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">{resumen}</p>
      {reporte && error && (
        <p className="error-formulario" role="alert">{error} <button type="button" className="boton boton--secundario" onClick={cargar}>Reintentar</button></p>
      )}

      {contenido()}

      {reporte && reporte.grupos.length > 0 && (
        <p className="texto-suave nota-consolidado">
          Los costos son los registrados en cada compra, sin promediar. Los subtotales de cantidad están en la unidad base de cada producto.
          Tocá un subtotal o el total general para ver las compras que lo componen.
        </p>
      )}
    </section>
  );
}
