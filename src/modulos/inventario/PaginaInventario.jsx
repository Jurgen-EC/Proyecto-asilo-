import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { TAMANO_PAGINA_DEFECTO } from '../../nucleo/datos/productos.js';
import { formatearCantidad, formatearFechaHora } from '../../compartido/utilidades/formato.js';
import { useValorConRetardo } from '../../compartido/utilidades/useValorConRetardo.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import PanelDatosDeDemostracion from './PanelDatosDeDemostracion.jsx';

const FILTROS = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'inactivos', texto: 'Inactivos' },
  { valor: 'todos', texto: 'Todos' },
];

// Existencias actuales (RF-016, RF-017). La existencia SIEMPRE se pide a la capa de datos: esta pantalla nunca la calcula
// ni la guarda. Se refresca sola cuando cambia el inventario (alCambiarInventario) y se puede refrescar a mano.
export default function PaginaInventario() {
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const estado = FILTROS.some((f) => f.valor === params.get('estado')) ? params.get('estado') : 'activos';
  const pagina = Math.max(1, parseInt(params.get('pagina') ?? '1', 10) || 1);

  const [texto, setTexto] = useState(q);
  const textoRetardado = useValorConRetardo(texto, 250);
  const [carga, setCarga] = useState({ cargando: true, error: '', resultado: null, actualizado: null });
  const peticion = useRef(0);

  const cambiarParametros = useCallback((cambios) => {
    setParams((actuales) => {
      const nuevos = new URLSearchParams(actuales);
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '' || (clave === 'estado' && valor === 'activos') || (clave === 'pagina' && valor === 1)) nuevos.delete(clave);
        else nuevos.set(clave, String(valor));
      }
      return nuevos;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    if (textoRetardado !== q) cambiarParametros({ q: textoRetardado, pagina: 1 });
  }, [textoRetardado]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '' }));
    datos.inventario
      .listarExistencias({ busqueda: q, estado, pagina, tamanoPagina: TAMANO_PAGINA_DEFECTO })
      .then((resultado) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', resultado, actualizado: new Date() }); })
      .catch((e) => { if (numero === peticion.current) setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) })); });
  }, [datos, q, estado, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  // Tiempo real: tras cada movimiento aceptado se vuelve a pedir la lista (con una pausa corta para agrupar avisos seguidos).
  const cargarActual = useRef(cargar);
  cargarActual.current = cargar;
  useEffect(() => {
    let temporizador;
    const salir = datos.inventario.alCambiarInventario(() => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => cargarActual.current(), 100);
    });
    return () => { clearTimeout(temporizador); salir(); };
  }, [datos]);

  const { resultado, cargando, error, actualizado } = carga;
  const hayBusqueda = q.trim() !== '';
  const incompletos = resultado?.incompletos ?? 0;

  function limpiarBusqueda() {
    setTexto('');
    cambiarParametros({ q: '', pagina: 1 });
  }

  function contenido() {
    if (!resultado && cargando) return <Cargando mensaje="Cargando existencias…" />;
    if (!resultado && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudieron cargar las existencias</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!resultado) return null;
    if (resultado.total === 0) {
      if (hayBusqueda) {
        return (
          <EstadoVacio titulo="Sin resultados" mensaje={`No hay productos que coincidan con «${q.trim()}». Probá con otra palabra o cambiá el filtro.`}>
            <button type="button" className="boton boton--secundario" onClick={limpiarBusqueda}>Limpiar búsqueda</button>
          </EstadoVacio>
        );
      }
      return (
        <EstadoVacio
          titulo={estado === 'inactivos' ? 'No hay productos inactivos' : 'No hay productos para mostrar'}
          mensaje={estado === 'inactivos'
            ? 'Los productos que desactives aparecerán aquí con su existencia.'
            : 'Las existencias se muestran para los productos del catálogo que ya tienen unidad base.'}
        >
          <Link className="boton" to="/productos">Ir a Productos</Link>
        </EstadoVacio>
      );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Existencias actuales</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="tabla__numero">Existencia</th>
              <th scope="col">Situación</th>
              <th scope="col">Última actualización</th>
            </tr>
          </thead>
          <tbody>
            {resultado.items.map((p) => (
              <tr key={p.productoId}>
                <td><Link to={`/productos/${p.productoId}`}>{p.nombre}</Link></td>
                <td className="tabla__numero">{formatearCantidad(p.cantidadBase, p.unidadBase?.abreviatura ?? '')}</td>
                <td>
                  {p.sinExistencia && <span className="etiqueta etiqueta--aviso">Sin existencia</span>}
                  {!p.activo && <span className="etiqueta etiqueta--inactivo">Inactivo</span>}
                </td>
                <td className="texto-suave">{p.actualizadoEn ? formatearFechaHora(p.actualizadoEn) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const desde = resultado && resultado.total > 0 ? (resultado.pagina - 1) * resultado.tamanoPagina + 1 : 0;
  const hasta = resultado ? Math.min(resultado.total, resultado.pagina * resultado.tamanoPagina) : 0;

  return (
    <section>
      <div className="encabezado-pagina">
        <div>
          <h1>Inventario</h1>
          <p className="texto-suave">
            Existencias actuales
            {actualizado && ` · Actualizado ${formatearFechaHora(actualizado)}. Se actualiza sola cuando cambian las existencias.`}
          </p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={cargar} disabled={cargando}>Actualizar ahora</button>
      </div>

      <div className="herramientas">
        <div className="campo campo--ancho">
          <label htmlFor="buscar-inventario">Buscar producto</label>
          <input id="buscar-inventario" type="search" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: azucar" />
        </div>
        <div className="campo">
          <label htmlFor="filtro-estado-inventario">Mostrar</label>
          <select id="filtro-estado-inventario" value={estado} onChange={(e) => cambiarParametros({ estado: e.target.value, pagina: 1 })}>
            {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
          </select>
        </div>
      </div>

      {incompletos > 0 && (
        <p className="aviso-lista" role="note">
          {incompletos === 1 ? '1 producto no aparece aquí porque no tiene unidad base.' : `${incompletos} productos no aparecen aquí porque no tienen unidad base.`}
          {' '}<Link to="/productos">Completalos en Productos</Link>.
        </p>
      )}

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">
        {resultado && resultado.total > 0 && `Mostrando ${desde}–${hasta} de ${resultado.total} ${resultado.total === 1 ? 'producto' : 'productos'}`}
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

      {datos.esDemo && <PanelDatosDeDemostracion />}
    </section>
  );
}
