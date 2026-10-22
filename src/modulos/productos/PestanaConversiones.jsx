import { useEffect, useId, useState } from 'react';
import { useDatos } from '../../nucleo/datos/useDatos.js';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import { formatearCantidad } from '../../compartido/utilidades/formato.js';
import GestorConversiones from '../unidades/GestorConversiones.jsx';

// Conversiones de un producto (Versión 3): sus equivalencias propias y una prueba para verificar el resultado.
export default function PestanaConversiones({ producto }) {
  const datos = useDatos();
  const idBase = useId();
  const [opciones, setOpciones] = useState({ unidades: [], presentaciones: [] });
  const [cantidad, setCantidad] = useState('1');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [resultado, setResultado] = useState(null); // { ok, texto } | null
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    let activo = true;
    Promise.all([
      datos.unidades.listarUnidades({ estado: 'activas' }),
      datos.presentaciones.listarPresentaciones(producto.id, { estado: 'activas' }),
    ]).then(([unidades, presentaciones]) => { if (activo) setOpciones({ unidades, presentaciones }); }).catch(() => {});
    return () => { activo = false; };
  }, [datos, producto.id]);

  const aExtremo = (valor) => (valor.startsWith('p:') ? { presentacionId: valor.slice(2) } : { unidadId: valor.slice(2) });
  const unidadPorId = Object.fromEntries(opciones.unidades.map((u) => [u.id, u]));
  const etiquetaOpcion = (valor) => {
    const [tipo, ident] = [valor.slice(0, 1), valor.slice(2)];
    if (tipo === 'p') return opciones.presentaciones.find((p) => p.id === ident)?.nombre ?? '';
    return unidadPorId[ident]?.abreviatura ?? '';
  };

  async function calcular(e) {
    e.preventDefault();
    if (calculando) return;
    setCalculando(true);
    setResultado(null);
    try {
      const r = await datos.conversiones.convertir(producto.id, cantidad, aExtremo(desde), aExtremo(hasta));
      setResultado({
        ok: true,
        texto: `${formatearCantidad(cantidad.replace(',', '.'))} ${etiquetaOpcion(desde)} = ${formatearCantidad(r.cantidad)} ${etiquetaOpcion(hasta)}${r.redondeado ? ' (redondeado a 4 decimales)' : ''}`,
      });
    } catch (err) {
      setResultado({ ok: false, texto: err?.campos?.cantidad ?? mensajeParaUsuario(err) });
    } finally {
      setCalculando(false);
    }
  }

  const grupo = (
    <>
      <optgroup label="Unidades">
        {opciones.unidades.map((u) => <option key={u.id} value={`u:${u.id}`}>{u.nombre} ({u.abreviatura})</option>)}
      </optgroup>
      {opciones.presentaciones.length > 0 && (
        <optgroup label="Presentaciones de este producto">
          {opciones.presentaciones.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
        </optgroup>
      )}
    </>
  );

  return (
    <div>
      <GestorConversiones productoId={producto.id} />

      <form className="formulario-modulo formulario-modulo--separado" onSubmit={calcular} noValidate aria-label="Probar una conversión">
        <h3>Probar una conversión</h3>
        <p className="texto-suave">Sirve para comprobar que las equivalencias dan lo esperado. No guarda nada.</p>
        <div className="campo">
          <label htmlFor={`${idBase}-cantidad`}>Cantidad</label>
          <input id={`${idBase}-cantidad`} type="text" inputMode="decimal" autoComplete="off" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor={`${idBase}-desde`}>Desde</label>
          <select id={`${idBase}-desde`} value={desde} onChange={(e) => setDesde(e.target.value)}>
            <option value="">Elegí una opción…</option>{grupo}
          </select>
        </div>
        <div className="campo">
          <label htmlFor={`${idBase}-hasta`}>Hasta</label>
          <select id={`${idBase}-hasta`} value={hasta} onChange={(e) => setHasta(e.target.value)}>
            <option value="">Elegí una opción…</option>{grupo}
          </select>
        </div>
        <div className="acciones-formulario">
          <button type="submit" className="boton" disabled={calculando || !desde || !hasta}>{calculando ? 'Calculando…' : 'Calcular'}</button>
        </div>
        {resultado && (
          <p className={resultado.ok ? 'resultado-conversion' : 'campo__error'} role={resultado.ok ? 'status' : 'alert'}>{resultado.texto}</p>
        )}
      </form>
    </div>
  );
}
