import { desplazarMes, esMesValido, mesDeHoy, NOMBRES_DE_MESES } from '../utilidades/periodo.js';

const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * Selector de período mensual, reutilizable por todos los reportes.
 *   valor     'AAAA-MM' (si no es válido, los selectores quedan sin elegir)
 *   onChange  (mes) => void, con el mes elegido como 'AAAA-MM'
 *   error     mensaje de validación (se muestra debajo)
 *   atajos    muestra «Este mes» y «Mes anterior» (por defecto sí)
 *   anioDesde / anioHasta  rango de años a ofrecer (por defecto, 5 años atrás y el próximo)
 */
export default function SelectorDePeriodo({ valor, onChange, etiqueta = 'Período', id = 'periodo', error = '', atajos = true, anioDesde, anioHasta }) {
  const hoy = mesDeHoy();
  const anioDeHoy = Number(hoy.slice(0, 4));
  const valido = esMesValido(valor);
  const anio = valido ? valor.slice(0, 4) : '';
  const mes = valido ? valor.slice(5, 7) : '';
  const primero = Math.min(anioDesde ?? anioDeHoy - 5, valido ? Number(anio) : Infinity);
  const ultimo = Math.max(anioHasta ?? anioDeHoy + 1, valido ? Number(anio) : -Infinity);
  const anios = Array.from({ length: ultimo - primero + 1 }, (_, i) => String(primero + i));

  const elegirMes = (nuevo) => onChange(`${anio || String(anioDeHoy)}-${nuevo}`);
  const elegirAnio = (nuevo) => onChange(`${nuevo}-${mes || hoy.slice(5, 7)}`);

  return (
    <fieldset className="selector-periodo" aria-describedby={error ? `${id}-error` : undefined}>
      <legend>{etiqueta}</legend>
      <div className="campo">
        <label htmlFor={`${id}-mes`}>Mes</label>
        <select id={`${id}-mes`} value={mes} onChange={(e) => elegirMes(e.target.value)} aria-invalid={error ? 'true' : undefined}>
          {!valido && <option value="">Elegí un mes</option>}
          {NOMBRES_DE_MESES.map((nombre, i) => <option key={nombre} value={String(i + 1).padStart(2, '0')}>{capitalizar(nombre)}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-anio`}>Año</label>
        <select id={`${id}-anio`} value={anio} onChange={(e) => elegirAnio(e.target.value)} aria-invalid={error ? 'true' : undefined}>
          {!valido && <option value="">Elegí un año</option>}
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {atajos && (
        <div className="selector-periodo__atajos no-imprimir">
          <button type="button" className="boton boton--secundario" onClick={() => onChange(hoy)}>Este mes</button>
          <button type="button" className="boton boton--secundario" onClick={() => onChange(desplazarMes(hoy, -1))}>Mes anterior</button>
        </div>
      )}
      {error && <p id={`${id}-error`} className="campo__error selector-periodo__error" role="alert">{error}</p>}
    </fieldset>
  );
}
