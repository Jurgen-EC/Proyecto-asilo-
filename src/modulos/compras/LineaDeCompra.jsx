import { useId } from 'react';
import SelectorDeProducto from '../../compartido/componentes/SelectorDeProducto.jsx';
import { calcularCostosDeLinea } from '../../nucleo/datos/compras.js';

/** Costos a mostrar en una línea: el que escribió la persona y el que calcula el sistema (null si todavía no se puede calcular). */
export function costosDeLinea(linea) {
  const r = calcularCostosDeLinea({
    cantidad: linea.cantidad,
    costoUnitario: linea.editado === 'unitario' ? linea.costoUnitario : '',
    costoTotal: linea.editado === 'total' ? linea.costoTotal : '',
  });
  return r.mensaje ? null : r;
}

const coma = (texto) => String(texto).replace('.', ',');

/**
 * Una línea del formulario de compra: producto, en qué se compró (unidad o presentación), cantidad y costo.
 * El costo se escribe en UNO de los dos campos (unitario o total) y el otro se calcula y se muestra.
 * Es un componente «controlado»: el estado vive en PaginaNuevaCompra.
 */
export default function LineaDeCompra({
  numero, linea, opciones, errores, puedeQuitar, deshabilitado, onCambiar, onElegirProducto, onQuitar,
}) {
  const id = useId();
  const calculados = costosDeLinea(linea);
  const { unidades = [], presentaciones = [] } = opciones ?? {};
  const medida = linea.medida;
  const presentacion = medida.startsWith('p:') ? presentaciones.find((p) => p.id === medida.slice(2)) : null;
  const unidad = !presentacion ? unidades.find((u) => u.id === medida.slice(2)) : null;
  const valorUnitario = linea.editado === 'total' ? (calculados ? coma(calculados.costoUnitario) : '') : linea.costoUnitario;
  const valorTotal = linea.editado === 'unitario' ? (calculados ? coma(calculados.costoTotal) : '') : linea.costoTotal;
  const error = (campo) => errores[`lineas.${numero - 1}.${campo}`];
  const campoCosto = error('costo');

  return (
    <fieldset className="linea-compra" disabled={deshabilitado}>
      <legend>Línea {numero}</legend>

      <SelectorDeProducto
        id={`${id}-producto`} etiqueta="Producto" valor={linea.producto} onChange={onElegirProducto} error={error('productoId') ?? ''}
      />

      <div className="campo">
        <label htmlFor={`${id}-medida`}>Comprado en</label>
        <select
          id={`${id}-medida`} value={medida} disabled={!linea.producto} onChange={(e) => onCambiar({ medida: e.target.value })}
          aria-invalid={error('unidadId') ? 'true' : undefined} aria-describedby={error('unidadId') ? `${id}-medida-error` : undefined}
        >
          {!linea.producto && <option value="">Primero elegí el producto</option>}
          {presentaciones.length > 0 && (
            <optgroup label="Presentaciones de este producto">
              {presentaciones.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
            </optgroup>
          )}
          {linea.producto && (
            <optgroup label="Unidades">
              {unidades.map((u) => <option key={u.id} value={`u:${u.id}`}>{u.nombre} ({u.abreviatura})</option>)}
            </optgroup>
          )}
        </select>
        {error('unidadId') && <p id={`${id}-medida-error`} className="campo__error" role="alert">{error('unidadId')}</p>}
      </div>

      <div className="campo">
        <label htmlFor={`${id}-cantidad`}>Cantidad</label>
        <input
          id={`${id}-cantidad`} type="text" inputMode="decimal" autoComplete="off" value={linea.cantidad}
          onChange={(e) => onCambiar({ cantidad: e.target.value })}
          aria-invalid={error('cantidad') ? 'true' : undefined} aria-describedby={error('cantidad') ? `${id}-cantidad-error` : `${id}-cantidad-ayuda`}
        />
        <p id={`${id}-cantidad-ayuda`} className="texto-suave campo__ayuda">
          {presentacion ? `Número de ${presentacion.nombre.toLowerCase()}` : unidad ? `En ${unidad.nombre.toLowerCase()}` : 'Cuánto se compró'}
        </p>
        {error('cantidad') && <p id={`${id}-cantidad-error`} className="campo__error" role="alert">{error('cantidad')}</p>}
      </div>

      <div className="linea-compra__costos">
        <div className={`campo ${linea.editado === 'total' ? 'campo--calculado' : ''}`}>
          <label htmlFor={`${id}-unitario`}>Costo unitario</label>
          <input
            id={`${id}-unitario`} type="text" inputMode="decimal" autoComplete="off" value={valorUnitario}
            onChange={(e) => onCambiar({ costoUnitario: e.target.value, costoTotal: '', editado: e.target.value === '' ? null : 'unitario' })}
            aria-invalid={campoCosto ? 'true' : undefined} aria-describedby={campoCosto ? `${id}-costo-error` : `${id}-unitario-ayuda`}
          />
          <p id={`${id}-unitario-ayuda`} className="texto-suave campo__ayuda">
            {linea.editado === 'total' ? 'Calculado' : `Por ${presentacion ? presentacion.nombre.toLowerCase() : unidad ? unidad.nombre.toLowerCase() : 'unidad'}`}
          </p>
        </div>
        <div className={`campo ${linea.editado === 'unitario' ? 'campo--calculado' : ''}`}>
          <label htmlFor={`${id}-total`}>Costo total</label>
          <input
            id={`${id}-total`} type="text" inputMode="decimal" autoComplete="off" value={valorTotal}
            onChange={(e) => onCambiar({ costoTotal: e.target.value, costoUnitario: '', editado: e.target.value === '' ? null : 'total' })}
            aria-invalid={campoCosto ? 'true' : undefined} aria-describedby={campoCosto ? `${id}-costo-error` : `${id}-total-ayuda`}
          />
          <p id={`${id}-total-ayuda`} className="texto-suave campo__ayuda">{linea.editado === 'unitario' ? 'Calculado' : 'De toda la línea'}</p>
        </div>
      </div>
      {campoCosto && <p id={`${id}-costo-error`} className="campo__error" role="alert">{campoCosto}</p>}
      <p className="texto-suave campo__ayuda">Escribí solo uno de los dos costos: el sistema calcula el otro.</p>

      {puedeQuitar && (
        <button type="button" className="boton boton--secundario" onClick={onQuitar} aria-label={`Quitar la línea ${numero}`}>Quitar línea</button>
      )}
    </fieldset>
  );
}
