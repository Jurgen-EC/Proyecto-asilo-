import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { ErrorDatos, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { generarClaveIdempotencia } from '../../nucleo/datos/inventario.js';
import { validarCompra, NOTA_COMPRA_MAX } from '../../nucleo/datos/compras.js';
import { formatearDinero, hoyEnCostaRica } from '../../compartido/utilidades/formato.js';
import { aDecimal } from '../../compartido/utilidades/decimales.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';
import LineaDeCompra, { costosDeLinea } from './LineaDeCompra.jsx';

let contadorLineas = 0;
const lineaNueva = () => ({ clave: `linea-${++contadorLineas}`, producto: null, medida: '', cantidad: '', costoUnitario: '', costoTotal: '', editado: null });

/** Convierte lo escrito en el formulario al formato de `registrarCompra`. */
export function armarEntrada({ fechaCompra, nota, lineas }, claveIdempotencia) {
  return {
    fechaCompra, nota, claveIdempotencia,
    lineas: lineas.map((l) => ({
      productoId: l.producto?.id,
      ...(l.medida.startsWith('p:') ? { presentacionId: l.medida.slice(2) } : { unidadId: l.medida.slice(2) || undefined }),
      cantidad: l.cantidad,
      ...(l.editado === 'unitario' ? { costoUnitario: l.costoUnitario } : {}),
      ...(l.editado === 'total' ? { costoTotal: l.costoTotal } : {}),
    })),
  };
}

// Registrar una compra (Versión 5, RF-008, RF-009, RF-013). Registrar la compra AUMENTA el inventario: compra e ingreso son
// una sola operación. Todas las reglas viven en la capa de datos; aquí solo se capturan los datos y se muestran sus mensajes.
export default function PaginaNuevaCompra() {
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const navegar = useNavigate();
  const hoy = hoyEnCostaRica();
  const [fechaCompra, setFechaCompra] = useState(hoy);
  const [nota, setNota] = useState('');
  const [lineas, setLineas] = useState(() => [lineaNueva()]);
  const [unidades, setUnidades] = useState([]);
  const [presentacionesPorProducto, setPresentacionesPorProducto] = useState({});
  const [errores, setErrores] = useState({});
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [cargaUnidades, setCargaUnidades] = useState({ cargando: true, error: '' });
  // UNA clave por compra: si la red falla y la persona reintenta, se reutiliza y la compra no se duplica.
  const clave = useRef(generarClaveIdempotencia());
  const resumen = useRef(null);
  const pedirFoco = useRef(false); // el resumen de errores existe solo después de pintar: se enfoca en un efecto

  useEffect(() => {
    let activo = true;
    datos.unidades.listarUnidades({ estado: 'activas' })
      .then((lista) => { if (activo) { setUnidades(lista); setCargaUnidades({ cargando: false, error: '' }); } })
      .catch((e) => { if (activo) setCargaUnidades({ cargando: false, error: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos]);

  useEffect(() => {
    if (pedirFoco.current && Object.keys(errores).length > 0) { pedirFoco.current = false; resumen.current?.focus(); }
  }, [errores]);

  const cambiarLinea = (clave_, cambios) => setLineas((ls) => ls.map((l) => (l.clave === clave_ ? { ...l, ...cambios } : l)));

  const elegirProducto = useCallback((claveLinea, producto) => {
    setErrores({});
    if (!producto) { cambiarLinea(claveLinea, { producto: null, medida: '' }); return; }
    cambiarLinea(claveLinea, { producto, medida: `u:${producto.unidadBaseId}` }); // por defecto, la unidad base del producto
    datos.presentaciones.listarPresentaciones(producto.id, { estado: 'activas' })
      .then((lista) => setPresentacionesPorProducto((m) => ({ ...m, [producto.id]: lista })))
      .catch(() => setPresentacionesPorProducto((m) => ({ ...m, [producto.id]: [] }))); // sin presentaciones se puede comprar por unidad
  }, [datos]);

  function agregarLinea() { setLineas((ls) => [...ls, lineaNueva()]); }
  function quitarLinea(claveLinea) { setErrores({}); setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.clave !== claveLinea) : ls)); }

  const totalCalculado = lineas.reduce((suma, l) => {
    const c = costosDeLinea(l);
    return c ? suma.plus(c.costoTotal) : suma;
  }, aDecimal(0));

  const entrada = () => armarEntrada({ fechaCompra, nota, lineas }, clave.current);

  // Primero se revisa lo evidente con las mismas reglas de la capa de datos (sin guardar nada); luego se pide confirmación.
  function revisar(e) {
    e.preventDefault();
    if (enviando) return;
    setErrores({});
    try {
      validarCompra(entrada(), { hoy });
    } catch (err) {
      if (err instanceof ErrorDatos && err.campos) { pedirFoco.current = true; setErrores(err.campos); return; }
      notificaciones.error(mensajeParaUsuario(err));
      return;
    }
    setConfirmando(true);
  }

  async function registrar() {
    if (enviando) return;
    setEnviando(true);
    try {
      const { compra } = await datos.compras.registrarCompra(entrada());
      notificaciones.exito('Compra registrada. El inventario ya se actualizó.');
      navegar(`/compras/${compra.id}`);
    } catch (err) {
      setConfirmando(false);
      if (err?.campos) { pedirFoco.current = true; setErrores(err.campos); } else notificaciones.error(mensajeParaUsuario(err));
      setEnviando(false);
    }
  }

  const mensajesDeError = Object.values(errores);
  const lineasConProducto = lineas.filter((l) => l.producto).length;

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Nueva compra</h1>
        <Link className="boton boton--secundario" to="/compras">Cancelar</Link>
      </div>
      <p className="texto-suave">Al registrar la compra, el inventario aumenta automáticamente. No hace falta anotar el ingreso por separado.</p>

      {cargaUnidades.error && <p className="error-formulario" role="alert">No se pudieron cargar las unidades: {cargaUnidades.error}</p>}

      <form className="formulario-compra" onSubmit={revisar} noValidate aria-label="Nueva compra">
        {mensajesDeError.length > 0 && (
          <div className="resumen-errores" role="alert" tabIndex={-1} ref={resumen}>
            <strong>Revisá la compra antes de registrarla:</strong>
            <ul>{[...new Set(mensajesDeError)].map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}

        <div className="formulario-modulo">
          <div className="campo">
            <label htmlFor="fecha-compra">Fecha de la compra</label>
            <input
              id="fecha-compra" type="date" value={fechaCompra} max={hoy} onChange={(e) => setFechaCompra(e.target.value)}
              aria-invalid={errores.fechaCompra ? 'true' : undefined} aria-describedby={errores.fechaCompra ? 'fecha-compra-error' : 'fecha-compra-ayuda'}
            />
            <p id="fecha-compra-ayuda" className="texto-suave campo__ayuda">El día en que se compró. No puede ser futura.</p>
            {errores.fechaCompra && <p id="fecha-compra-error" className="campo__error" role="alert">{errores.fechaCompra}</p>}
          </div>
          <div className="campo">
            <label htmlFor="nota-compra">Nota (opcional)</label>
            <textarea
              id="nota-compra" rows={2} value={nota} maxLength={NOTA_COMPRA_MAX + 50} onChange={(e) => setNota(e.target.value)}
              aria-invalid={errores.nota ? 'true' : undefined} aria-describedby={errores.nota ? 'nota-compra-error' : undefined}
            />
            {errores.nota && <p id="nota-compra-error" className="campo__error" role="alert">{errores.nota}</p>}
          </div>
        </div>

        <h2>Productos comprados</h2>
        {lineas.map((l, i) => (
          <LineaDeCompra
            key={l.clave} numero={i + 1} linea={l} errores={errores} puedeQuitar={lineas.length > 1} deshabilitado={enviando}
            opciones={{ unidades, presentaciones: l.producto ? (presentacionesPorProducto[l.producto.id] ?? []) : [] }}
            onCambiar={(cambios) => { setErrores({}); cambiarLinea(l.clave, cambios); }}
            onElegirProducto={(p) => elegirProducto(l.clave, p)} onQuitar={() => quitarLinea(l.clave)}
          />
        ))}
        <button type="button" className="boton boton--secundario" onClick={agregarLinea} disabled={enviando}>Agregar otra línea</button>

        <div className="total-compra" role="status" aria-live="polite">
          <span>Total de la compra</span>
          <strong>{formatearDinero(totalCalculado.toFixed(2))}</strong>
        </div>

        <div className="acciones-formulario">
          <button type="submit" className="boton" disabled={enviando}>Registrar compra</button>
          <Link className="boton boton--secundario" to="/compras">Cancelar</Link>
        </div>
      </form>

      <DialogoConfirmacion
        abierto={confirmando} titulo="¿Registrar esta compra?" textoConfirmar="Registrar compra" ocupado={enviando}
        mensaje={`Se registrarán ${lineasConProducto} ${lineasConProducto === 1 ? 'producto' : 'productos'} por un total de ${formatearDinero(totalCalculado.toFixed(2))}. El inventario aumentará automáticamente y una compra confirmada no se puede editar.`}
        onConfirmar={registrar} onCancelar={() => setConfirmando(false)}
      />
    </section>
  );
}
