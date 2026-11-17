import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { formatearCantidad, formatearDinero, formatearFechaHora } from '../../compartido/utilidades/formato.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import EstadoVacio from '../../compartido/componentes/EstadoVacio.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';
import NavegacionSalidas from './NavegacionSalidas.jsx';
import { cantidadIngresada } from './PaginaListaOperaciones.jsx';

const SIN_COSTO = 'Sin costo registrado'; // un valor faltante se muestra como faltante, no como cero

const textoCosto = (importe) => (importe === null || importe === undefined ? SIN_COSTO : formatearDinero(importe));

// Detalle de un consumo (V8). Lo único que se puede editar es su COSTO (RF-030): un importe propio, origen manual, que nunca se
// deriva de un promedio. Cada cambio queda en el historial y el valor anterior no se pierde. Todo lo demás es inmutable.
export default function PaginaDetalleConsumo() {
  const { id } = useParams();
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const [carga, setCarga] = useState({ estado: 'cargando', consumo: null, codigo: '', mensaje: '' });
  const [costo, setCosto] = useState('');
  const [error, setError] = useState('');
  const [quitando, setQuitando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoAhora = useRef(false);

  const cargar = useCallback(() => {
    let activo = true;
    setCarga({ estado: 'cargando', consumo: null, codigo: '', mensaje: '' });
    datos.consumos.obtenerConsumo(id)
      .then((consumo) => { if (activo) { setCarga({ estado: 'listo', consumo, codigo: '', mensaje: '' }); setCosto(consumo.costoImporte ?? ''); } })
      .catch((e) => { if (activo) setCarga({ estado: 'error', consumo: null, codigo: e?.codigo ?? '', mensaje: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos, id]);

  useEffect(() => cargar(), [cargar]);

  async function guardar(valor) {
    if (guardandoAhora.current) return;
    guardandoAhora.current = true;
    setGuardando(true);
    setError('');
    try {
      const r = await datos.consumos.editarCostoConsumo(id, { costoImporte: valor });
      setCarga({ estado: 'listo', consumo: r.consumo, codigo: '', mensaje: '' });
      setCosto(r.consumo.costoImporte ?? '');
      if (r.cambiado) notificaciones.exito(r.consumo.costoImporte === null ? 'Costo quitado.' : 'Costo guardado.');
      else notificaciones.info('El costo ya tenía ese valor: no se cambió nada.');
      setQuitando(false);
    } catch (e) {
      setQuitando(false);
      if (e?.campos?.costoImporte) setError(e.campos.costoImporte);
      else notificaciones.error(mensajeParaUsuario(e));
    } finally {
      guardandoAhora.current = false;
      setGuardando(false);
    }
  }

  if (carga.estado === 'cargando') return <Cargando mensaje="Cargando consumo…" />;
  if (carga.estado === 'error') {
    return (
      <EstadoVacio titulo={carga.codigo === CODIGOS.NO_ENCONTRADO ? 'No se encontró el consumo' : 'No se pudo cargar el consumo'} mensaje={carga.mensaje}>
        <Link className="boton" to="/consumos">Volver a consumos</Link>
      </EstadoVacio>
    );
  }

  const { consumo } = carga;
  const base = consumo.movimiento.unidadBase?.abreviatura ?? '';
  return (
    <section>
      <NavegacionSalidas />
      <div className="encabezado-pagina">
        <h1>Consumo de {consumo.producto.nombre}</h1>
        <Link className="boton boton--secundario" to="/consumos">Volver a consumos</Link>
      </div>

      <dl className="ficha">
        <dt>Fecha y hora</dt>
        <dd>{formatearFechaHora(consumo.fechaRegistro)}</dd>
        <dt>Producto</dt>
        <dd><Link to={`/productos/${consumo.producto.id}`}>{consumo.producto.nombre}</Link></dd>
        <dt>Cantidad</dt>
        <dd>{cantidadIngresada(consumo)}</dd>
        <dt>Descontado</dt>
        <dd>{formatearCantidad(consumo.movimiento.cantidadBase, base)}</dd>
        <dt>Nota</dt>
        <dd>{consumo.nota ?? '—'}</dd>
        <dt>Costo</dt>
        <dd>{consumo.costoImporte === null ? <span className="texto-suave">{SIN_COSTO}</span> : formatearDinero(consumo.costoImporte)}</dd>
        <dt>Origen del costo</dt>
        <dd>{consumo.costoOrigen === 'manual' ? 'Manual (escrito por la persona)' : '—'}</dd>
        <dt>Movimiento</dt>
        <dd><Link to={`/movimientos/${consumo.movimientoId}`}>Ver el movimiento de inventario</Link></dd>
      </dl>

      <form
        className="formulario-modulo" noValidate aria-label="Costo del consumo"
        onSubmit={(e) => { e.preventDefault(); guardar(costo); }}
      >
        <h2>Costo del consumo</h2>
        <p className="texto-suave">El costo es un importe propio que escribís vos: no se calcula de ningún promedio. Dejalo vacío para quitarlo.</p>
        <div className="campo">
          <label htmlFor="detalle-costo">Costo (₡)</label>
          <input
            id="detalle-costo" type="text" inputMode="decimal" autoComplete="off" value={costo} disabled={guardando}
            onChange={(e) => { setError(''); setCosto(e.target.value); }}
            aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'detalle-costo-error' : undefined}
          />
          {error && <p id="detalle-costo-error" className="campo__error" role="alert">{error}</p>}
        </div>
        <div className="acciones-formulario">
          <button type="submit" className="boton" disabled={guardando}>Guardar costo</button>
          {consumo.costoImporte !== null && (
            <button type="button" className="boton boton--secundario" disabled={guardando} onClick={() => setQuitando(true)}>Quitar costo</button>
          )}
        </div>
      </form>

      <h2>Cambios del costo</h2>
      {consumo.costoCambios.length === 0 ? (
        <p className="texto-suave">El costo no ha cambiado desde que se registró el consumo.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Historial de cambios del costo</caption>
            <thead>
              <tr><th scope="col">Fecha y hora</th><th scope="col" className="tabla__numero">Antes</th><th scope="col" className="tabla__numero">Después</th></tr>
            </thead>
            <tbody>
              {consumo.costoCambios.map((c, i) => (
                <tr key={`${c.cambiadoEn}-${i}`}>
                  <td>{formatearFechaHora(c.cambiadoEn)}</td>
                  <td className="tabla__numero">{textoCosto(c.importeAnterior)}</td>
                  <td className="tabla__numero">{textoCosto(c.importeNuevo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DialogoConfirmacion
        abierto={quitando} titulo="¿Quitar el costo?" textoConfirmar="Quitar costo" peligroso ocupado={guardando}
        mensaje="El consumo quedará como «Sin costo registrado». El valor anterior se conserva en el historial de cambios."
        onConfirmar={() => guardar('')} onCancelar={() => setQuitando(false)}
      />
    </section>
  );
}
