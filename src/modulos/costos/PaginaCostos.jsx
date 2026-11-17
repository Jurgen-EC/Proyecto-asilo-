import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { TAMANO_PAGINA_DEFECTO } from '../../nucleo/datos/productos.js';
import { useValorConRetardo } from '../../compartido/utilidades/useValorConRetardo.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import NavegacionCostos from './NavegacionCostos.jsx';
import CostoPromedio from './CostoPromedio.jsx';

const FILTROS = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'inactivos', texto: 'Inactivos' },
  { valor: 'todos', texto: 'Todos' },
];

// Costos por producto (V8). Muestra cuántas líneas de compra tiene cada producto y, en «Costo promedio», «Pendiente de definición»
// (RF-027, RF-028 y RF-029 están BLOQUEADOS hasta que el hogar apruebe la fórmula). Aquí no se calcula ni se rotula ningún promedio.
export default function PaginaCostos() {
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const estado = FILTROS.some((f) => f.valor === params.get('estado')) ? params.get('estado') : 'activos';
  const pagina = Math.max(1, parseInt(params.get('pagina') ?? '1', 10) || 1);

  const [texto, setTexto] = useState(q);
  const textoRetardado = useValorConRetardo(texto, 250);
  const [carga, setCarga] = useState({ cargando: true, error: '', resultado: null });
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
    datos.costos.listarCostosPorProducto({ busqueda: q, estado, pagina, tamanoPagina: TAMANO_PAGINA_DEFECTO })
      .then((resultado) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', resultado }); })
      .catch((e) => { if (numero === peticion.current) setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) })); });
  }, [datos, q, estado, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  const { resultado, cargando, error } = carga;
  const hayBusqueda = q.trim() !== '';

  function contenido() {
    if (!resultado && cargando) return <Cargando mensaje="Cargando costos…" />;
    if (!resultado && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudieron cargar los costos</h3>
          <p>{error}</p>
          <button type="button" className="boton" onClick={cargar}>Reintentar</button>
        </div>
      );
    }
    if (!resultado) return null;
    if (resultado.total === 0) {
      return hayBusqueda
        ? (
          <EstadoVacio titulo="Sin resultados" mensaje={`No hay productos que coincidan con «${q.trim()}». Probá con otra palabra o cambiá el filtro.`}>
            <button type="button" className="boton boton--secundario" onClick={() => { setTexto(''); cambiarParametros({ q: '', pagina: 1 }); }}>Limpiar búsqueda</button>
          </EstadoVacio>
        )
        : (
          <EstadoVacio titulo="No hay productos para mostrar" mensaje="Los costos se muestran por producto del catálogo.">
            <Link className="boton" to="/productos">Ir a Productos</Link>
          </EstadoVacio>
        );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Costos por producto</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="tabla__numero">Compras registradas</th>
              <th scope="col">Costo promedio</th>
              <th scope="col"><span className="solo-lectores">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {resultado.items.map((p) => (
              <tr key={p.productoId}>
                <td>
                  <Link to={`/costos/${p.productoId}`}>{p.nombre}</Link>
                  {!p.activo && <span className="etiqueta etiqueta--inactivo">Inactivo</span>}
                </td>
                <td className="tabla__numero">{p.lineasDeCompra === 0 ? <span className="texto-suave">Sin compras registradas</span> : p.lineasDeCompra}</td>
                <td><CostoPromedio historial={[]} /></td>
                <td className="tabla__acciones"><Link to={`/costos/${p.productoId}`} aria-label={`Ver costos de adquisición de ${p.nombre}`}>Ver historial</Link></td>
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
        <h1>Costos de adquisición</h1>
      </div>
      <p className="aviso-lista" role="note">
        El costo promedio está <strong>bloqueado</strong> hasta que el hogar apruebe la fórmula. Lo que se muestra en el historial de cada producto
        es lo que realmente costó cada compra, sin promediar.
      </p>

      <div className="herramientas">
        <div className="campo campo--ancho">
          <label htmlFor="buscar-costos">Buscar producto</label>
          <input id="buscar-costos" type="search" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: azucar" />
        </div>
        <div className="campo">
          <label htmlFor="filtro-estado-costos">Mostrar</label>
          <select id="filtro-estado-costos" value={estado} onChange={(e) => cambiarParametros({ estado: e.target.value, pagina: 1 })}>
            {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
          </select>
        </div>
      </div>

      <p className="texto-suave resumen-lista" role="status" aria-live="polite">
        {resultado && resultado.total > 0 && `Mostrando ${desdeN}–${hastaN} de ${resultado.total} ${resultado.total === 1 ? 'producto' : 'productos'}`}
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
