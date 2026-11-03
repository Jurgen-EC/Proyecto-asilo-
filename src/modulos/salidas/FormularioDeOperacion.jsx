import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { ErrorDatos, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { generarClaveIdempotencia } from '../../nucleo/datos/inventario.js';
import { validarOperacion, MOTIVO_MAX, NOTA_OPERACION_MAX } from '../../nucleo/datos/salidas.js';
import { formatearCantidad } from '../../compartido/utilidades/formato.js';
import { leerDecimal } from '../../compartido/utilidades/decimales.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import DialogoConfirmacion from '../../compartido/componentes/DialogoConfirmacion.jsx';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';
import { TEXTOS } from './textos.js';

/** Convierte lo escrito en el formulario al formato de `registrarSalida` / `registrarConsumo`. */
export function armarEntrada({ producto, medida, cantidad, motivo, nota }, claveIdempotencia, clase) {
  return {
    productoId: producto?.id,
    ...(medida.startsWith('p:') ? { presentacionId: medida.slice(2) } : { unidadId: medida.slice(2) || undefined }),
    cantidad,
    ...(clase === 'salida' ? { motivo } : {}), // un consumo NO tiene motivo
    nota,
    claveIdempotencia,
  };
}

// Registrar una salida (clase 'salida', RF-010) o un consumo (clase 'consumo', RF-011). Son formularios SEPARADOS que comparten el
// mismo armazón, pero cada uno dice y guarda lo suyo. Todas las reglas viven en la capa de datos (una cantidad mayor a la
// existencia SIEMPRE se rechaza allí); aquí solo se capturan los datos, se muestra lo disponible y se muestran sus mensajes.
export default function FormularioDeOperacion({ clase }) {
  const t = TEXTOS[clase];
  const esSalida = clase === 'salida';
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const navegar = useNavigate();

  const [producto, setProducto] = useState(null);
  const [medida, setMedida] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [unidades, setUnidades] = useState([]);
  const [presentaciones, setPresentaciones] = useState([]);
  const [disponible, setDisponible] = useState({ estado: 'ninguno', existencia: null, mensaje: '' });
  const [errores, setErrores] = useState({});
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [cargaUnidades, setCargaUnidades] = useState({ error: '' });
  // UNA clave por formulario: si la red falla y la persona reintenta, se reutiliza y la operación no se duplica.
  const clave = useRef(generarClaveIdempotencia());
  const enviandoAhora = useRef(false); // protege del doble clic aunque la pantalla todavía no se haya repintado
  const resumen = useRef(null);
  const pedirFoco = useRef(false);

  useEffect(() => {
    let activo = true;
    datos.unidades.listarUnidades({ estado: 'activas' })
      .then((lista) => { if (activo) setUnidades(lista); })
      .catch((e) => { if (activo) setCargaUnidades({ error: mensajeParaUsuario(e) }); });
    return () => { activo = false; };
  }, [datos]);

  useEffect(() => {
    if (pedirFoco.current && Object.keys(errores).length > 0) { pedirFoco.current = false; resumen.current?.focus(); }
  }, [errores]);

  // Existencia disponible del producto elegido (en su unidad base). Se actualiza sola si cambia el inventario.
  useEffect(() => {
    if (!producto) { setDisponible({ estado: 'ninguno', existencia: null, mensaje: '' }); return undefined; }
    let activo = true;
    const cargar = () => datos.inventario.obtenerExistencia(producto.id)
      .then((existencia) => { if (activo) setDisponible({ estado: 'listo', existencia, mensaje: '' }); })
      .catch((e) => { if (activo) setDisponible({ estado: 'error', existencia: null, mensaje: mensajeParaUsuario(e) }); });
    setDisponible({ estado: 'cargando', existencia: null, mensaje: '' });
    cargar();
    const salir = datos.inventario.alCambiarInventario((cambio) => { if (cambio.productoId === producto.id) cargar(); });
    return () => { activo = false; salir(); };
  }, [datos, producto]);

  function elegirProducto(p) {
    setErrores({});
    setProducto(p);
    setPresentaciones([]);
    if (!p) { setMedida(''); return; }
    setMedida(`u:${p.unidadBaseId}`); // por defecto, la unidad base del producto
    datos.presentaciones.listarPresentaciones(p.id, { estado: 'activas' })
      .then(setPresentaciones)
      .catch(() => setPresentaciones([])); // sin presentaciones se puede usar la unidad
  }

  const presentacion = medida.startsWith('p:') ? presentaciones.find((p) => p.id === medida.slice(2)) : null;
  const unidad = !presentacion && medida.startsWith('u:') ? unidades.find((u) => u.id === medida.slice(2)) : null;
  const entrada = () => armarEntrada({ producto, medida, cantidad, motivo, nota }, clave.current, clase);

  // Primero se revisa lo evidente con las mismas reglas de la capa de datos (sin guardar nada); luego se pide confirmación.
  function revisar(e) {
    e.preventDefault();
    if (enviandoAhora.current) return;
    setErrores({});
    try {
      validarOperacion(entrada(), clase);
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
      const registrar_ = esSalida ? datos.salidas.registrarSalida : datos.consumos.registrarConsumo;
      const r = await registrar_(entrada());
      const restante = formatearCantidad(r.existencia.cantidadBase, r[clase].movimiento.unidadBase?.abreviatura ?? '');
      notificaciones.exito(`${t.exito} Existencia actual de «${producto.nombre}»: ${restante}.`);
      navegar(t.rutaLista);
    } catch (err) {
      setConfirmando(false);
      if (err?.campos) { pedirFoco.current = true; setErrores(err.campos); } else notificaciones.error(mensajeParaUsuario(err));
      enviandoAhora.current = false;
      setEnviando(false);
    }
  }

  const mensajesDeError = Object.values(errores);
  const medidaTexto = presentacion ? presentacion.nombre : (unidad?.abreviatura ?? '');
  const cantidadLeida = leerDecimal(cantidad); // null mientras lo escrito no sea un número: el diálogo solo se abre con datos válidos
  const cantidadTexto = cantidadLeida ? formatearCantidad(cantidadLeida.toFixed(), medidaTexto) : cantidad;
  const hayDisponible = disponible.estado === 'listo' && disponible.existencia;
  const unidadBase = hayDisponible ? disponible.existencia.unidadBase?.abreviatura ?? '' : '';

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>{t.tituloForm}</h1>
        <Link className="boton boton--secundario" to={t.rutaLista}>Cancelar</Link>
      </div>
      <p className="texto-suave">{t.introForm}</p>

      {cargaUnidades.error && <p className="error-formulario" role="alert">No se pudieron cargar las unidades: {cargaUnidades.error}</p>}

      <form className="formulario-modulo" onSubmit={revisar} noValidate aria-label={t.tituloForm}>
        {mensajesDeError.length > 0 && (
          <div className="resumen-errores" role="alert" tabIndex={-1} ref={resumen}>
            <strong>{t.resumenErrores}</strong>
            <ul>{[...new Set(mensajesDeError)].map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}

        <SelectorDeProducto etiqueta="Producto" valor={producto} onChange={elegirProducto} deshabilitado={enviando} error={errores.productoId ?? ''} />

        {producto && (
          <p className="existencia-disponible" role="status" aria-live="polite">
            {disponible.estado === 'cargando' && 'Consultando la existencia…'}
            {disponible.estado === 'error' && `No se pudo consultar la existencia: ${disponible.mensaje}`}
            {hayDisponible && (
              <>
                Disponible: <strong>{formatearCantidad(disponible.existencia.cantidadBase, unidadBase)}</strong>
                {disponible.existencia.sinExistencia && ' · Sin existencia'}
              </>
            )}
          </p>
        )}

        <div className="campo">
          <label htmlFor={`${clase}-medida`}>{t.etiquetaMedida}</label>
          <select
            id={`${clase}-medida`} value={medida} disabled={!producto || enviando} onChange={(e) => { setErrores({}); setMedida(e.target.value); }}
            aria-invalid={errores.unidadId ? 'true' : undefined} aria-describedby={errores.unidadId ? `${clase}-medida-error` : undefined}
          >
            {!producto && <option value="">Primero elegí el producto</option>}
            {presentaciones.length > 0 && (
              <optgroup label="Presentaciones de este producto">
                {presentaciones.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
              </optgroup>
            )}
            {producto && (
              <optgroup label="Unidades">
                {unidades.map((u) => <option key={u.id} value={`u:${u.id}`}>{u.nombre} ({u.abreviatura})</option>)}
              </optgroup>
            )}
          </select>
          {errores.unidadId && <p id={`${clase}-medida-error`} className="campo__error" role="alert">{errores.unidadId}</p>}
        </div>

        <div className="campo">
          <label htmlFor={`${clase}-cantidad`}>{t.etiquetaCantidad}</label>
          <input
            id={`${clase}-cantidad`} type="text" inputMode="decimal" autoComplete="off" value={cantidad} disabled={enviando}
            onChange={(e) => { setErrores({}); setCantidad(e.target.value); }}
            aria-invalid={errores.cantidad ? 'true' : undefined} aria-describedby={errores.cantidad ? `${clase}-cantidad-error` : `${clase}-cantidad-ayuda`}
          />
          <p id={`${clase}-cantidad-ayuda`} className="texto-suave campo__ayuda">
            {presentacion ? `Número de ${presentacion.nombre.toLowerCase()}` : unidad ? `${t.ayudaCantidad}, en ${unidad.nombre.toLowerCase()}` : t.ayudaCantidad}
          </p>
          {errores.cantidad && <p id={`${clase}-cantidad-error`} className="campo__error" role="alert">{errores.cantidad}</p>}
        </div>

        {esSalida && (
          <div className="campo">
            <label htmlFor="salida-motivo">Motivo de la salida</label>
            <input
              id="salida-motivo" type="text" autoComplete="off" value={motivo} disabled={enviando}
              onChange={(e) => { setErrores({}); setMotivo(e.target.value); }}
              aria-invalid={errores.motivo ? 'true' : undefined} aria-describedby={errores.motivo ? 'salida-motivo-error' : 'salida-motivo-ayuda'}
            />
            <p id="salida-motivo-ayuda" className="texto-suave campo__ayuda">Escribí por qué sale el producto (hasta {MOTIVO_MAX} caracteres).</p>
            {errores.motivo && <p id="salida-motivo-error" className="campo__error" role="alert">{errores.motivo}</p>}
          </div>
        )}

        <div className="campo">
          <label htmlFor={`${clase}-nota`}>Nota (opcional)</label>
          <textarea
            id={`${clase}-nota`} rows={2} value={nota} maxLength={NOTA_OPERACION_MAX + 50} disabled={enviando}
            onChange={(e) => { setErrores({}); setNota(e.target.value); }}
            aria-invalid={errores.nota ? 'true' : undefined} aria-describedby={errores.nota ? `${clase}-nota-error` : undefined}
          />
          {errores.nota && <p id={`${clase}-nota-error`} className="campo__error" role="alert">{errores.nota}</p>}
        </div>

        <div className="acciones-formulario">
          <button type="submit" className="boton" disabled={enviando}>{t.registrar}</button>
          <Link className="boton boton--secundario" to={t.rutaLista}>Cancelar</Link>
        </div>
      </form>

      <DialogoConfirmacion
        abierto={confirmando} titulo={t.dialogoTitulo} textoConfirmar={t.registrar} ocupado={enviando}
        mensaje={`Se descontarán ${cantidadTexto} de «${producto?.nombre ?? ''}» del inventario${esSalida ? ` por el motivo «${motivo.trim()}»` : ''}. ${t.ayudaDialogo}`}
        onConfirmar={registrar} onCancelar={() => setConfirmando(false)}
      />
    </section>
  );
}
