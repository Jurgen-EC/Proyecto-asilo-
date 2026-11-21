import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { formatearCantidad, formatearFechaDia } from '../../compartido/utilidades/formato.js';
import { mesDeHoy, nombreDelMes } from '../../compartido/utilidades/periodo.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import Pestanas, { idPanel, idPestana } from '../../compartido/componentes/Pestanas.jsx';
import SelectorDePeriodo from '../../compartido/componentes/SelectorDePeriodo.jsx';
import NavegacionReportes from './NavegacionReportes.jsx';
import EncabezadoDeImpresion from './EncabezadoDeImpresion.jsx';
import BotonImprimir from './BotonImprimir.jsx';
import { conSigno, enlaceA } from './formatoReportes.js';

const ID_BASE = 'rep-inventario';
const PESTANAS = [
  { id: 'cierre', texto: 'Estado al cierre del mes' },
  { id: 'resumen', texto: 'Resumen del mes' },
];

// Un total: si hay movimientos que lo componen, se puede abrir su lista; si no, es solo texto.
function Total({ texto, hay, to, etiqueta }) {
  return hay ? <Link to={to} aria-label={etiqueta}>{texto}</Link> : <span>{texto}</span>;
}
const NombreDeProducto = ({ producto }) => (
  <>
    <Link to={`/productos/${producto.id}`}>{producto.nombre}</Link>
    {!producto.activo && <span className="etiqueta etiqueta--inactivo">Inactivo</span>}
  </>
);

