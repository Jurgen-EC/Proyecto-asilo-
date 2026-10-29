import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { TAMANO_PAGINA_COMPRAS } from '../../nucleo/datos/compras.js';
import { formatearDinero, formatearFechaDia, formatearFechaHora } from '../../compartido/utilidades/formato.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';

/** «Papa, Arroz y 2 más»: resume los productos de una compra sin desbordar la fila. */
export function resumirProductos(nombres, maximo = 3) {
  if (nombres.length <= maximo) return nombres.join(', ');
  const resto = nombres.length - maximo;
  return `${nombres.slice(0, maximo).join(', ')} y ${resto} más`;
}

// Compras registradas (Versión 5, RF-008). El estado de los filtros vive en la dirección (?desde=&hasta=&producto=&pagina=),
// así al volver desde un detalle se conserva. Los datos siempre se piden a la capa de datos.
export default function PaginaListaCompras() {
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

  // Si la dirección trae un producto (por ejemplo al volver de un detalle), se recupera para mostrar su nombre.
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
    datos.compras
      .listarCompras({ desde, hasta, productoId, pagina, tamanoPagina: TAMANO_PAGINA_COMPRAS })
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
    if (!resultado && cargando) return <Cargando mensaje="Cargando compras…" />;
    if (!resultado && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudieron cargar las compras</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!resultado) return null;
    if (resultado.total === 0) {
      if (hayFiltros) {
        return (
          <EstadoVacio titulo="Sin resultados" mensaje="No hay compras que coincidan con los filtros elegidos. Probá con otras fechas u otro producto.">
            <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Limpiar filtros</button>
          </EstadoVacio>
        );
      }
      return <EstadoVacio titulo="Todavía no hay compras registradas" mensaje="Las compras que se registren aparecerán aquí, de la más reciente a la más antigua." />;
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Lista de compras</caption>
          <thead>
            <tr>
              <th scope="col">Fecha de la compra</th><th scope="col">Productos</th>
              <th scope="col" className="tabla__numero">Líneas</th><th scope="col" className="tabla__numero">Total</th>
              <th scope="col">Registrada</th>
            </tr>
          </thead>
          <tbody>
            {resultado.items.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/compras/${c.id}`}>{formatearFechaDia(c.fechaCompra)}</Link></td>
                <td>{resumirProductos(c.productos)}</td>
                <td className="tabla__numero">{c.cantidadLineas}</td>
                <td className="tabla__numero">{formatearDinero(c.total)}</td>
                <td>{formatearFechaHora(c.registradaEn)}</td>
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
      <div className="encabezado-pagina">
        <h1>Compras</h1>
      </div>
      <p className="texto-suave">Cada compra registrada aumenta el inventario automáticamente: no hace falta anotar el ingreso aparte.</p>

      <div className="herramientas">
        <div className="campo">
          <label htmlFor="compras-desde">Desde</label>
          <input id="compras-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiarParametros({ desde: e.target.value, pagina: 1 })}
            aria-invalid={errores.desde ? 'true' : undefined} aria-describedby={errores.desde ? 'compras-desde-error' : undefined} />
          {errores.desde && <p id="compras-desde-error" className="campo__error" role="alert">{errores.desde}</p>}
        </div>
        <div className="campo">
          <label htmlFor="compras-hasta">Hasta</label>
          <input id="compras-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiarParametros({ hasta: e.target.value, pagina: 1 })}
            aria-invalid={errores.hasta ? 'true' : undefined} aria-describedby={errores.hasta ? 'compras-hasta-error' : undefined} />
          {errores.hasta && <p id="compras-hasta-error" className="campo__error" role="alert">{errores.hasta}</p>}
        </div>
        <SelectorDeProducto
          etiqueta="Producto" valor={producto} incluirInactivos id="compras-producto"
          onChange={(p) => { setProducto(p); cambiarParametros({ producto: p?.id ?? '', pagina: 1 }); }}
        />
        {hayFiltros && <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Limpiar filtros</button>}
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">
        {resultado && resultado.total > 0 && `Mostrando ${desdeN}–${hastaN} de ${resultado.total} ${resultado.total === 1 ? 'compra' : 'compras'}`}
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
