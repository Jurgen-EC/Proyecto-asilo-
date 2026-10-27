import { useEffect, useRef, useState } from 'react';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { CODIGOS, mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { generarClaveIdempotencia } from '../../nucleo/datos/inventario.js';
import { formatearCantidad } from '../../compartido/utilidades/formato.js';
import { useNotificaciones } from '../../compartido/componentes/Notificaciones.jsx';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';

const NOTA_DEMO = 'DATOS DE DEMOSTRACIÓN';

// SOLO PARA DESARROLLO: la V4 no incluye formularios de ingreso ni de salida (llegan en las versiones 5 y 6).
// Este panel existe para poder ver funcionar las existencias con el adaptador de demostración. Aparece únicamente
// cuando el adaptador es de demostración y todo lo que registra queda marcado con la nota «DATOS DE DEMOSTRACIÓN».
export default function PanelDatosDeDemostracion() {
  const datos = useDatos();
  const notificaciones = useNotificaciones();
  const [producto, setProducto] = useState(null);
  const [tipo, setTipo] = useState('ingreso');
  const [cantidad, setCantidad] = useState('');
  const [unidadId, setUnidadId] = useState('');
  const [unidades, setUnidades] = useState([]);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  // Una clave por intento: si la operación fue aceptada se genera otra; si fue rechazada, no quedó registrada.
  const clave = useRef(generarClaveIdempotencia());

  useEffect(() => {
    let activo = true;
    datos.unidades.listarUnidades({ estado: 'activas' })
      .then((lista) => { if (activo) setUnidades(lista); })
      .catch(() => { /* sin unidades no se puede elegir otra; la unidad base del producto se usa igual */ });
    return () => { activo = false; };
  }, [datos]);

  function elegirProducto(p) {
    setProducto(p);
    setUnidadId(p?.unidadBaseId ?? '');
    setErrores({});
  }

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setErrores({});
    setEnviando(true);
    try {
      const r = await datos.inventario.registrarMovimiento({
        productoId: producto?.id, tipo, subtipo: tipo === 'ingreso' ? 'inventario_inicial' : 'salida_general',
        cantidad, unidadId, claveIdempotencia: clave.current, nota: NOTA_DEMO,
      });
      const base = unidades.find((u) => u.id === producto.unidadBaseId);
      notificaciones.exito(`${tipo === 'ingreso' ? 'Ingreso' : 'Salida'} de demostración registrado. Existencia: ${formatearCantidad(r.existencia.cantidadBase, base?.abreviatura ?? '')}.`);
      setCantidad('');
      clave.current = generarClaveIdempotencia();
    } catch (err) {
      if (err?.campos) setErrores(err.campos);
      else if (err?.codigo === CODIGOS.CONVERSION_NO_CONFIGURADA || err?.codigo === CODIGOS.UNIDAD_INCOMPATIBLE) setErrores({ unidadId: mensajeParaUsuario(err) });
      else notificaciones.error(mensajeParaUsuario(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <details className="panel-demo">
      <summary>DATOS DE DEMOSTRACIÓN · Registrar un movimiento de prueba (solo para desarrollo)</summary>
      <div className="panel-demo__cuerpo">
        <p className="texto-suave">
          Esto no es un formulario real: sirve para probar las existencias mientras no existan las pantallas de compras y salidas.
          Todo lo que registres queda marcado como «{NOTA_DEMO}» y se pierde al cerrar la pestaña.
        </p>
        <form className="formulario-linea" onSubmit={enviar} noValidate>
          <SelectorDeProducto valor={producto} onChange={elegirProducto} error={errores.productoId ?? ''} />
          <div className="campo">
            <label htmlFor="demo-tipo">Movimiento</label>
            <select id="demo-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="ingreso">Ingreso</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="demo-cantidad">Cantidad</label>
            <input
              id="demo-cantidad" type="text" inputMode="decimal" autoComplete="off" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
              aria-invalid={errores.cantidad ? 'true' : undefined} aria-describedby={errores.cantidad ? 'demo-cantidad-error' : undefined}
            />
            {errores.cantidad && <p id="demo-cantidad-error" className="campo__error" role="alert">{errores.cantidad}</p>}
          </div>
          <div className="campo">
            <label htmlFor="demo-unidad">Unidad</label>
            <select
              id="demo-unidad" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}
              aria-invalid={errores.unidadId ? 'true' : undefined} aria-describedby={errores.unidadId ? 'demo-unidad-error' : undefined}
            >
              <option value="">Elegí una unidad…</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
            </select>
            {errores.unidadId && <p id="demo-unidad-error" className="campo__error" role="alert">{errores.unidadId}</p>}
          </div>
          <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar movimiento de prueba'}</button>
        </form>
      </div>
    </details>
  );
}
