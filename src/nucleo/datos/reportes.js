// REGLAS DE LOS REPORTES MENSUALES (Versión 9: RF-031, RF-032, RNF-086)
// Funciones puras, sin acceso a datos. Las usa el adaptador de demostración y las debe reutilizar
// (o replicar en la base, como consultas) cualquier adaptador real. Todo es de SOLO LECTURA: los reportes
// salen de los movimientos y las compras guardados, así que solo reflejan operaciones confirmadas.
import { ErrorDatos, CODIGOS } from './errores.js';
import { diaEnCostaRica } from './movimientos.js';
import { Decimal } from '../../compartido/utilidades/decimales.js';

export const ANIO_MINIMO = 2000;
export const ANIO_MAXIMO = 2100;

/**
 * Valida un mes 'AAAA-MM' y devuelve { mes, desde, hasta }: el primer y el último día del mes ('AAAA-MM-DD').
 * Lanza VALIDACION con campos.mes si falta o no es válido.
 */
export function validarMes(mes) {
  const falla = (mensaje) => { throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { mes: mensaje }); };
  if (typeof mes !== 'string' || !mes) falla('Elegí un mes.');
  const partes = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
  if (!partes) falla('El mes no es válido. Usá el formato AAAA-MM, por ejemplo 2026-03.');
  const anio = Number(partes[1]);
  const numeroDeMes = Number(partes[2]);
  if (anio < ANIO_MINIMO || anio > ANIO_MAXIMO) falla(`El año debe estar entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`);
  const ultimoDia = new Date(Date.UTC(anio, numeroDeMes, 0)).getUTCDate();
  return { mes, desde: `${mes}-01`, hasta: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
}

/**
 * Existencia de cada producto AL CIERRE de un día (`hasta`, inclusive, en hora de Costa Rica): la suma de
 * sentido × cantidad base de todos sus movimientos hasta ese día. En la unidad base del producto, como texto decimal exacto.
 * Devuelve [{ productoId, unidadBaseId, existencia, cantidadMovimientos }] (sin ordenar) para los productos que
 * tienen al menos un movimiento hasta esa fecha (la existencia puede ser 0).
 */
export function inventarioAlCierre(movimientos, { hasta }) {
  const grupos = new Map();
  for (const m of movimientos) {
    if (diaEnCostaRica(m.fechaHora) > hasta) continue;
    let g = grupos.get(m.productoId);
    if (!g) {
      g = { productoId: m.productoId, unidadBaseId: m.unidadBaseId, existencia: new Decimal(0), cantidadMovimientos: 0 };
      grupos.set(m.productoId, g);
    }
    g.existencia = g.existencia.plus(new Decimal(m.cantidadBase).times(m.sentido));
    g.cantidadMovimientos += 1;
  }
  return [...grupos.values()].map((g) => ({
    productoId: g.productoId, unidadBaseId: g.unidadBaseId, existencia: g.existencia.toFixed(), cantidadMovimientos: g.cantidadMovimientos,
  }));
}

/**
 * Resumen de movimientos de un período (`desde` y `hasta` inclusivos, en hora de Costa Rica), por producto:
 *   saldoInicial = existencia al cierre del día anterior a `desde`
 *   ingresos     = suma de los ingresos del período
 *   salidas      = salidas generales + consumos (se conserva cada subtotal)
 *   ajustes      = suma con signo de los ajustes del período
 *   saldoFinal   = saldoInicial + ingresos − salidas + ajustes   (siempre; es la existencia al cierre del período)
 * Incluye un producto si tuvo movimientos en el período o si empezó con saldo distinto de cero (así el saldo no «desaparece»).
 * Devuelve [{ productoId, unidadBaseId, saldoInicial, ingresos, salidas, salidasGenerales, consumos, ajustes, saldoFinal,
 *             cantidadIngresos, cantidadSalidas, cantidadAjustes }] (sin ordenar).
 */
