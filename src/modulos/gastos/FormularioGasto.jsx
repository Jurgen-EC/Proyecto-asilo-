import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { ErrorDatos, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { generarClaveIdempotencia } from '../../nucleo/datos/inventario.js';
import { validarGasto, CONCEPTO_MIN, CONCEPTO_MAX, NOTA_GASTO_MAX } from '../../nucleo/datos/gastos.js';
import { formatearDinero, formatearFechaDia, hoyEnCostaRica } from '../../compartido/utilidades/formato.js';
import { leerDecimal } from '../../compartido/utilidades/decimales.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';

/** Convierte lo escrito en el formulario al formato de `registrarGasto`. */
export function armarEntradaGasto({ fechaGasto, concepto, importe, producto, compraId, nota }, claveIdempotencia) {
  return { fechaGasto, concepto, importe, productoId: producto?.id ?? '', compraId: compraId || '', nota, claveIdempotencia };
}

// Registrar un gasto (RF-012). Las reglas viven en la capa de datos; aquí solo se capturan los datos y se muestran sus mensajes.
// Un gasto relacionado a una compra se identifica como relacionado y NO se suma automáticamente a la compra.
export default function FormularioGasto() {
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const hoy = hoyEnCostaRica();

  const [fechaGasto, setFechaGasto] = useState(hoy);
  const [concepto, setConcepto] = useState('');
  const [importe, setImporte] = useState('');
  const [producto, setProducto] = useState(null);
  const [compraId, setCompraId] = useState(params.get('compra') ?? '');
  const [nota, setNota] = useState('');
  const [compras, setCompras] = useState([]);
  const [cargaCompras, setCargaCompras] = useState({ error: '' });
  const [errores, setErrores] = useState({});
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // UNA clave por formulario: si la red falla y la persona reintenta, se reutiliza y el gasto no se duplica.
  const clave = useRef(generarClaveIdempotencia());
  const enviandoAhora = useRef(false);
  const resumen = useRef(null);
  const pedirFoco = useRef(false);

  useEffect(() => {
    let activo = true;
    datos.compras.listarCompras({ pagina: 1, tamanoPagina: 100 }) // PROVISIONAL: las 100 compras más recientes
      .then((r) => { if (activo) setCompras(r.items); })
      .catch((e) => { if (activo) setCargaCompras({ error: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos]);

  useEffect(() => {
    if (pedirFoco.current && Object.keys(errores).length > 0) { pedirFoco.current = false; resumen.current?.focus(); }
  }, [errores]);

  const entrada = () => armarEntradaGasto({ fechaGasto, concepto, importe, producto, compraId, nota }, clave.current);
  const cambiar = (poner) => (e) => { setErrores({}); poner(e.target.value); };

  function revisar(e) {
    e.preventDefault();
    if (enviandoAhora.current) return;
    setErrores({});
    try {
      validarGasto(entrada(), { hoy });
    } catch (err) {
      if (err instanceof ErrorDatos && err.campos) { pedirFoco.current = true; setErrores(err.campos); return; }
      notificaciones.error(mensajeParaUsuario(err));
      return;
    }
    setConfirmando(true);
  }

  async function registrar() {
    if (enviandoAhora.current) return;
    enviandoAhora.current = true;
    setEnviando(true);
    try {
      await datos.gastos.registrarGasto(entrada());
      notificaciones.exito('Gasto registrado.');
      navegar('/gastos');
    } catch (err) {
      setConfirmando(false);
      if (err?.campos) { pedirFoco.current = true; setErrores(err.campos); } else notificaciones.error(mensajeParaUsuario(err));
      enviandoAhora.current = false;
      setEnviando(false);
    }
  }

  const mensajesDeError = Object.values(errores);
  const importeLeido = leerDecimal(importe);
  const comprasConActual = compraId && !compras.some((c) => c.id === compraId) ? [{ id: compraId, fechaCompra: '', total: null, productos: [] }, ...compras] : compras;

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Nuevo gasto</h1>
        <Link className="boton boton--secundario" to="/gastos">Cancelar</Link>
      </div>
      <p className="texto-suave">Registrá un gasto con su concepto e importe. Podés asociarlo a un producto y a una compra; un gasto relacionado a una compra <strong>no se suma</strong> al costo de esa compra.</p>
      {cargaCompras.error && <p className="error-formulario" role="alert">No se pudieron cargar las compras: {cargaCompras.error}</p>}

      <form className="formulario-modulo" onSubmit={revisar} noValidate aria-label="Nuevo gasto">
        {mensajesDeError.length > 0 && (
          <div className="resumen-errores" role="alert" tabIndex={-1} ref={resumen}>
            <strong>Revisá el gasto antes de registrarlo:</strong>
            <ul>{[...new Set(mensajesDeError)].map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}

        <div className="campo">
          <label htmlFor="gasto-fecha">Fecha del gasto</label>
          <input id="gasto-fecha" type="date" value={fechaGasto} max={hoy} disabled={enviando} onChange={cambiar(setFechaGasto)}
            aria-invalid={errores.fechaGasto ? 'true' : undefined} aria-describedby={errores.fechaGasto ? 'gasto-fecha-error' : undefined} />
          {errores.fechaGasto && <p id="gasto-fecha-error" className="campo__error" role="alert">{errores.fechaGasto}</p>}
        </div>

        <div className="campo">
          <label htmlFor="gasto-concepto">Concepto</label>
          <input id="gasto-concepto" type="text" autoComplete="off" value={concepto} disabled={enviando} onChange={cambiar(setConcepto)}
            aria-invalid={errores.concepto ? 'true' : undefined} aria-describedby={errores.concepto ? 'gasto-concepto-error' : 'gasto-concepto-ayuda'} />
          <p id="gasto-concepto-ayuda" className="texto-suave campo__ayuda">Entre {CONCEPTO_MIN} y {CONCEPTO_MAX} caracteres. Por ejemplo: flete, empaque, etc.</p>
          {errores.concepto && <p id="gasto-concepto-error" className="campo__error" role="alert">{errores.concepto}</p>}
        </div>

        <div className="campo">
          <label htmlFor="gasto-importe">Importe (₡)</label>
          <input id="gasto-importe" type="text" inputMode="decimal" autoComplete="off" value={importe} disabled={enviando} onChange={cambiar(setImporte)}
            aria-invalid={errores.importe ? 'true' : undefined} aria-describedby={errores.importe ? 'gasto-importe-error' : 'gasto-importe-ayuda'} />
          <p id="gasto-importe-ayuda" className="texto-suave campo__ayuda">Hasta 2 decimales.</p>
          {errores.importe && <p id="gasto-importe-error" className="campo__error" role="alert">{errores.importe}</p>}
        </div>

        <SelectorDeProducto etiqueta="Producto (opcional)" valor={producto} incluirInactivos id="gasto-producto"
          onChange={(p) => { setErrores({}); setProducto(p); }} deshabilitado={enviando} error={errores.productoId ?? ''} />

        <div className="campo">
          <label htmlFor="gasto-compra">Compra relacionada (opcional)</label>
          <select id="gasto-compra" value={compraId} disabled={enviando} onChange={cambiar(setCompraId)}
            aria-invalid={errores.compraId ? 'true' : undefined} aria-describedby={errores.compraId ? 'gasto-compra-error' : 'gasto-compra-ayuda'}>
            <option value="">Ninguna</option>
            {comprasConActual.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fechaCompra ? `${formatearFechaDia(c.fechaCompra)} · ${formatearDinero(c.total)}${c.productos?.length ? ` · ${c.productos.join(', ')}` : ''}` : 'Compra elegida'}
              </option>
            ))}
          </select>
          <p id="gasto-compra-ayuda" className="texto-suave campo__ayuda">Se muestran las 100 compras más recientes. No cambia el costo de la compra.</p>
          {errores.compraId && <p id="gasto-compra-error" className="campo__error" role="alert">{errores.compraId}</p>}
        </div>

        <div className="campo">
          <label htmlFor="gasto-nota">Nota (opcional)</label>
          <textarea id="gasto-nota" rows={2} value={nota} maxLength={NOTA_GASTO_MAX + 50} disabled={enviando} onChange={cambiar(setNota)}
            aria-invalid={errores.nota ? 'true' : undefined} aria-describedby={errores.nota ? 'gasto-nota-error' : undefined} />
          {errores.nota && <p id="gasto-nota-error" className="campo__error" role="alert">{errores.nota}</p>}
        </div>

        <div className="acciones-formulario">
          <button type="submit" className="boton" disabled={enviando}>Registrar gasto</button>
          <Link className="boton boton--secundario" to="/gastos">Cancelar</Link>
        </div>
      </form>

      <DialogoConfirmacion
        abierto={confirmando} titulo="¿Registrar este gasto?" textoConfirmar="Registrar gasto" ocupado={enviando}
        mensaje={`Se registrará el gasto «${concepto.trim()}» por ${importeLeido ? formatearDinero(importeLeido.toFixed(2)) : importe}${compraId ? ', relacionado con una compra (no se suma a su costo)' : ''}. Una vez registrado, el gasto no se puede editar.`}
        onConfirmar={registrar} onCancelar={() => setConfirmando(false)}
      />
    </section>
  );
}
