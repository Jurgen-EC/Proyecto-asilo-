// REGLAS DEL HISTORIAL Y DEL CONSOLIDADO DE MOVIMIENTOS (Versión 7: RF-019 a RF-025, RNF-079, RNF-080, RNF-085)
// Funciones puras, sin acceso a datos. Las usa el adaptador de demostración y las debe reutilizar
// (o replicar en la base, como consultas) cualquier adaptador real. Todo es de SOLO LECTURA.
import { lanzarSiHayCampos } from './productos.js';
import { esFechaValida } from './compras.js';
import { TIPOS_MOVIMIENTO, SUBTIPOS_POR_TIPO } from './inventario.js';
import { Decimal } from '../../compartido/utilidades/decimales.js';
import { ZONA_HORARIA } from '../../compartido/utilidades/formato.js';

export const TAMANO_PAGINA_MOVIMIENTOS = 20;
export const TAMANO_PAGINA_MOVIMIENTOS_MAX = 100;
export const ORDENES_MOVIMIENTOS = Object.freeze(['reciente', 'antiguo']);

// Un solo formateador para todo: con miles de movimientos, crear uno por movimiento sería lento.
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Día de calendario ('AAAA-MM-DD') de un instante, en hora de Costa Rica. */
export const diaEnCostaRica = (instante) => formatoDia.format(new Date(instante));

/** Tipo al que pertenece un subtipo ('consumo' → 'salida'), o null si no existe. */
export const tipoDeSubtipo = (subtipo) => TIPOS_MOVIMIENTO.find((t) => SUBTIPOS_POR_TIPO[t].includes(subtipo)) ?? null;

/**
 * Valida y completa los parámetros de `listarMovimientos`. Lanza VALIDACION con todos los mensajes por campo juntos.
 * Si se indica un subtipo sin tipo, el tipo se deduce (consumo → salida). Un tipo o subtipo incoherente se rechaza.
 */
export function normalizarConsultaMovimientos({
  tipo = '', subtipo = '', desde = '', hasta = '', productoId = '', orden = 'reciente', pagina = 1, tamanoPagina = TAMANO_PAGINA_MOVIMIENTOS,
} = {}) {
  const campos = {};
  if (desde && !esFechaValida(desde)) campos.desde = 'La fecha «desde» no es válida.';
  if (hasta && !esFechaValida(hasta)) campos.hasta = 'La fecha «hasta» no es válida.';
  if (!campos.desde && !campos.hasta && desde && hasta && desde > hasta) campos.hasta = 'La fecha «hasta» no puede ser anterior a «desde».';

  let tipoFinal = tipo || '';
  if (tipoFinal && !TIPOS_MOVIMIENTO.includes(tipoFinal)) campos.tipo = 'El tipo de movimiento no es válido.';
  if (subtipo) {
    const dueno = tipoDeSubtipo(subtipo);
    if (!dueno) campos.subtipo = 'El subtipo de movimiento no es válido.';
    else if (tipoFinal && !campos.tipo && dueno !== tipoFinal) campos.subtipo = 'El subtipo no corresponde a ese tipo de movimiento.';
    else if (!tipoFinal) tipoFinal = dueno;
  }
  lanzarSiHayCampos(campos);
  return {
    tipo: tipoFinal, subtipo: subtipo || '', desde: desde || '', hasta: hasta || '', productoId: productoId || '',
    orden: ORDENES_MOVIMIENTOS.includes(orden) ? orden : 'reciente',
    pagina: Math.max(1, Math.floor(Number(pagina)) || 1),
    tamanoPagina: Math.min(TAMANO_PAGINA_MOVIMIENTOS_MAX, Math.max(1, Math.floor(Number(tamanoPagina)) || TAMANO_PAGINA_MOVIMIENTOS)),
  };
}

// Movimientos que cumplen los filtros, con su posición de registro (sin ordenar). `desde` y `hasta` son inclusivos.
function seleccionar(movimientos, { tipo = '', subtipo = '', desde = '', hasta = '', productoId = '' } = {}) {
  const conFechas = Boolean(desde || hasta);
  const elegidos = [];
  movimientos.forEach((m, posicion) => {
    if (productoId && m.productoId !== productoId) return;
    if (tipo && m.tipo !== tipo) return;
    if (subtipo && m.subtipo !== subtipo) return;
    if (conFechas) {
      const dia = diaEnCostaRica(m.fechaHora); // el día se cuenta en hora de Costa Rica
      if ((desde && dia < desde) || (hasta && dia > hasta)) return;
    }
    elegidos.push({ m, posicion });
  });
  return elegidos;
}

