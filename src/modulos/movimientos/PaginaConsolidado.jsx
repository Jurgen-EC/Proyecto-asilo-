import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { formatearCantidad, formatearFechaDia } from '../../compartido/utilidades/formato.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';
import NavegacionMovimientos from './NavegacionMovimientos.jsx';
import { rangoDelMes } from './periodos.js';

// «+7 kg», «−1 kg» o «0 kg»: el signo deja claro si suma o resta.
function conSigno(valor, abreviatura) {
  if (String(valor).startsWith('-')) return `−${formatearCantidad(String(valor).slice(1), abreviatura)}`;
  return Number(valor) === 0 ? formatearCantidad(valor, abreviatura) : `+${formatearCantidad(valor, abreviatura)}`;
}

// Dirección del historial con el mismo producto y período del consolidado: es lo que permite comprobar un total.
function enlaceAlHistorial(ruta, productoId, desde, hasta, extra = {}) {
  const p = new URLSearchParams({ producto: productoId });
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  for (const [clave, valor] of Object.entries(extra)) p.set(clave, valor);
  return `${ruta}?${p.toString()}`;
}

// Un total: si hay movimientos que lo componen, se puede abrir su lista; si no, es solo texto.
function Total({ texto, hay, to, etiqueta }) {
  return hay ? <Link to={to} aria-label={etiqueta}>{texto}</Link> : <span>{texto}</span>;
}

function textoDelPeriodo(desde, hasta) {
  if (desde && hasta) return `Del ${formatearFechaDia(desde)} al ${formatearFechaDia(hasta)}`;
  if (desde) return `Desde el ${formatearFechaDia(desde)}`;
  if (hasta) return `Hasta el ${formatearFechaDia(hasta)}`;
  return 'Todo el historial';
}

