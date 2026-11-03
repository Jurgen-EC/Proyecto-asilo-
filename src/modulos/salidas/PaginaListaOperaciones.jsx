import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { TAMANO_PAGINA_OPERACIONES } from '../../nucleo/datos/salidas.js';
import { formatearCantidad, formatearFechaHora } from '../../compartido/utilidades/formato.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';
import NavegacionSalidas from './NavegacionSalidas.jsx';
import { TEXTOS } from './textos.js';

/** «6 kg» o «1 × Caja»: lo que se ingresó, tal como se ingresó. */
export function cantidadIngresada(operacion) {
  return operacion.presentacion
    ? `${formatearCantidad(operacion.cantidad)} × ${operacion.presentacion.nombre}`
    : formatearCantidad(operacion.cantidad, operacion.unidad?.abreviatura ?? '');
}

// Listado de salidas (clase 'salida') o de consumos (clase 'consumo'). Son listados SEPARADOS: una salida nunca aparece entre los
// consumos ni al revés. El estado de los filtros vive en la dirección (?desde=&hasta=&producto=&pagina=).
export default function PaginaListaOperaciones({ clase }) {
  const t = TEXTOS[clase];
  const esSalida = clase === 'salida';
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

  // Si la dirección trae un producto (por ejemplo al volver de otra pantalla), se recupera para mostrar su nombre.
  useEffect(() => {
    if (!productoId) { setProducto(null); return undefined; }
    if (producto?.id === productoId) return undefined;
    let activo = true;
    datos.productos.obtenerProducto(productoId).then((p) => { if (activo) setProducto(p); }).catch(() => { if (activo) setProducto(null); });
    return () => { activo = false; };
  }, [datos, productoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    const listar = esSalida ? datos.salidas.listarSalidas : datos.consumos.listarConsumos;
    setCarga((c) => ({ ...c, cargando: true, error: '', errores: {} }));
    listar({ desde, hasta, productoId, pagina, tamanoPagina: TAMANO_PAGINA_OPERACIONES })
      .then((resultado) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', errores: {}, resultado }); })
      .catch((e) => {
        if (numero !== peticion.current) return;
        if (e?.campos) setCarga({ cargando: false, error: '', errores: e.campos, resultado: null });
        else setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) }));
      });
  }, [datos, esSalida, desde, hasta, productoId, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  const { resultado, cargando, error, errores } = carga;
  const hayFiltros = Boolean(desde || hasta || productoId);

  function limpiarFiltros() {
    setProducto(null);
    cambiarParametros({ desde: '', hasta: '', producto: '', pagina: 1 });
  }

  function contenido() {
    if (!resultado && cargando) return <Cargando mensaje={t.cargandoLista} />;
    if (!resultado && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>{t.errorLista}</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!resultado) return null;
    if (resultado.total === 0) {
      if (hayFiltros) {
        return (
          <EstadoVacio titulo="Sin resultados" mensaje={t.sinResultados}>
            <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Limpiar filtros</button>
          </EstadoVacio>
        );
      }
      return (
        <EstadoVacio titulo={t.vacioTitulo} mensaje={t.vacioMensaje}>
          <Link className="boton" to={t.rutaNueva}>{t.primera}</Link>
        </EstadoVacio>
      );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">{t.captionLista}</caption>
          <thead>
            <tr>
              <th scope="col">Fecha y hora</th>
              <th scope="col">Producto</th>
              <th scope="col" className="tabla__numero">Cantidad</th>
              <th scope="col" className="tabla__numero">Descontado</th>
              {esSalida && <th scope="col">Motivo</th>}
              <th scope="col">Nota</th>
            </tr>
          </thead>
          <tbody>
            {resultado.items.map((o) => (
              <tr key={o.id}>
                <td>{formatearFechaHora(o.fechaRegistro)}</td>
                <td><Link to={`/productos/${o.producto.id}`}>{o.producto.nombre}</Link></td>
                <td className="tabla__numero">{cantidadIngresada(o)}</td>
                <td className="tabla__numero">{formatearCantidad(o.movimiento.cantidadBase, o.movimiento.unidadBase?.abreviatura ?? '')}</td>
                {esSalida && <td>{o.motivo}</td>}
                <td className="texto-suave">{o.nota ?? '—'}</td>
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
      <NavegacionSalidas />
      <div className="encabezado-pagina">
        <h1>{t.titulo}</h1>
        <Link className="boton" to={t.rutaNueva}>{t.nueva}</Link>
      </div>
      <p className="texto-suave">{t.introLista}</p>

      <div className="herramientas">
        <div className="campo">
          <label htmlFor={`${clase}-desde`}>Desde</label>
          <input id={`${clase}-desde`} type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiarParametros({ desde: e.target.value, pagina: 1 })}
            aria-invalid={errores.desde ? 'true' : undefined} aria-describedby={errores.desde ? `${clase}-desde-error` : undefined} />
          {errores.desde && <p id={`${clase}-desde-error`} className="campo__error" role="alert">{errores.desde}</p>}
        </div>
        <div className="campo">
          <label htmlFor={`${clase}-hasta`}>Hasta</label>
          <input id={`${clase}-hasta`} type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiarParametros({ hasta: e.target.value, pagina: 1 })}
            aria-invalid={errores.hasta ? 'true' : undefined} aria-describedby={errores.hasta ? `${clase}-hasta-error` : undefined} />
          {errores.hasta && <p id={`${clase}-hasta-error`} className="campo__error" role="alert">{errores.hasta}</p>}
        </div>
        <SelectorDeProducto
          etiqueta="Producto" valor={producto} incluirInactivos id={`${clase}-producto`}
          onChange={(p) => { setProducto(p); cambiarParametros({ producto: p?.id ?? '', pagina: 1 }); }}
        />
        {hayFiltros && <button type="button" className="boton boton--secundario" onClick={limpiarFiltros}>Limpiar filtros</button>}
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">
        {resultado && resultado.total > 0 && `Mostrando ${desdeN}–${hastaN} de ${resultado.total} ${resultado.total === 1 ? t.singular : t.plural}`}
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
