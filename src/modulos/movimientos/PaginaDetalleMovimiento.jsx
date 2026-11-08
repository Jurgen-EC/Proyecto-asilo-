import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { formatearCantidad, formatearFechaDia, formatearFechaHora } from '../../compartido/utilidades/formato.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import { ETIQUETAS_TIPO, ETIQUETAS_SUBTIPO, cantidadDeMovimiento, efectoEnInventario, aTextoDecimal } from './textos.js';

// Qué equivalencia se usó para pasar la cantidad registrada a la unidad base del producto.
function equivalenciaUsada(m) {
  const base = m.unidadBase?.abreviatura ?? '';
  if (m.presentacion) return `1 ${m.presentacion.nombre} = ${aTextoDecimal(m.factorAplicado)} ${base}`;
  if (m.conversionId) return `1 ${m.unidad?.abreviatura ?? ''} = ${aTextoDecimal(m.factorAplicado)} ${base}`;
  return 'Ninguna: la cantidad ya estaba en la unidad base.';
}

function Origen({ origen }) {
  if (!origen) return <>Registrado directamente en el inventario (sin compra, salida ni consumo).</>;
  if (origen.tipo === 'compra') {
    return (
      <>
        Compra{origen.fechaCompra ? ` del ${formatearFechaDia(origen.fechaCompra)}` : ''}.{' '}
        <Link to={`/compras/${origen.id}`}>Ver la compra</Link>
        {origen.nota && <span className="texto-suave"> Nota de la compra: {origen.nota}</span>}
      </>
    );
  }
  if (origen.tipo === 'salida') {
    return (
      <>
        Salida{origen.motivo ? `: ${origen.motivo}` : ''}.
        {origen.nota && <span className="texto-suave"> Nota de la salida: {origen.nota}</span>}
      </>
    );
  }
  if (origen.tipo === 'consumo') {
    return (
      <>
        Consumo.
        {origen.nota && <span className="texto-suave"> Nota del consumo: {origen.nota}</span>}
      </>
    );
  }
  return <>{origen.tipo}</>;
}

// Detalle de un movimiento (solo lectura): todo lo que permite reconstruir qué pasó, quién lo hizo y con qué.
export default function PaginaDetalleMovimiento() {
  const { id } = useParams();
  const datos = useDatos();
  const [carga, setCarga] = useState({ estado: 'cargando', codigo: '', mensaje: '', movimiento: null });
  const peticion = useRef(0);

  const cargar = useCallback(() => {
    const numero = ++peticion.current;
    setCarga({ estado: 'cargando', codigo: '', mensaje: '', movimiento: null });
    datos.movimientos.obtenerMovimiento(id)
      .then((movimiento) => { if (numero === peticion.current) setCarga({ estado: 'listo', codigo: '', mensaje: '', movimiento }); })
      .catch((e) => { if (numero === peticion.current) setCarga({ estado: 'error', codigo: e?.codigo ?? '', mensaje: mensajeParaUsuario(e), movimiento: null }); });
  }, [datos, id]);

  useEffect(() => { cargar(); return () => { peticion.current += 1; }; }, [cargar]);

  if (carga.estado === 'cargando') return <Cargando mensaje="Cargando movimiento…" />;
  if (carga.estado === 'error') {
    return (
      <EstadoVacio titulo={carga.codigo === CODIGOS.NO_ENCONTRADO ? 'No se encontró el movimiento' : 'No se pudo cargar el movimiento'} mensaje={carga.mensaje}>
        {carga.codigo !== CODIGOS.NO_ENCONTRADO && <button type="button" className="boton" onClick={cargar}>Reintentar</button>}
        <Link className="boton boton--secundario" to="/movimientos">Volver al historial</Link>
      </EstadoVacio>
    );
  }

  const m = carga.movimiento;
  const base = m.unidadBase?.abreviatura ?? '';
  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Detalle del movimiento</h1>
        <Link className="boton boton--secundario" to="/movimientos">Volver al historial</Link>
      </div>
      <dl className="ficha ficha--ancha">
        <dt>Fecha y hora</dt>
        <dd>{formatearFechaHora(m.fechaHora)}</dd>
        <dt>Producto</dt>
        <dd><Link to={`/productos/${m.producto.id}`}>{m.producto.nombre}</Link></dd>
        <dt>Tipo</dt>
        <dd>
          <span className={`etiqueta etiqueta--${m.tipo}`}>{ETIQUETAS_TIPO[m.tipo] ?? m.tipo}</span>{' '}
          {ETIQUETAS_SUBTIPO[m.subtipo] ?? m.subtipo}
        </dd>
        <dt>Cantidad registrada</dt>
        <dd>{cantidadDeMovimiento(m)}</dd>
        <dt>Equivalencia usada</dt>
        <dd>
          {equivalenciaUsada(m)}
          {m.redondeado && <span className="texto-suave"> El resultado se redondeó.</span>}
        </dd>
        <dt>Efecto en el inventario</dt>
        <dd>{efectoEnInventario(m)}</dd>
        <dt>Existencia antes</dt>
        <dd>{formatearCantidad(m.existenciaAnterior, base)}</dd>
        <dt>Existencia después</dt>
        <dd>{formatearCantidad(m.existenciaResultante, base)}</dd>
        <dt>Registrado por</dt>
        <dd>{m.usuario?.nombre ?? m.usuario?.id ?? '—'}</dd>
        <dt>Origen</dt>
        <dd><Origen origen={m.origen} /></dd>
        {m.nota && (<><dt>Nota del movimiento</dt><dd>{m.nota}</dd></>)}
      </dl>
      <p>
        <Link to={`/movimientos?producto=${m.producto.id}`}>Ver todos los movimientos de este producto</Link>
      </p>
    </section>
  );
}