// Consolidado de movimientos por producto y período (solo lectura). Los ingresos y las salidas nunca se mezclan; los ajustes van aparte.
export default function PaginaConsolidado() {
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const productoId = params.get('producto') ?? '';

  const [producto, setProducto] = useState(null);
  const [carga, setCarga] = useState({ cargando: true, error: '', errores: {}, resultado: null });
  const peticion = useRef(0);

  const cambiarParametros = useCallback((cambios) => {
    setParams((actuales) => {
      const nuevos = new URLSearchParams(actuales);
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '') nuevos.delete(clave); else nuevos.set(clave, String(valor));
      }
      return nuevos;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    if (!productoId) { setProducto(null); return undefined; }
    if (producto?.id === productoId) return undefined;
    let activo = true;
    datos.productos.obtenerProducto(productoId).then((p) => { if (activo) setProducto(p); }).catch(() => { if (activo) setProducto(null); });
    return () => { activo = false; };
  }, [datos, productoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '', errores: {} }));
    datos.movimientos.consolidarMovimientos({ desde, hasta, productoId })
      .then((resultado) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', errores: {}, resultado }); })
      .catch((e) => {
        if (numero !== peticion.current) return;
        if (e?.campos) setCarga({ cargando: false, error: '', errores: e.campos, resultado: null });
        else setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) }));
      });
  }, [datos, desde, hasta, productoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const { resultado, cargando, error, errores } = carga;
  const hayFiltros = Boolean(desde || hasta || productoId);

  function limpiarFiltros() {
    setProducto(null);
    cambiarParametros({ desde: '', hasta: '', producto: '' });
  }

  function contenido() {
    if (!resultado && cargando) return <Cargando mensaje="Calculando el consolidado…" />;
    if (!resultado && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudo calcular el consolidado</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!resultado) return null;
    if (resultado.filas.length === 0) {
      return hayFiltros ? (
        <EstadoVacio titulo="No hay movimientos en este período" mensaje="Probá con otro período u otro producto.">
          <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Ver todo el historial</button>
        </EstadoVacio>
      ) : (
        <EstadoVacio titulo="Todavía no hay movimientos" mensaje="El consolidado se arma con las compras, salidas y consumos que se registren.">
          <Link className="boton" to="/compras/nueva">Registrar una compra</Link>
        </EstadoVacio>
      );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Consolidado de movimientos por producto</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="tabla__numero">Entradas</th>
              <th scope="col" className="tabla__numero">Salidas</th>
              <th scope="col" className="tabla__numero">Diferencia</th>
              <th scope="col" className="tabla__numero">Ajustes</th>
            </tr>
          </thead>
          <tbody>
            {resultado.filas.map((f) => {
              const ab = f.unidadBase?.abreviatura ?? '';
              const id = f.producto.id;
              const nombre = f.producto.nombre;
              const ruta = (r, extra) => enlaceAlHistorial(r, id, resultado.desde, resultado.hasta, extra);
              return (
                <tr key={id}>
                  <td><Link to={`/productos/${id}`}>{nombre}</Link></td>
                  <td className="tabla__numero">
                    <Total
                      texto={formatearCantidad(f.entradas, ab)} hay={f.cantidadEntradas > 0} to={ruta('/movimientos/ingresos')}
                      etiqueta={`Ver ${f.cantidadEntradas === 1 ? 'el ingreso' : `los ${f.cantidadEntradas} ingresos`} de ${nombre}`}
                    />
                  </td>
                  <td className="tabla__numero">
                    <Total
                      texto={formatearCantidad(f.salidas, ab)} hay={f.cantidadSalidas > 0} to={ruta('/movimientos/salidas')}
                      etiqueta={`Ver ${f.cantidadSalidas === 1 ? 'la salida' : `las ${f.cantidadSalidas} salidas`} de ${nombre}`}
                    />
                    <div className="texto-suave tabla__detalle">
                      Salida general:{' '}
                      <Total
                        texto={formatearCantidad(f.salidasGenerales, ab)} hay={Number(f.salidasGenerales) > 0}
                        to={ruta('/movimientos/salidas', { clase: 'salida_general' })} etiqueta={`Ver las salidas generales de ${nombre}`}
                      />
                      {' · '}Consumo:{' '}
                      <Total
                        texto={formatearCantidad(f.consumos, ab)} hay={Number(f.consumos) > 0}
                        to={ruta('/movimientos/salidas', { clase: 'consumo' })} etiqueta={`Ver los consumos de ${nombre}`}
                      />
                    </div>
                  </td>
                  <td className="tabla__numero" title="Entradas menos salidas">{conSigno(f.diferencia, ab)}</td>
                  <td className="tabla__numero">
                    <Total
                      texto={conSigno(f.ajustes, ab)} hay={f.cantidadAjustes > 0} to={ruta('/movimientos', { tipo: 'ajuste' })}
                      etiqueta={`Ver ${f.cantidadAjustes === 1 ? 'el ajuste' : `los ${f.cantidadAjustes} ajustes`} de ${nombre}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const resumen = resultado && resultado.filas.length > 0
    ? `${resultado.totalMovimientos} ${resultado.totalMovimientos === 1 ? 'movimiento' : 'movimientos'} en ${resultado.filas.length} ${resultado.filas.length === 1 ? 'producto' : 'productos'} · ${textoDelPeriodo(resultado.desde, resultado.hasta)}`
    : '';

  return (
    <section>
      <NavegacionMovimientos />
      <div className="encabezado-pagina">
        <h1>Consolidado de movimientos</h1>
        <Link className="boton boton--secundario" to="/movimientos">Ver el historial completo</Link>
      </div>
      <p className="texto-suave">
        Lo que entró y lo que salió de cada producto en el período. Las salidas incluyen los consumos. Los ajustes se muestran aparte y no cuentan como
        entradas ni como salidas. Tocá un total para ver los movimientos que lo componen.
      </p>

      <div className="herramientas">
        <div className="campo">
          <label htmlFor="cons-desde">Desde</label>
          <input id="cons-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiarParametros({ desde: e.target.value })}
            aria-invalid={errores.desde ? 'true' : undefined} aria-describedby={errores.desde ? 'cons-desde-error' : undefined} />
          {errores.desde && <p id="cons-desde-error" className="campo__error" role="alert">{errores.desde}</p>}
        </div>
        <div className="campo">
          <label htmlFor="cons-hasta">Hasta</label>
          <input id="cons-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiarParametros({ hasta: e.target.value })}
            aria-invalid={errores.hasta ? 'true' : undefined} aria-describedby={errores.hasta ? 'cons-hasta-error' : undefined} />
          {errores.hasta && <p id="cons-hasta-error" className="campo__error" role="alert">{errores.hasta}</p>}
        </div>
        <SelectorDeProducto
          etiqueta="Producto" valor={producto} incluirInactivos id="cons-producto"
          onChange={(p) => { setProducto(p); cambiarParametros({ producto: p?.id ?? '' }); }}
        />
      </div>
      <div className="herramientas" role="group" aria-label="Períodos rápidos">
        <button type="button" className="boton boton--secundario" onClick={() => cambiarParametros(rangoDelMes(0))}>Este mes</button>
        <button type="button" className="boton boton--secundario" onClick={() => cambiarParametros(rangoDelMes(-1))}>Mes anterior</button>
        {hayFiltros && <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Todo el historial</button>}
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">{resumen}</p>
      {resultado && error && (
        <p className="error-formulario" role="alert">{error} <button type="button" className="boton boton--secundario" onClick={cargar}>Reintentar</button></p>
      )}

      {contenido()}

      {resultado && resultado.filas.length > 0 && (
        <p className="texto-suave nota-consolidado">
          Las cantidades están en la unidad base de cada producto, por eso no se suman entre productos.
        </p>
      )}
    </section>
  );
}
