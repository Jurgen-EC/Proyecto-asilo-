import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { TAMANO_PAGINA_DEFECTO, productoIncompleto } from '../../nucleo/datos/productos.js';
import { useValorConRetardo } from '../../compartido/utilidades/useValorConRetardo.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';

const FILTROS = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'inactivos', texto: 'Inactivos' },
  { valor: 'todos', texto: 'Todos' },
];

export default function PaginaListaProductos() {
  const datos = useDatos();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const estado = FILTROS.some((f) => f.valor === params.get('estado')) ? params.get('estado') : 'activos';
  const pagina = Math.max(1, parseInt(params.get('pagina') ?? '1', 10) || 1);

  const [texto, setTexto] = useState(q);
  const textoRetardado = useValorConRetardo(texto, 250);
  const [carga, setCarga] = useState({ cargando: true, error: '', resultado: null });
  const peticion = useRef(0);
  const [unidadesPorId, setUnidadesPorId] = useState({});

  // Las unidades se cargan una vez para mostrar la unidad base de cada producto.
  useEffect(() => {
    let activo = true;
    datos.unidades.listarUnidades({ estado: 'todas' })
      .then((lista) => { if (activo) setUnidadesPorId(Object.fromEntries(lista.map((u) => [u.id, u]))); })
      .catch(() => { /* sin unidades la columna muestra un guion; la lista sigue funcionando */ });
    return () => { activo = false; };
  }, [datos]);

  // El estado de la búsqueda vive en la dirección: al volver desde un detalle se conserva.
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

  // Resultados mientras se escribe: el texto con retardo se refleja en la dirección.
  useEffect(() => {
    if (textoRetardado !== q) cambiarParametros({ q: textoRetardado, pagina: 1 });
  }, [textoRetardado]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga((c) => ({ ...c, cargando: true, error: '' }));
    datos.productos
      .listarProductos({ busqueda: q, estado, pagina, tamanoPagina: TAMANO_PAGINA_DEFECTO })
      .then((resultado) => { if (numero === peticion.current) setCarga({ cargando: false, error: '', resultado }); })
      .catch((e) => { if (numero === peticion.current) setCarga((c) => ({ ...c, cargando: false, error: mensajeParaUsuario(e) })); });
  }, [datos, q, estado, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  const { resultado, cargando, error } = carga;
  const hayBusqueda = q.trim() !== '';

  function limpiarBusqueda() {
    setTexto('');
    cambiarParametros({ q: '', pagina: 1 });
  }

  function contenido() {
    if (!resultado && cargando) return <Cargando mensaje="Cargando productos…" />;
    if (!resultado && error) {
      return (
        <div role="alert" className="estado-vacio">
          <h3>No se pudieron cargar los productos</h3>
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
      if (estado === 'inactivos') return <EstadoVacio titulo="No hay productos inactivos" mensaje="Los productos que desactives aparecerán aquí." />;
      const soloActivos = estado === 'activos';
      return (
        <EstadoVacio
          titulo={soloActivos ? 'No hay productos activos' : 'Todavía no hay productos'}
          mensaje={soloActivos
            ? 'Creá un producto nuevo para empezar. Si ya tenías productos, revisá el filtro «Inactivos».'
            : 'Creá el primero para empezar a armar el catálogo.'}
        >
          <Link className="boton" to="/productos/nuevo">Crear producto</Link>
        </EstadoVacio>
      );
    }
    return (
      <div className="tabla-contenedor" aria-busy={cargando}>
        <table className="tabla">
          <caption className="solo-lectores">Lista de productos</caption>
          <thead>
            <tr><th scope="col">Nombre</th><th scope="col">Unidad base</th><th scope="col">Estado</th><th scope="col"><span className="solo-lectores">Acciones</span></th></tr>
          </thead>
          <tbody>
            {resultado.items.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/productos/${p.id}`}>{p.nombre}</Link></td>
                <td>
                  {productoIncompleto(p)
                    ? <span className="etiqueta etiqueta--aviso">Incompleto</span>
                    : (unidadesPorId[p.unidadBaseId]?.abreviatura ?? '—')}
                </td>
                <td><span className={`etiqueta ${p.activo ? 'etiqueta--activo' : 'etiqueta--inactivo'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td className="tabla__acciones"><Link to={`/productos/${p.id}/editar`} aria-label={`Editar ${p.nombre}`}>Editar</Link></td>
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
        <h1>Productos</h1>
        <Link className="boton" to="/productos/nuevo">Nuevo producto</Link>
      </div>

      <div className="herramientas">
        <div className="campo campo--ancho">
          <label htmlFor="buscar-producto">Buscar producto</label>
          <input id="buscar-producto" type="search" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: azucar" />
        </div>
        <div className="campo">
          <label htmlFor="filtro-estado">Mostrar</label>
          <select id="filtro-estado" value={estado} onChange={(e) => cambiarParametros({ estado: e.target.value, pagina: 1 })}>
            {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
          </select>
        </div>
      </div>

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
    </section>
  );
}
