import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { TAMANO_PAGINA_COMPRAS } from '../../nucleo/datos/compras.js';
import { formatearDinero, formatearFechaDia } from '../../compartido/utilidades/formato.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';
import NavegacionCostos from '../costos/NavegacionCostos.jsx';

// Listado de gastos (RF-012). NO hay totales: un gasto relacionado a una compra se identifica como relacionado y no se suma
// automáticamente a nada (cómo se evita contar dos veces el mismo importe se decide al aprobarse la fórmula de costos).
// El estado de los filtros vive en la dirección (?desde=&hasta=&producto=&pagina=).
export default function PaginaListaGastos() {
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const productoId = params.get('producto') ?? '';
  const pagina = Math.max(1, parseInt(params.get('pagina') ?? '1', 10) || 1);

  const [producto, setProducto] = useState(null);
  const [carga, setCarga] = useState({ cargando: true, error: '', errores: {}, resultado: null });
  const peticion = useRef(0);

  const cambiarParametros = useCallback((cambios) => {
    setParams((actuales) => {
      const nuevos = new URLSearchParams(actuales);
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '' || (clave === 'pagina' && valor === 1)) nuevos.delete(clave);
        else nuevos.set(clave, String(valor));
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
    datos.gastos.listarGastos({ desde, hasta, productoId, pagina, tamanoPagina: TAMANO_PAGINA_COMPRAS })
      .then((resultado) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', errores: {}, resultado }); })
      .catch((e) => {
        if (numero !== peticion.current) return;
        if (e?.campos) setCarga({ cargando: false, error: '', errores: e.campos, resultado: null });
        else setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) }));
      });
  }, [datos, desde, hasta, productoId, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  const { resultado, cargando, error, errores } = carga;
  const hayFiltros = Boolean(desde || hasta || productoId);

  function limpiarFiltros() {
    setProducto(null);
    cambiarParametros({ desde: '', hasta: '', producto: '', pagina: 1 });
  }

  function contenido() {
    if (!resultado && cargando) return <Cargando mensaje="Cargando gastos…" />;
    if (!resultado && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudieron cargar los gastos</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!resultado) return null;
    if (resultado.total === 0) {
      return hayFiltros
        ? (
          <EstadoVacio titulo="Sin resultados" mensaje="No hay gastos que coincidan con los filtros elegidos. Probá con otras fechas u otro producto.">
            <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Limpiar filtros</button>
          </EstadoVacio>
        )
        : (
          <EstadoVacio titulo="Todavía no hay gastos registrados" mensaje="Los gastos que se registren aparecerán aquí, del más reciente al más antiguo.">
            <Link className="boton" to="/gastos/nuevo">Registrar el primer gasto</Link>
          </EstadoVacio>
        );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Lista de gastos</caption>
          <thead>
            <tr>
              <th scope="col">Fecha del gasto</th>
              <th scope="col">Concepto</th>
              <th scope="col" className="tabla__numero">Importe</th>
              <th scope="col">Producto</th>
              <th scope="col">Compra relacionada</th>
              <th scope="col">Nota</th>
            </tr>
          </thead>
          <tbody>
            {resultado.items.map((g) => (
              <tr key={g.id}>
                <td>{formatearFechaDia(g.fechaGasto)}</td>
                <td>{g.concepto}</td>
                <td className="tabla__numero">{formatearDinero(g.importe)}</td>
                <td>{g.producto ? <Link to={`/productos/${g.producto.id}`}>{g.producto.nombre}</Link> : <span className="texto-suave">—</span>}</td>
                <td>
                  {g.relacionadoConCompra
                    ? (
                      <>
                        <Link to={`/compras/${g.compra.id}`}>Compra del {formatearFechaDia(g.compra.fechaCompra)}</Link>
                        <span className="etiqueta etiqueta--aviso">Relacionado, no se suma</span>
                      </>
                    )
                    : <span className="texto-suave">—</span>}
                </td>
                <td className="texto-suave">{g.nota ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const desdeN = resultado && resultado.total > 0 ? (resultado.pagina - 1) * resultado.tamanoPagina + 1 : 0;
  const hastaN = resultado ? Math.min(resultado.total, resultado.pagina * resultado.tamanoPagina) : 0;

  return (
    <section>
      <NavegacionCostos />
      <div className="encabezado-pagina">
        <h1>Gastos</h1>
        <Link className="boton" to="/gastos/nuevo">Nuevo gasto</Link>
      </div>
      <p className="texto-suave">
        Un gasto relacionado con una compra se identifica como relacionado y <strong>no se suma automáticamente</strong> al costo de esa compra.
        Esta lista no muestra totales.
      </p>

      <div className="herramientas">
        <div className="campo">
          <label htmlFor="gastos-desde">Desde</label>
          <input id="gastos-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiarParametros({ desde: e.target.value, pagina: 1 })}
            aria-invalid={errores.desde ? 'true' : undefined} aria-describedby={errores.desde ? 'gastos-desde-error' : undefined} />
          {errores.desde && <p id="gastos-desde-error" className="campo__error" role="alert">{errores.desde}</p>}
        </div>
        <div className="campo">
          <label htmlFor="gastos-hasta">Hasta</label>
          <input id="gastos-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiarParametros({ hasta: e.target.value, pagina: 1 })}
            aria-invalid={errores.hasta ? 'true' : undefined} aria-describedby={errores.hasta ? 'gastos-hasta-error' : undefined} />
          {errores.hasta && <p id="gastos-hasta-error" className="campo__error" role="alert">{errores.hasta}</p>}
        </div>
        <SelectorDeProducto
          etiqueta="Producto" valor={producto} incluirInactivos id="gastos-producto"
          onChange={(p) => { setProducto(p); cambiarParametros({ producto: p?.id ?? '', pagina: 1 }); }}
        />
        {hayFiltros && <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Limpiar filtros</button>}
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">
        {resultado && resultado.total > 0 && `Mostrando ${desdeN}–${hastaN} de ${resultado.total} ${resultado.total === 1 ? 'gasto' : 'gastos'}`}
      </p>
      {resultado && error && (
        <p className="error-formulario" role="alert">{error} <button type="button" className="boton boton--secundario" onClick={cargar}>Reintentar</button></p>
      )}

      {contenido()}

      {resultado && resultado.totalPaginas > 1 && (
        <nav className="paginacion" aria-label="Paginación">
          <button type="button" className="boton boton--secundario" disabled={resultado.pagina <= 1} onClick={() => cambiarParametros({ pagina: resultado.pagina - 1 })}>Anterior</button>
          <span>Página {resultado.pagina} de {resultado.totalPaginas}</span>
          <button type="button" className="boton boton--secundario" disabled={resultado.pagina >= resultado.totalPaginas} onClick={() => cambiarParametros({ pagina: resultado.pagina + 1 })}>Siguiente</button>
        </nav>
      )}
    </section>
  );
}
