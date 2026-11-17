import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { TAMANO_PAGINA_COMPRAS } from '../../nucleo/datos/compras.js';
import { formatearDinero, formatearFechaDia } from '../../compartido/utilidades/formato.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import { cantidadIngresada } from '../salidas/PaginaListaOperaciones.jsx';
import NavegacionCostos from './NavegacionCostos.jsx';
import CostoPromedio from './CostoPromedio.jsx';

// Historial de costos de adquisición de UN producto: exactamente las líneas de compra registradas, tal como se registraron
// (fecha, cantidad, costo unitario y total). Es información REAL: no se rotula como costo promedio, no se promedia, no se
// convierte a costo por unidad base y no hay totales, porque la fórmula del hogar todavía no está aprobada.
export default function PaginaHistorialCostos() {
  const { productoId } = useParams();
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const pagina = Math.max(1, parseInt(params.get('pagina') ?? '1', 10) || 1);
  const [carga, setCarga] = useState({ cargando: true, error: '', codigo: '', errores: {}, resultado: null });
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

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '', codigo: '', errores: {} }));
    datos.costos.historialCostosAdquisicion(productoId, { desde, hasta, pagina, tamanoPagina: TAMANO_PAGINA_COMPRAS })
      .then((resultado) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', codigo: '', errores: {}, resultado }); })
      .catch((e) => {
        if (numero !== peticion.current) return;
        if (e?.campos) setCarga((c) => ({ ...c, cargando: false, errores: e.campos }));
        else setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e), codigo: e?.codigo ?? '' }));
      });
  }, [datos, productoId, desde, hasta, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  const { resultado, cargando, error, codigo, errores } = carga;
  const hayFiltros = Boolean(desde || hasta);

  if (!resultado && cargando) return <Cargando mensaje="Cargando el historial de costos…" />;
  if (!resultado && error) {
    return (
      <EstadoVacio titulo={codigo === CODIGOS.NO_ENCONTRADO ? 'No se encontró el producto' : 'No se pudo cargar el historial'} mensaje={error}>
        <Link className="boton" to="/costos">Volver a costos</Link>
      </EstadoVacio>
    );
  }
  if (!resultado) {
    // fechas inválidas en la dirección: se muestran los mensajes y se ofrece limpiar
    return (
      <section>
        <NavegacionCostos />
        <div className="error-formulario" role="alert">{Object.values(errores).join(' ')}</div>
        <button type="button" className="boton boton--secundario" onClick={() => cambiarParametros({ desde: '', hasta: '', pagina: 1 })}>Limpiar filtros</button>
      </section>
    );
  }

  const { producto } = resultado;
  const desdeN = resultado.total > 0 ? (resultado.pagina - 1) * resultado.tamanoPagina + 1 : 0;
  const hastaN = Math.min(resultado.total, resultado.pagina * resultado.tamanoPagina);

  return (
    <section>
      <NavegacionCostos />
      <div className="encabezado-pagina">
        <h1>{producto.nombre}</h1>
        <Link className="boton boton--secundario" to="/costos">Volver a costos</Link>
      </div>

      <dl className="ficha">
        <dt>Costo promedio</dt>
        <dd><CostoPromedio historial={resultado.items} /></dd>
        <dt>Estado</dt>
        <dd>{producto.activo ? 'Activo' : 'Inactivo'}</dd>
      </dl>
      <p className="aviso-lista" role="note">
        El costo promedio está <strong>bloqueado</strong> hasta que el hogar apruebe la fórmula. Abajo está lo que realmente costó cada compra registrada,
        tal como se registró: no es un promedio.
      </p>

      <div className="herramientas">
        <div className="campo">
          <label htmlFor="historial-desde">Desde</label>
          <input id="historial-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiarParametros({ desde: e.target.value, pagina: 1 })}
            aria-invalid={errores.desde ? 'true' : undefined} />
        </div>
        <div className="campo">
          <label htmlFor="historial-hasta">Hasta</label>
          <input id="historial-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiarParametros({ hasta: e.target.value, pagina: 1 })}
            aria-invalid={errores.hasta ? 'true' : undefined} />
        </div>
        {hayFiltros && <button type="button" className="boton boton--secundario" onClick={() => cambiarParametros({ desde: '', hasta: '', pagina: 1 })}>Limpiar filtros</button>}
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">
        {resultado.total > 0 && `Mostrando ${desdeN}–${hastaN} de ${resultado.total} ${resultado.total === 1 ? 'línea de compra' : 'líneas de compra'}`}
      </p>

      {resultado.total === 0 ? (
        hayFiltros
          ? <EstadoVacio titulo="Sin resultados" mensaje="No hay compras de este producto en ese rango de fechas." />
          : (
            <EstadoVacio titulo="Sin compras registradas" mensaje="Este producto todavía no tiene compras registradas, así que no hay costos de adquisición que mostrar.">
              <Link className="boton" to="/compras/nueva">Registrar una compra</Link>
            </EstadoVacio>
          )
      ) : (
        <div className="tabla-contenedor" aria-busy={cargando}>
          <table className="tabla">
            <caption className="solo-lectores">Historial de costos de adquisición de {producto.nombre}</caption>
            <thead>
              <tr>
                <th scope="col">Fecha de la compra</th>
                <th scope="col" className="tabla__numero">Cantidad</th>
                <th scope="col" className="tabla__numero">Costo unitario</th>
                <th scope="col" className="tabla__numero">Costo total</th>
              </tr>
            </thead>
            <tbody>
              {resultado.items.map((i) => (
                <tr key={i.lineaId}>
                  <td><Link to={`/compras/${i.compraId}`}>{formatearFechaDia(i.fechaCompra)}</Link></td>
                  <td className="tabla__numero">{cantidadIngresada(i)}</td>
                  <td className="tabla__numero">
                    {formatearDinero(i.costoUnitario)}
                    <span className="texto-suave unidad-costo"> por {i.presentacion ? i.presentacion.nombre : (i.unidad?.abreviatura ?? '')}</span>
                  </td>
                  <td className="tabla__numero">{formatearDinero(i.costoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resultado.totalPaginas > 1 && (
        <nav className="paginacion" aria-label="Paginación">
          <button type="button" className="boton boton--secundario" disabled={resultado.pagina <= 1} onClick={() => cambiarParametros({ pagina: resultado.pagina - 1 })}>Anterior</button>
          <span>Página {resultado.pagina} de {resultado.totalPaginas}</span>
          <button type="button" className="boton boton--secundario" disabled={resultado.pagina >= resultado.totalPaginas} onClick={() => cambiarParametros({ pagina: resultado.pagina + 1 })}>Siguiente</button>
        </nav>
      )}
    </section>
  );
}