export function resumenDelMes(movimientos, { desde, hasta }) {
  const grupos = new Map();
  for (const m of movimientos) {
    const dia = diaEnCostaRica(m.fechaHora);
    if (dia > hasta) continue;
    let g = grupos.get(m.productoId);
    if (!g) {
      g = {
        productoId: m.productoId, unidadBaseId: m.unidadBaseId,
        saldoInicial: new Decimal(0), ingresos: new Decimal(0), salidasGenerales: new Decimal(0), consumos: new Decimal(0), ajustes: new Decimal(0),
        cantidadIngresos: 0, cantidadSalidas: 0, cantidadAjustes: 0,
      };
      grupos.set(m.productoId, g);
    }
    const cantidad = new Decimal(m.cantidadBase);
    if (dia < desde) {
      g.saldoInicial = g.saldoInicial.plus(cantidad.times(m.sentido));
    } else if (m.tipo === 'ingreso') {
      g.ingresos = g.ingresos.plus(cantidad);
      g.cantidadIngresos += 1;
    } else if (m.tipo === 'salida') {
      if (m.subtipo === 'consumo') g.consumos = g.consumos.plus(cantidad);
      else g.salidasGenerales = g.salidasGenerales.plus(cantidad);
      g.cantidadSalidas += 1;
    } else {
      g.ajustes = g.ajustes.plus(cantidad.times(m.sentido));
      g.cantidadAjustes += 1;
    }
  }
  return [...grupos.values()]
    .filter((g) => g.cantidadIngresos + g.cantidadSalidas + g.cantidadAjustes > 0 || !g.saldoInicial.isZero())
    .map((g) => {
      const salidas = g.salidasGenerales.plus(g.consumos);
      return {
        productoId: g.productoId, unidadBaseId: g.unidadBaseId,
        saldoInicial: g.saldoInicial.toFixed(), ingresos: g.ingresos.toFixed(), salidas: salidas.toFixed(),
        salidasGenerales: g.salidasGenerales.toFixed(), consumos: g.consumos.toFixed(), ajustes: g.ajustes.toFixed(),
        saldoFinal: g.saldoInicial.plus(g.ingresos).minus(salidas).plus(g.ajustes).toFixed(),
        cantidadIngresos: g.cantidadIngresos, cantidadSalidas: g.cantidadSalidas, cantidadAjustes: g.cantidadAjustes,
      };
    });
}

/**
 * Compras de un período, agrupadas por producto. El período se cuenta por la FECHA DE LA COMPRA (`fechaCompra`, la que eligió
 * el usuario), no por el día en que se registró. Los costos son los registrados en cada línea: no se promedian ni se convierten.
 * Cada grupo trae sus líneas (de la más antigua a la más reciente), el subtotal del costo y la cantidad total en la unidad base
 * del producto (la del ingreso que generó cada línea). Devuelve { grupos, totalGeneral, cantidadCompras, cantidadLineas } (grupos sin ordenar).
 */
export function comprasDelMes(compras, lineas, movimientos, { desde, hasta }) {
  const delPeriodo = new Map();
  for (const c of compras) if (c.fechaCompra >= desde && c.fechaCompra <= hasta) delPeriodo.set(c.id, c);
  const movimientoPorId = new Map(movimientos.map((m) => [m.id, m]));
  const grupos = new Map();
  const comprasConLineas = new Set();
  lineas.forEach((linea, posicion) => {
    const compra = delPeriodo.get(linea.compraId);
    if (!compra) return;
    comprasConLineas.add(compra.id);
    const m = movimientoPorId.get(linea.movimientoId);
    let g = grupos.get(linea.productoId);
    if (!g) {
      g = { productoId: linea.productoId, unidadBaseId: m?.unidadBaseId ?? null, lineas: [], subtotalCosto: new Decimal(0), subtotalCantidadBase: new Decimal(0) };
      grupos.set(linea.productoId, g);
    }
    const cantidadBase = m ? m.cantidadBase : '0';
    g.lineas.push({
      lineaId: linea.id, compraId: compra.id, fechaCompra: compra.fechaCompra, cantidad: linea.cantidad, unidadId: linea.unidadId,
      presentacionId: linea.presentacionId ?? null, costoUnitario: linea.costoUnitario, costoTotal: linea.costoTotal, cantidadBase,
      _orden: [compra.fechaCompra, compra.registradaEn ?? '', posicion],
    });
    g.subtotalCosto = g.subtotalCosto.plus(linea.costoTotal);
    g.subtotalCantidadBase = g.subtotalCantidadBase.plus(cantidadBase);
  });
  let totalGeneral = new Decimal(0);
  const resultado = [...grupos.values()].map((g) => {
    totalGeneral = totalGeneral.plus(g.subtotalCosto);
    const ordenadas = g.lineas
      .sort((a, b) => (a._orden[0] < b._orden[0] ? -1 : a._orden[0] > b._orden[0] ? 1 : 0)
        || (a._orden[1] < b._orden[1] ? -1 : a._orden[1] > b._orden[1] ? 1 : 0) || a._orden[2] - b._orden[2])
      .map(({ _orden, ...linea }) => linea);
    return {
      productoId: g.productoId, unidadBaseId: g.unidadBaseId, lineas: ordenadas,
      subtotalCosto: g.subtotalCosto.toFixed(2), subtotalCantidadBase: g.subtotalCantidadBase.toFixed(), cantidadLineas: ordenadas.length,
    };
  });
  return {
    grupos: resultado, totalGeneral: totalGeneral.toFixed(2),
    cantidadCompras: comprasConLineas.size, cantidadLineas: resultado.reduce((t, g) => t + g.cantidadLineas, 0),
  };
}