// Reporte mensual de inventario (solo lectura), con dos vistas porque el hogar aún no definió cuál prefiere:
//   «Estado al cierre del mes»: la existencia de cada producto al último día del mes.
//   «Resumen del mes»: saldo inicial, ingresos, salidas, ajustes y saldo final de cada producto.
// El mes y la vista viven en la dirección (?mes=AAAA-MM&vista=cierre|resumen).
export default function PaginaReporteInventario() {
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const mes = params.get('mes') || mesDeHoy();
  const vista = params.get('vista') === 'resumen' ? 'resumen' : 'cierre';
  const [carga, setCarga] = useState({ cargando: true, error: '', errores: {}, reporte: null, vistaDelReporte: null, generadoEn: null });
  const peticion = useRef(0);

  const cambiarParametros = useCallback((cambios) => {
    setParams((actuales) => {
      const nuevos = new URLSearchParams(actuales);
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '' || (clave === 'vista' && valor === 'cierre')) nuevos.delete(clave); else nuevos.set(clave, String(valor));
      }
      return nuevos;
    }, { replace: true });
  }, [setParams]);

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '', errores: {} }));
    const consultar = vista === 'resumen' ? datos.reportes.resumenMovimientos : datos.reportes.inventarioAlCierre;
    consultar({ mes })
      .then((reporte) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', errores: {}, reporte, vistaDelReporte: vista, generadoEn: new Date().toISOString() }); })
      .catch((e) => {
        if (numero !== peticion.current) return;
        if (e?.campos) setCarga({ cargando: false, error: '', errores: e.campos, reporte: null, vistaDelReporte: null, generadoEn: null });
        else setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) }));
      });
  }, [datos, mes, vista]);

  useEffect(() => { cargar(); }, [cargar]);

  const { cargando, error, errores, generadoEn } = carga;
  // Al cambiar de vista no se muestra el reporte de la otra vista mientras se carga el nuevo (tienen columnas distintas).
  const reporte = carga.reporte && carga.vistaDelReporte === vista ? carga.reporte : null;
  const nombreMes = nombreDelMes(mes);
  const vistaTexto = PESTANAS.find((p) => p.id === vista).texto;

  function tablaDeCierre() {
    if (reporte.filas.length === 0) {
      return <EstadoVacio titulo="No hay existencias que reportar" mensaje={`Todavía no hay movimientos registrados hasta el ${formatearFechaDia(reporte.cierre)}. Probá con un mes posterior.`} />;
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Existencias al cierre de {nombreMes}</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="tabla__numero">Existencia al cierre</th>
              <th scope="col" className="tabla__numero">Movimientos hasta esa fecha</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={f.producto.id}>
                <td><NombreDeProducto producto={f.producto} /></td>
                <td className="tabla__numero">{formatearCantidad(f.existencia, f.unidadBase?.abreviatura ?? '')}</td>
                <td className="tabla__numero">
                  <Total
                    texto={String(f.cantidadMovimientos)} hay={f.cantidadMovimientos > 0}
                    to={enlaceA('/movimientos', { productoId: f.producto.id, hasta: reporte.cierre })}
                    etiqueta={`Ver ${f.cantidadMovimientos === 1 ? 'el movimiento' : `los ${f.cantidadMovimientos} movimientos`} de ${f.producto.nombre} hasta el ${formatearFechaDia(reporte.cierre)}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function tablaDeResumen() {
    if (reporte.filas.length === 0) {
      return <EstadoVacio titulo={`No hay movimientos en ${nombreMes}`} mensaje="No hubo ingresos, salidas ni ajustes en este mes, y ningún producto empezó con existencia. Probá con otro mes." />;
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Resumen de movimientos de {nombreMes} por producto</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="tabla__numero">Saldo inicial</th>
              <th scope="col" className="tabla__numero">Ingresos</th>
              <th scope="col" className="tabla__numero">Salidas</th>
              <th scope="col" className="tabla__numero">Ajustes</th>
              <th scope="col" className="tabla__numero">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => {
              const ab = f.unidadBase?.abreviatura ?? '';
              const id = f.producto.id;
              const ruta = (r, extra) => enlaceA(r, { productoId: id, desde: reporte.desde, hasta: reporte.hasta, extra });
              const nombre = f.producto.nombre;
              return (
                <tr key={id}>
                  <td><NombreDeProducto producto={f.producto} /></td>
                  <td className="tabla__numero">{formatearCantidad(f.saldoInicial, ab)}</td>
                  <td className="tabla__numero">
                    <Total
                      texto={formatearCantidad(f.ingresos, ab)} hay={f.cantidadIngresos > 0} to={ruta('/movimientos/ingresos')}
                      etiqueta={`Ver ${f.cantidadIngresos === 1 ? 'el ingreso' : `los ${f.cantidadIngresos} ingresos`} de ${nombre}`}
                    />
                  </td>
                  <td className="tabla__numero">
                    <Total
                      texto={formatearCantidad(f.salidas, ab)} hay={f.cantidadSalidas > 0} to={ruta('/movimientos/salidas')}
                      etiqueta={`Ver ${f.cantidadSalidas === 1 ? 'la salida' : `las ${f.cantidadSalidas} salidas`} de ${nombre}`}
                    />
                    <div className="texto-suave tabla__detalle">
                      Salida general:{' '}
                      <Total texto={formatearCantidad(f.salidasGenerales, ab)} hay={Number(f.salidasGenerales) > 0} to={ruta('/movimientos/salidas', { clase: 'salida_general' })} etiqueta={`Ver las salidas generales de ${nombre}`} />
                      {' · '}Consumo:{' '}
                      <Total texto={formatearCantidad(f.consumos, ab)} hay={Number(f.consumos) > 0} to={ruta('/movimientos/salidas', { clase: 'consumo' })} etiqueta={`Ver los consumos de ${nombre}`} />
                    </div>
                  </td>
                  <td className="tabla__numero">
                    <Total
                      texto={conSigno(f.ajustes, ab)} hay={f.cantidadAjustes > 0} to={ruta('/movimientos', { tipo: 'ajuste' })}
                      etiqueta={`Ver ${f.cantidadAjustes === 1 ? 'el ajuste' : `los ${f.cantidadAjustes} ajustes`} de ${nombre}`}
                    />
                  </td>
                  <td className="tabla__numero"><strong>{formatearCantidad(f.saldoFinal, ab)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

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
    return vista === 'cierre' ? tablaDeCierre() : tablaDeResumen();
  }

  let resumen = '';
  if (reporte && reporte.filas.length > 0) {
    resumen = vista === 'cierre'
      ? `${reporte.totalProductos} ${reporte.totalProductos === 1 ? 'producto' : 'productos'} · Existencias al ${formatearFechaDia(reporte.cierre)}`
      : `${reporte.totalMovimientos} ${reporte.totalMovimientos === 1 ? 'movimiento' : 'movimientos'} en ${reporte.filas.length} ${reporte.filas.length === 1 ? 'producto' : 'productos'} · ${nombreMes}`;
  }

  return (
    <section>
      <NavegacionReportes />
      <EncabezadoDeImpresion titulo="Reporte de inventario" subtitulo={vistaTexto} periodo={nombreMes} generadoEn={generadoEn} />
      <div className="encabezado-pagina no-imprimir">
        <h1>Reporte de inventario</h1>
        <BotonImprimir deshabilitado={!reporte || reporte.filas.length === 0} />
      </div>
      <p className="texto-suave no-imprimir">
        {vista === 'cierre'
          ? 'La existencia de cada producto al último día del mes, calculada desde los movimientos (hora de Costa Rica).'
          : 'Cómo se movió cada producto en el mes: de cuánto partió, qué entró, qué salió y con cuánto terminó.'}
      </p>

      <div className="herramientas no-imprimir">
        <SelectorDePeriodo id="rep-inv-periodo" valor={mes} error={errores.mes} onChange={(nuevo) => cambiarParametros({ mes: nuevo })} />
      </div>

      <div className="no-imprimir">
        <Pestanas
          etiqueta="Vistas del reporte de inventario" pestanas={PESTANAS} activa={vista} idBase={ID_BASE}
          onCambiar={(id) => cambiarParametros({ vista: id })}
        />
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">{resumen}</p>
      {reporte && error && (
        <p className="error-formulario" role="alert">{error} <button type="button" className="boton boton--secundario" onClick={cargar}>Reintentar</button></p>
      )}

      <div role="tabpanel" id={idPanel(ID_BASE, vista)} aria-labelledby={idPestana(ID_BASE, vista)}>
        {contenido()}
      </div>

      {reporte && reporte.filas.length > 0 && (
        <p className="texto-suave nota-consolidado">
          {vista === 'resumen'
            ? 'Saldo inicial + Ingresos − Salidas ± Ajustes = Saldo final. Los ajustes no cuentan como ingresos ni como salidas. '
            : ''}
          Las cantidades están en la unidad base de cada producto. Tocá un total para ver los movimientos que lo componen.
        </p>
      )}
    </section>
  );
}