const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Filtra y ordena los movimientos (no modifica la lista recibida). Orden 'reciente' (por defecto): el más nuevo primero;
 * a igual fecha y hora, el registrado después va primero. Orden 'antiguo': al revés.
 */
export function filtrarMovimientos(movimientos, filtros = {}) {
  const signo = filtros.orden === 'antiguo' ? 1 : -1;
  return seleccionar(movimientos, filtros)
    .sort((a, b) => signo * (comparar(a.m.fechaHora, b.m.fechaHora) || a.posicion - b.posicion))
    .map(({ m }) => m);
}

/**
 * Consolidado por producto de los movimientos del período (`desde` y `hasta` inclusivos, en hora de Costa Rica).
 * Todas las cantidades van en la UNIDAD BASE del producto y como texto decimal exacto.
 *   entradas  = suma de los ingresos
 *   salidas   = salidas generales + consumos (juntos son «Salidas», pero se conserva cada subtotal)
 *   diferencia = entradas − salidas
 *   ajustes   = suma con signo de los ajustes: NO cuentan como entradas ni como salidas
 * Devuelve [{ productoId, unidadBaseId, entradas, salidas, salidasGenerales, consumos, diferencia, ajustes,
 *             cantidadEntradas, cantidadSalidas, cantidadAjustes }] (sin ordenar). Solo productos con movimientos en el período.
 */
export function consolidarMovimientos(movimientos, { desde = '', hasta = '', productoId = '' } = {}) {
  const grupos = new Map();
  for (const { m } of seleccionar(movimientos, { desde, hasta, productoId })) {
    let g = grupos.get(m.productoId);
    if (!g) {
      g = {
        productoId: m.productoId, unidadBaseId: m.unidadBaseId,
        entradas: new Decimal(0), salidasGenerales: new Decimal(0), consumos: new Decimal(0), ajustes: new Decimal(0),
        cantidadEntradas: 0, cantidadSalidas: 0, cantidadAjustes: 0,
      };
      grupos.set(m.productoId, g);
    }
    const cantidad = new Decimal(m.cantidadBase);
    if (m.tipo === 'ingreso') {
      g.entradas = g.entradas.plus(cantidad);
      g.cantidadEntradas += 1;
    } else if (m.tipo === 'salida') {
      if (m.subtipo === 'consumo') g.consumos = g.consumos.plus(cantidad);
      else g.salidasGenerales = g.salidasGenerales.plus(cantidad);
      g.cantidadSalidas += 1;
    } else {
      g.ajustes = g.ajustes.plus(cantidad.times(m.sentido));
      g.cantidadAjustes += 1;
    }
  }
  return [...grupos.values()].map((g) => {
    const salidas = g.salidasGenerales.plus(g.consumos);
    return {
      productoId: g.productoId, unidadBaseId: g.unidadBaseId,
      entradas: g.entradas.toFixed(), salidas: salidas.toFixed(),
      salidasGenerales: g.salidasGenerales.toFixed(), consumos: g.consumos.toFixed(),
      diferencia: g.entradas.minus(salidas).toFixed(), ajustes: g.ajustes.toFixed(),
      cantidadEntradas: g.cantidadEntradas, cantidadSalidas: g.cantidadSalidas, cantidadAjustes: g.cantidadAjustes,
    };
  });
}

/**
 * Existencia del producto justo antes y justo después de un movimiento: suma de sentido × cantidad base de sus movimientos,
 * en ORDEN DE REGISTRO. `movimientos` debe venir en ese orden (una base real puede usar su número de secuencia).
 */
export function existenciaAlMovimiento(movimientos, movimientoId) {
  const objetivo = movimientos.find((m) => m.id === movimientoId);
  if (!objetivo) return null;
  let antes = new Decimal(0);
  for (const m of movimientos) {
    if (m.id === movimientoId) break;
    if (m.productoId === objetivo.productoId) antes = antes.plus(new Decimal(m.cantidadBase).times(m.sentido));
  }
  return { antes: antes.toFixed(), despues: antes.plus(new Decimal(objetivo.cantidadBase).times(objetivo.sentido)).toFixed() };
}
