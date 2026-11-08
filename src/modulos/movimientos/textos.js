import { formatearCantidad } from '../../compartido/utilidades/formato.js';

// Textos del módulo de movimientos. Los ingresos, las salidas y los ajustes se muestran SIEMPRE con su nombre propio;
// las salidas generales y los consumos cuentan como «Salidas» pero nunca se confunden.
export const ETIQUETAS_TIPO = { ingreso: 'Ingreso', salida: 'Salida', ajuste: 'Ajuste' };
export const ETIQUETAS_SUBTIPO = {
  compra: 'Compra',
  inventario_inicial: 'Inventario inicial',
  salida_general: 'Salida general',
  consumo: 'Consumo',
  ajuste_conteo: 'Ajuste por conteo',
  anulacion: 'Anulación',
};
export const ETIQUETAS_ORIGEN = { compra: 'Compra', salida: 'Salida', consumo: 'Consumo' };

// Cada vista del módulo: `tipo` vacío = todos los movimientos.
export const VISTAS = {
  todos: {
    tipo: '', titulo: 'Historial de movimientos', ruta: '/movimientos',
    intro: 'Todo lo que entró, salió o se ajustó en el inventario, del más reciente al más antiguo. Un movimiento no se puede editar ni borrar.',
    cargando: 'Cargando movimientos…', error: 'No se pudo cargar el historial', caption: 'Historial de movimientos',
    vacioTitulo: 'Todavía no hay movimientos', vacioMensaje: 'Los movimientos aparecen aquí cuando se registran compras, salidas o consumos.',
    sinResultados: 'No hay movimientos que coincidan con los filtros elegidos. Probá con otras fechas, otro producto u otro tipo.',
    singular: 'movimiento', plural: 'movimientos',
  },
  ingreso: {
    tipo: 'ingreso', titulo: 'Ingresos', ruta: '/movimientos/ingresos',
    intro: 'Lo que entró al inventario, por ejemplo cada línea de una compra.',
    cargando: 'Cargando ingresos…', error: 'No se pudieron cargar los ingresos', caption: 'Lista de ingresos',
    vacioTitulo: 'Todavía no hay ingresos', vacioMensaje: 'Cada compra que se registre genera sus ingresos y aparecerán aquí.',
    sinResultados: 'No hay ingresos que coincidan con los filtros elegidos. Probá con otras fechas u otro producto.',
    singular: 'ingreso', plural: 'ingresos',
  },
  salida: {
    tipo: 'salida', titulo: 'Salidas', ruta: '/movimientos/salidas',
    intro: 'Lo que salió del inventario: las salidas y los consumos. Cada uno conserva su clase («Salida general» o «Consumo»).',
    cargando: 'Cargando salidas…', error: 'No se pudieron cargar las salidas', caption: 'Lista de salidas',
    vacioTitulo: 'Todavía no hay salidas', vacioMensaje: 'Las salidas y los consumos que se registren aparecerán aquí.',
    sinResultados: 'No hay salidas que coincidan con los filtros elegidos. Probá con otras fechas, otro producto u otra clase.',
    singular: 'salida', plural: 'salidas',
  },
};

/** «6 kg» o «3 × Caja»: lo que se registró, tal como se registró. */
export function cantidadDeMovimiento(m) {
  return m.presentacion
    ? `${formatearCantidad(m.cantidadOriginal)} × ${m.presentacion.nombre}`
    : formatearCantidad(m.cantidadOriginal, m.unidad?.abreviatura ?? '');
}

/** «+36 u» o «−2 kg»: lo que el movimiento sumó o restó, en la unidad base del producto. */
export function efectoEnInventario(m) {
  return `${m.sentido > 0 ? '+' : '−'}${formatearCantidad(m.cantidadBase, m.unidadBase?.abreviatura ?? '')}`;
}

/** Los decimales viajan como texto con punto; en pantalla se muestran con coma. */
export const aTextoDecimal = (valor) => String(valor ?? '').replace('.', ',');
