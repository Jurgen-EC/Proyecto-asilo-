import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { TIPOS_MOVIMIENTO, SUBTIPOS_POR_TIPO } from '../../nucleo/datos/inventario.js';
import { TAMANO_PAGINA_MOVIMIENTOS } from '../../nucleo/datos/movimientos.js';
import { formatearFechaHora } from '../../compartido/utilidades/formato.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';
import NavegacionMovimientos from './NavegacionMovimientos.jsx';
import OrigenDeMovimiento from './OrigenDeMovimiento.jsx';
import { VISTAS, ETIQUETAS_TIPO, ETIQUETAS_SUBTIPO, cantidadDeMovimiento, efectoEnInventario } from './textos.js';

// Historial de movimientos. `vista`: 'todos' (historial completo), 'ingreso' o 'salida'. Es solo lectura.
// El estado de los filtros vive en la dirección (?desde=&hasta=&producto=&tipo=&clase=&orden=&pagina=).
export default function PaginaMovimientos({ vista = 'todos' }) {
  const v = VISTAS[vista];
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const productoId = params.get('producto') ?? '';
  const tipo = vista === 'todos' ? (params.get('tipo') ?? '') : v.tipo; // las otras vistas ya fijan el tipo
  const clase = params.get('clase') ?? '';
  const orden = params.get('orden') === 'antiguo' ? 'antiguo' : 'reciente';
  const pagina = Math.max(1, parseInt(params.get('pagina') ?? '1', 10) || 1);

  const [producto, setProducto] = useState(null);
  const [carga, setCarga] = useState({ cargando: true, error: '', errores: {}, resultado: null });
  const peticion = useRef(0);

  const cambiarParametros = useCallback((cambios) => {
    setParams((actuales) => {
      const nuevos = new URLSearchParams(actuales);
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '' || (clave === 'pagina' && valor === 1) || (clave === 'orden' && valor === 'reciente')) nuevos.delete(clave);
        else nuevos.set(clave, String(valor));
      }
      return nuevos;
    }, { replace: true });
  }, [setParams]);

  // Si la dirección trae un producto (por ejemplo al llegar desde el detalle de un producto), se recupera para mostrar su nombre.
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
    datos.movimientos.listarMovimientos({ tipo, subtipo: clase, desde, hasta, productoId, orden, pagina, tamanoPagina: TAMANO_PAGINA_MOVIMIENTOS })
      .then((resultado) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', errores: {}, resultado }); })
      .catch((e) => {
        if (numero !== peticion.current) return;
        if (e?.campos) setCarga({ cargando: false, error: '', errores: e.campos, resultado: null });
        else setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) }));
      });
  }, [datos, tipo, clase, desde, hasta, productoId, orden, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  const { resultado, cargando, error, errores } = carga;
  const hayFiltros = Boolean(desde || hasta || productoId || clase || (vista === 'todos' && tipo));
  const clasesPosibles = tipo ? SUBTIPOS_POR_TIPO[tipo] ?? [] : TIPOS_MOVIMIENTO.flatMap((t) => SUBTIPOS_POR_TIPO[t]);

  function limpiarFiltros() {
    setProducto(null);
    cambiarParametros({ desde: '', hasta: '', producto: '', tipo: '', clase: '', pagina: 1 });
  }

  function contenido() {
    if (!resultado && cargando) return <Cargando mensaje={v.cargando} />;
    if (!resultado && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>{v.error}</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!resultado) return null;
    if (resultado.total === 0) {
      if (hayFiltros) {
        return (
          <EstadoVacio titulo="Sin resultados" mensaje={v.sinResultados}>
            <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Limpiar filtros</button>
          </EstadoVacio>
        );
      }
      return (
        <EstadoVacio titulo={v.vacioTitulo} mensaje={v.vacioMensaje}>
          <Link className="boton" to="/compras/nueva">Registrar una compra</Link>
        </EstadoVacio>
      );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">{v.caption}</caption>
          <thead>
            <tr>
              <th scope="col">Fecha y hora</th>
              <th scope="col">Producto</th>
              <th scope="col">Tipo</th>
              <th scope="col" className="tabla__numero">Cantidad</th>
              <th scope="col" className="tabla__numero">Efecto en el inventario</th>
              <th scope="col">Origen</th>
              <th scope="col">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {resultado.items.map((m) => (
              <tr key={m.id}>
                <td><Link to={`/movimientos/${m.id}`}>{formatearFechaHora(m.fechaHora)}</Link></td>
                <td><Link to={`/productos/${m.producto.id}`}>{m.producto.nombre}</Link></td>
                <td>
                  <span className={`etiqueta etiqueta--${m.tipo}`}>{ETIQUETAS_TIPO[m.tipo] ?? m.tipo}</span>{' '}
                  <span className="texto-suave">{ETIQUETAS_SUBTIPO[m.subtipo] ?? m.subtipo}</span>
                </td>
                <td className="tabla__numero">{cantidadDeMovimiento(m)}</td>
                <td className="tabla__numero">{efectoEnInventario(m)}</td>
                <td><OrigenDeMovimiento referencia={m.referencia} /></td>
                <td className="texto-suave">{m.usuario?.nombre ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const primero = resultado && resultado.total > 0 ? (resultado.pagina - 1) * resultado.tamanoPagina + 1 : 0;
  const ultimo = resultado ? Math.min(resultado.total, resultado.pagina * resultado.tamanoPagina) : 0;

  return (
    <section>
      <NavegacionMovimientos />
      <div className="encabezado-pagina">
        <h1>{v.titulo}</h1>
      </div>
      <p className="texto-suave">{v.intro}</p>

      <div className="herramientas">
        <div className="campo">
          <label htmlFor="mov-desde">Desde</label>
          <input id="mov-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiarParametros({ desde: e.target.value, pagina: 1 })}
            aria-invalid={errores.desde ? 'true' : undefined} aria-describedby={errores.desde ? 'mov-desde-error' : undefined} />
          {errores.desde && <p id="mov-desde-error" className="campo__error" role="alert">{errores.desde}</p>}
        </div>
        <div className="campo">
          <label htmlFor="mov-hasta">Hasta</label>
          <input id="mov-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiarParametros({ hasta: e.target.value, pagina: 1 })}
            aria-invalid={errores.hasta ? 'true' : undefined} aria-describedby={errores.hasta ? 'mov-hasta-error' : undefined} />
          {errores.hasta && <p id="mov-hasta-error" className="campo__error" role="alert">{errores.hasta}</p>}
        </div>
        <SelectorDeProducto
          etiqueta="Producto" valor={producto} incluirInactivos id="mov-producto"
          onChange={(p) => { setProducto(p); cambiarParametros({ producto: p?.id ?? '', pagina: 1 }); }}
        />
        {vista === 'todos' && (
          <div className="campo">
            <label htmlFor="mov-tipo">Tipo</label>
            <select id="mov-tipo" value={tipo} onChange={(e) => cambiarParametros({ tipo: e.target.value, clase: '', pagina: 1 })}
              aria-invalid={errores.tipo ? 'true' : undefined}>
              <option value="">Todos los tipos</option>
              {TIPOS_MOVIMIENTO.map((t) => <option key={t} value={t}>{ETIQUETAS_TIPO[t]}</option>)}
            </select>
            {errores.tipo && <p className="campo__error" role="alert">{errores.tipo}</p>}
          </div>
        )}
        <div className="campo">
          <label htmlFor="mov-clase">Clase</label>
          <select id="mov-clase" value={clase} onChange={(e) => cambiarParametros({ clase: e.target.value, pagina: 1 })}
            aria-invalid={errores.subtipo ? 'true' : undefined}>
            <option value="">Todas las clases</option>
            {clasesPosibles.map((c) => <option key={c} value={c}>{ETIQUETAS_SUBTIPO[c]}</option>)}
          </select>
          {errores.subtipo && <p className="campo__error" role="alert">{errores.subtipo}</p>}
        </div>
        <div className="campo">
          <label htmlFor="mov-orden">Orden</label>
          <select id="mov-orden" value={orden} onChange={(e) => cambiarParametros({ orden: e.target.value, pagina: 1 })}>
            <option value="reciente">Más recientes primero</option>
            <option value="antiguo">Más antiguos primero</option>
          </select>
        </div>
        {hayFiltros && <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Limpiar filtros</button>}
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">
        {resultado && resultado.total > 0 && `Mostrando ${primero}–${ultimo} de ${resultado.total} ${resultado.total === 1 ? v.singular : v.plural}`}
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
