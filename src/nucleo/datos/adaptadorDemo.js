// ADAPTADOR DE DEMOSTRACIÓN
// Sirve solo para que el sistema funcione sin base de datos. NO guarda nada
// real: la sesión y los productos viven en la memoria del navegador (sessionStorage,
// se pierden al cerrar la pestaña) y el único usuario es ficticio. Se reemplazará por
// el adaptador de la base de datos real.
import { ErrorDatos, CODIGOS } from './errores.js';
import {
  validarNombreProducto, errorNombreDuplicado, normalizarConsulta, filtrarYOrdenar, paginar,
  mensajeUnidadBase, lanzarSiHayCampos, productoIncompleto,
} from './productos.js';
import {
  validarEntradaMovimiento, entradaCoincideConMovimiento, errorClaveReutilizada, errorExistenciaInsuficiente,
  aplicarMovimiento, esNegativa, calcularConsistencia,
} from './inventario.js';
import {
  validarCompra, compraCoincide, claveDeLinea, errorDeLinea, normalizarConsultaCompras, totalDeLineas,
} from './compras.js';
import {
  validarOperacion, operacionCoincide, errorDeOperacion, claveDelMovimiento, normalizarConsultaOperaciones, CLASES_OPERACION,
  validarEdicionDeCosto,
} from './salidas.js';
import { validarGasto, gastoCoincide, normalizarConsultaGastos } from './gastos.js';
import { periodoCerrado } from '../costos/index.js';
import { hoyEnCostaRica } from '../../compartido/utilidades/formato.js';
import {
  normalizarConsultaMovimientos, filtrarMovimientos, consolidarMovimientos as consolidar, existenciaAlMovimiento,
} from './movimientos.js';
import { validarMes, inventarioAlCierre as calcularCierre, resumenDelMes, comprasDelMes } from './reportes.js';
import {
  validarUnidad, detectarUnidadDuplicada, errorUnidadDuplicada, filtrarUnidades,
  UNIDADES_SUGERIDAS, ESTADOS_UNIDAD, CONVERSIONES_GENERALES_SUGERIDAS,
} from './unidades.js';
import {
  validarConversion, detectarConversionDuplicada, errorConversionDuplicada, errorFactorSinCambio, leerFactor, convertirCantidad,
} from './conversiones.js';
import {
  validarPresentacion, detectarPresentacionDuplicada, errorPresentacionDuplicada, filtrarPresentaciones, ESTADOS_PRESENTACION,
} from './presentaciones.js';
import { normalizarNombre } from '../../compartido/utilidades/texto.js';
import { Decimal, leerDecimal } from '../../compartido/utilidades/decimales.js';

export const USUARIO_DEMO = Object.freeze({
  id: 'demo-1',
  correo: 'demo@hogar.local',
  nombre: 'Usuario de demostración',
});
export const CLAVE_DEMO = 'demo1234';
const LLAVE_SESION = 'inventario.demo.sesion';
const LLAVE_PRODUCTOS = 'inventario.demo.productos';
const LLAVE_UNIDADES = 'inventario.demo.unidades';
const LLAVE_PRESENTACIONES = 'inventario.demo.presentaciones';
const LLAVE_CONVERSIONES = 'inventario.demo.conversiones';
const LLAVE_GASTOS = 'inventario.demo.gastos'; // gastos (V8): no forman parte de las existencias, van en su propia clave
const LLAVE_INVENTARIO = 'inventario.demo.inventario'; // movimientos y existencias, en UNA sola clave: se escriben juntos o no se escribe nada

function crearAlmacen() {
  try {
    const prueba = '__prueba__';
    window.sessionStorage.setItem(prueba, '1');
    window.sessionStorage.removeItem(prueba);
    return window.sessionStorage;
  } catch {
    // Sin almacenamiento disponible: se usa memoria y la sesión no sobrevive a recargas.
    const mapa = new Map();
    return {
      getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
      setItem: (k, v) => mapa.set(k, String(v)),
      removeItem: (k) => mapa.delete(k),
    };
  }
}

const aDecimalIgual = (a, b) => new Decimal(a).equals(b);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function generarId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// `ganchos` existe SOLO para las pruebas: permite simular un fallo a mitad de `registrarMovimiento`
// (ganchos.despuesDeInsertarMovimiento / ganchos.antesDeConfirmar) y comprobar que no queda nada guardado.
export function crearAdaptadorDemo({ almacen = crearAlmacen(), retardoMs = 150, ganchos = {} } = {}) {
  const oyentes = new Set();
  const avisar = (usuario) => oyentes.forEach((cb) => cb(usuario));
  const oyentesInventario = new Set();
  const avisarInventario = (cambio) => oyentesInventario.forEach((cb) => { try { cb(cambio); } catch { /* un oyente con error no afecta la operación */ } });

  // Inventario (V4), compras (V5), salidas y consumos (V6): movimientos, existencias, compras, líneas de compra, salidas y consumos.
  // Siempre se leen y se guardan JUNTOS, en una sola clave (atomicidad): cada operación se confirma con UNA escritura o no se escribe nada.
  function leerInventario() {
    try {
      const o = JSON.parse(almacen.getItem(LLAVE_INVENTARIO) ?? 'null');
      if (o && Array.isArray(o.movimientos) && Array.isArray(o.existencias)) {
        return {
          ...o,
          compras: Array.isArray(o.compras) ? o.compras : [], compraLineas: Array.isArray(o.compraLineas) ? o.compraLineas : [],
          salidas: Array.isArray(o.salidas) ? o.salidas : [], consumos: Array.isArray(o.consumos) ? o.consumos : [],
          consumoCostoCambios: Array.isArray(o.consumoCostoCambios) ? o.consumoCostoCambios : [],
        };
      }
    } catch { /* se trata como vacío */ }
    return { movimientos: [], existencias: [], compras: [], compraLineas: [], salidas: [], consumos: [], consumoCostoCambios: [] };
  }
  const guardarInventario = (inventario) => almacen.setItem(LLAVE_INVENTARIO, JSON.stringify(inventario));
  // Los registros se ejecutan UNO TRAS OTRO (equivale al bloqueo de fila de una base real). Además, cada uno
  // lee, valida y escribe sin pausas en medio, así que dos salidas simultáneas nunca se pisan.
  let cola = Promise.resolve();
  function enSerie(tarea) {
    const resultado = cola.then(tarea);
    cola = resultado.catch(() => {});
    return resultado;
  }

  function leerSesion() {
    const crudo = almacen.getItem(LLAVE_SESION);
    if (!crudo) return null;
    try { return JSON.parse(crudo); } catch { return null; }
  }
  // Equivale a verificar la sesión en el servidor: sin sesión no se toca ningún dato.
  function exigirSesion() {
    const usuario = leerSesion();
    if (!usuario) throw new ErrorDatos(CODIGOS.SIN_SESION);
    return usuario;
  }
  function leerProductos() {
    try {
      const lista = JSON.parse(almacen.getItem(LLAVE_PRODUCTOS) ?? '[]');
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }
  const guardarProductos = (lista) => almacen.setItem(LLAVE_PRODUCTOS, JSON.stringify(lista));

  // Unidades (V3). La primera vez se cargan las unidades SUGERIDAS (editables). En la base real
  // esto es un dato inicial de la migración.
  function leerUnidades() {
    const crudo = almacen.getItem(LLAVE_UNIDADES);
    if (crudo === null) {
      const ahora = new Date().toISOString();
      const iniciales = UNIDADES_SUGERIDAS.map((u) => ({
        id: generarId(), clave: u.clave, nombre: u.nombre, abreviatura: u.abreviatura, dimension: u.dimension,
        activo: true, sugerida: true,
        nombreNormalizado: normalizarNombre(u.nombre), abreviaturaNormalizada: normalizarNombre(u.abreviatura),
        creadoEn: ahora, actualizadoEn: ahora, creadoPor: 'sistema',
      }));
      guardarUnidades(iniciales);
      return iniciales;
    }
    try {
      const lista = JSON.parse(crudo);
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }
  function guardarUnidades(lista) { almacen.setItem(LLAVE_UNIDADES, JSON.stringify(lista)); }
  function exigirUnidad(lista, id) {
    const unidad = lista.find((u) => u.id === id);
    if (!unidad) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
    return unidad;
  }
  function leerPresentaciones() {
    try {
      const lista = JSON.parse(almacen.getItem(LLAVE_PRESENTACIONES) ?? '[]');
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }
  const guardarPresentaciones = (lista) => almacen.setItem(LLAVE_PRESENTACIONES, JSON.stringify(lista));
  function exigirPresentacion(lista, id) {
    const presentacion = lista.find((p) => p.id === id);
    if (!presentacion) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
    return presentacion;
  }
  // Conversiones (V3). La primera vez se cargan las equivalencias GENERALES sugeridas (kg↔g, l↔ml) como filas explícitas.
  function leerConversiones() {
    const crudo = almacen.getItem(LLAVE_CONVERSIONES);
    if (crudo === null) {
      const unidades = leerUnidades();
      const porClave = Object.fromEntries(unidades.filter((u) => u.clave).map((u) => [u.clave, u.id]));
      const ahora = new Date().toISOString();
      const iniciales = CONVERSIONES_GENERALES_SUGERIDAS.map((c) => ({
        id: generarId(), productoId: null, unidadOrigenId: porClave[c.origen], unidadDestinoId: porClave[c.destino],
        factor: c.factor, vigente: true, sugerida: true, reemplazaId: null, reemplazadaPorId: null,
        creadoEn: ahora, creadoPor: 'sistema',
      })).filter((c) => c.unidadOrigenId && c.unidadDestinoId);
      guardarConversiones(iniciales);
      return iniciales;
    }
    try {
      const lista = JSON.parse(crudo);
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }
  function guardarConversiones(lista) { almacen.setItem(LLAVE_CONVERSIONES, JSON.stringify(lista)); }
  function exigirConversion(lista, id) {
    const conversion = lista.find((c) => c.id === id);
    if (!conversion) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
    return conversion;
  }
  // Una unidad "en uso" no puede cambiar de dimensión (rompería productos, presentaciones o equivalencias).
  function unidadEnUso(id) {
    return leerProductos().some((p) => p.unidadBaseId === id)
      || leerPresentaciones().some((p) => p.unidadId === id)
      || leerConversiones().some((c) => c.unidadOrigenId === id || c.unidadDestinoId === id);
  }
  const unidadPublica = ({ clave, ...resto }) => ({ ...resto }); // la clave interna no sale del adaptador

  // Valida nombre y unidad base JUNTOS para informar todos los errores a la vez (V3).
  // `unidadObligatoria`: al crear siempre; al editar solo si la entrada trae `unidadBaseId`.
  function validarEntradaProducto(entrada, { unidadObligatoria, unidadActualId = null }) {
    const campos = {};
    let valido = null;
    try {
      valido = validarNombreProducto(entrada.nombre);
    } catch (e) {
      if (!e?.campos) throw e;
      Object.assign(campos, e.campos);
    }
    if (unidadObligatoria) {
      const mensaje = mensajeUnidadBase(entrada.unidadBaseId, leerUnidades(), unidadActualId);
      if (mensaje) campos.unidadBaseId = mensaje;
    }
    lanzarSiHayCampos(campos);
    return valido;
  }
  const buscarPorId = (lista, id) => lista.find((p) => p.id === id);
  function exigirProducto(lista, id) {
    const producto = buscarPorId(lista, id);
    if (!producto) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
    return producto;
  }

  // NÚCLEO TRANSACCIONAL (V4), compartido por registrarMovimiento y registrarCompra (V5).
  // Trabaja sobre una COPIA del estado ({ movimientos, existencias }) y devuelve el estado nuevo: NO escribe nada.
  // Quien la llama confirma con una sola escritura (o descarta si algo falla). `n` ya viene validada.
  function procesarMovimiento(inventario, n, usuario, ahora) {
    // Idempotencia: la misma clave devuelve el movimiento original sin duplicar (aunque ahora ya no alcanzara la existencia).
    const previo = inventario.movimientos.find((m) => m.claveIdempotencia === n.claveIdempotencia);
    if (previo) {
      if (!entradaCoincideConMovimiento(n, previo)) throw errorClaveReutilizada();
      const fila = inventario.existencias.find((x) => x.productoId === previo.productoId);
      return { repetido: true, movimiento: previo, existencia: fila, movimientos: inventario.movimientos, existencias: inventario.existencias };
    }

    // 1. Producto existente, activo y completo.
    const unidades = leerUnidades();
    const producto = exigirProducto(leerProductos(), n.productoId);
    if (!producto.activo) {
      const mensaje = 'El producto está inactivo: no se pueden registrar movimientos.';
      throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { productoId: mensaje });
    }
    if (productoIncompleto(producto)) {
      const mensaje = 'El producto no tiene unidad base. Completalo en el catálogo de productos.';
      throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { productoId: mensaje });
    }

    // 2. Validar y convertir a la unidad base con la función central de la V3.
    const presentaciones = leerPresentaciones();
    const conv = convertirCantidad({
      productoId: n.productoId, cantidad: n.cantidad,
      origen: n.presentacionId ? { presentacionId: n.presentacionId } : n.unidadId,
      destino: producto.unidadBaseId, unidades, presentaciones, conversiones: leerConversiones(),
    });
    const cantidadBase = new Decimal(conv.cantidad);
    if (cantidadBase.isZero()) {
      const mensaje = 'La cantidad es demasiado pequeña para la unidad base del producto.';
      throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { cantidad: mensaje });
    }

    // 3. Si resta, verificar existencia suficiente. Se rechaza sin cambiar nada y NUNCA se convierte en otra cosa.
    const filaActual = inventario.existencias.find((x) => x.productoId === n.productoId);
    const actual = new Decimal(filaActual?.cantidadBase ?? '0');
    const nueva = aplicarMovimiento(actual, n.sentido, cantidadBase);
    if (esNegativa(nueva)) {
      const unidadBase = unidades.find((u) => u.id === producto.unidadBaseId);
      throw errorExistenciaInsuficiente({ nombre: producto.nombre, disponible: actual, abreviatura: unidadBase?.abreviatura ?? '' });
    }

    // 4. Insertar el movimiento (en una copia: nada se guarda todavía).
    const presentacion = n.presentacionId ? presentaciones.find((p) => p.id === n.presentacionId) : null;
    const movimiento = {
      id: generarId(), productoId: n.productoId, tipo: n.tipo, subtipo: n.subtipo, sentido: n.sentido,
      cantidadOriginal: leerDecimal(n.cantidad).toFixed(), // ya validada por convertirCantidad
      unidadOriginalId: presentacion ? presentacion.unidadId : n.unidadId,
      presentacionOriginalId: conv.presentacionOrigenId,
      factorAplicado: conv.factor, conversionId: conv.conversionId, redondeado: conv.redondeado,
      cantidadBase: cantidadBase.toFixed(), unidadBaseId: producto.unidadBaseId,
      fechaHora: ahora, usuarioId: usuario.id, claveIdempotencia: n.claveIdempotencia, // la fecha y la hora las fija la capa de datos
      referenciaTipo: n.referenciaTipo, referenciaId: n.referenciaId, nota: n.nota,
    };
    const movimientos = [...inventario.movimientos, movimiento];
    ganchos.despuesDeInsertarMovimiento?.(movimiento); // solo pruebas: simula un fallo a mitad de la operación

    // 5. Actualizar la existencia (en la copia).
    const existencia = { productoId: n.productoId, cantidadBase: nueva.toFixed(), actualizadoEn: ahora };
    const existencias = filaActual
      ? inventario.existencias.map((x) => (x.productoId === n.productoId ? existencia : x))
      : [...inventario.existencias, existencia];
    return { repetido: false, movimiento, existencia, movimientos, existencias };
  }

  // SALIDAS Y CONSUMOS (V6). Una operación = UN producto = UN movimiento, procesado por el mismo núcleo que registrarMovimiento.
  // Todo (movimiento, existencia y el registro de la salida o del consumo) se confirma con UNA sola escritura.
  const listaDe = (inventario, clase) => (clase === 'salida' ? inventario.salidas : inventario.consumos);

  // Vista enriquecida de una salida o consumo: lo guardado más el producto, la unidad y el movimiento que generó.
  function crearVistas(inventario, clase) {
    const productos = new Map(leerProductos().map((p) => [p.id, p]));
    const unidades = new Map(leerUnidades().map((u) => [u.id, u]));
    const presentaciones = new Map(leerPresentaciones().map((p) => [p.id, p]));
    const movimientos = new Map(inventario.movimientos.map((m) => [m.id, m]));
    const resumenUnidad = (id) => { const u = unidades.get(id); return u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null; };
    return (registro) => {
      const m = movimientos.get(registro.movimientoId);
      const { claveIdempotencia, ...propio } = registro;
      return {
        ...propio,
        // V8: el consumo muestra su costo (manual) y el historial de sus cambios; si no tiene, es un valor FALTANTE (null), nunca un cero.
        ...(clase === 'consumo' ? {
          costoImporte: registro.costoImporte ?? null, costoOrigen: registro.costoOrigen ?? null, costoActualizadoEn: registro.costoActualizadoEn ?? null,
          costoCambios: inventario.consumoCostoCambios.filter((c) => c.consumoId === registro.id).reverse()
            .map(({ importeAnterior, importeNuevo, cambiadoEn, usuarioId }) => ({ importeAnterior, importeNuevo, cambiadoEn, usuarioId })),
        } : {}),
        usuarioId: m.usuarioId,
        producto: { id: m.productoId, nombre: productos.get(m.productoId)?.nombre ?? '' },
        // La cantidad ingresada conserva lo USADO (unidad o presentación, factor y conversión): cambiar después una equivalencia no la reescribe.
        cantidad: m.cantidadOriginal,
        unidad: resumenUnidad(m.unidadOriginalId),
        presentacion: m.presentacionOriginalId ? { id: m.presentacionOriginalId, nombre: presentaciones.get(m.presentacionOriginalId)?.nombre ?? '' } : null,
        movimiento: {
          id: m.id, tipo: m.tipo, subtipo: m.subtipo, cantidadBase: m.cantidadBase, unidadBase: resumenUnidad(m.unidadBaseId),
          factorAplicado: m.factorAplicado, conversionId: m.conversionId, redondeado: m.redondeado, fechaHora: m.fechaHora,
        },
      };
    };
  }

  function registrarOperacion(clase, entrada) {
    const { subtipo, referenciaTipo } = CLASES_OPERACION[clase];
    return enSerie(() => {
      try {
        const usuario = exigirSesion();
        const ahora = new Date().toISOString();
        const n = validarOperacion(entrada, clase);
        const inventario = leerInventario();
        const registros = listaDe(inventario, clase);

        // Idempotencia: reenviar la misma operación devuelve la original; la misma clave con otra operación se rechaza.
        const previo = registros.find((r) => r.claveIdempotencia === n.claveIdempotencia);
        if (previo) {
          const movimiento = inventario.movimientos.find((m) => m.id === previo.movimientoId);
          if (!operacionCoincide(n, previo, movimiento)) throw errorClaveReutilizada();
          const fila = inventario.existencias.find((x) => x.productoId === movimiento.productoId);
          return { [clase]: crearVistas(inventario, clase)(previo), existencia: { ...fila }, repetido: true };
        }

        const id = generarId();
        const entradaMovimiento = validarEntradaMovimiento({
          productoId: n.productoId, tipo: 'salida', subtipo, cantidad: n.cantidad,
          unidadId: n.unidadId ?? undefined, presentacionId: n.presentacionId ?? undefined,
          referenciaTipo, referenciaId: id, claveIdempotencia: claveDelMovimiento(n.claveIdempotencia),
        });
        let r;
        try {
          r = procesarMovimiento(inventario, entradaMovimiento, usuario, ahora);
        } catch (e) {
          throw e instanceof ErrorDatos ? errorDeOperacion(e) : e;
        }
        if (r.repetido) throw errorClaveReutilizada(); // ese movimiento ya existe pero no es de esta operación

        const registro = {
          id, movimientoId: r.movimiento.id, ...(clase === 'salida' ? { motivo: n.motivo } : {}),
          // V8: el costo del consumo es un importe propio escrito por la persona (origen manual); sin costo queda null, no 0.
          ...(clase === 'consumo' ? { costoImporte: n.costoImporte, costoOrigen: n.costoImporte ? 'manual' : null, costoActualizadoEn: n.costoImporte ? ahora : null } : {}),
          nota: n.nota, fechaRegistro: ahora, claveIdempotencia: n.claveIdempotencia,
        };
        ganchos.antesDeConfirmar?.();
        const siguiente = {
          ...inventario, movimientos: r.movimientos, existencias: r.existencias,
          [clase === 'salida' ? 'salidas' : 'consumos']: [...registros, registro],
        };
        guardarInventario(siguiente);
        avisarInventario({ productoId: n.productoId, movimientoId: r.movimiento.id }); // tiempo real
        return { [clase]: crearVistas(siguiente, clase)(registro), existencia: { ...r.existencia }, repetido: false };
      } catch (e) {
        if (e instanceof ErrorDatos) throw e;
        throw new ErrorDatos(CODIGOS.DESCONOCIDO); // un fallo inesperado no deja nada guardado
      }
    });
  }

  function listarOperaciones(clase, consulta) {
    const { desde, hasta, productoId, pagina, tamanoPagina } = normalizarConsultaOperaciones(consulta);
    if (productoId) exigirProducto(leerProductos(), productoId);
    const inventario = leerInventario();
    const vista = crearVistas(inventario, clase);
    const filtradas = listaDe(inventario, clase)
      .map((registro, posicion) => ({ posicion, v: vista(registro) }))
      .filter(({ v }) => {
        const dia = hoyEnCostaRica(new Date(v.fechaRegistro)); // el día se cuenta en hora de Costa Rica
        return (!desde || dia >= desde) && (!hasta || dia <= hasta);
      })
      .filter(({ v }) => !productoId || v.producto.id === productoId)
      .sort((a, b) => b.v.fechaRegistro.localeCompare(a.v.fechaRegistro) || b.posicion - a.posicion) // la más reciente primero
      .map(({ v }) => v);
    return paginar(filtradas, pagina, tamanoPagina);
  }

  // REPORTES MENSUALES (V9): solo lectura. Resuelven los nombres de productos y unidades de las filas de cada reporte.
  function crearAyudasDeReporte() {
    const productos = new Map(leerProductos().map((p) => [p.id, p]));
    const unidades = new Map(leerUnidades().map((u) => [u.id, u]));
    const presentaciones = new Map(leerPresentaciones().map((p) => [p.id, p]));
    return {
      unidad: (id) => { const u = unidades.get(id); return u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null; },
      producto: (id) => { const p = productos.get(id); return { id, nombre: p?.nombre ?? '', activo: p ? p.activo : false }; },
      presentacion: (id) => (id ? { id, nombre: presentaciones.get(id)?.nombre ?? '' } : null),
      porNombre: (a, b) => a.producto.nombre.localeCompare(b.producto.nombre, 'es'),
    };
  }

  // HISTORIAL DE MOVIMIENTOS (V7): solo lectura. Une cada movimiento con su producto, sus unidades y su origen.
  const nombreDeUsuario = (id) => (id === USUARIO_DEMO.id ? USUARIO_DEMO.nombre : null); // en la base real, de la tabla de usuarios
  function crearVistaDeMovimiento() {
    const productos = new Map(leerProductos().map((p) => [p.id, p]));
    const unidades = new Map(leerUnidades().map((u) => [u.id, u]));
    const presentaciones = new Map(leerPresentaciones().map((p) => [p.id, p]));
    const resumenUnidad = (id) => { const u = unidades.get(id); return u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null; };
    return (m) => ({
      id: m.id, fechaHora: m.fechaHora, tipo: m.tipo, subtipo: m.subtipo, sentido: m.sentido,
      producto: { id: m.productoId, nombre: productos.get(m.productoId)?.nombre ?? '' },
      // La cantidad conserva lo USADO al registrar (unidad o presentación): cambiar después una equivalencia no la reescribe.
      cantidadOriginal: m.cantidadOriginal, unidad: resumenUnidad(m.unidadOriginalId),
      presentacion: m.presentacionOriginalId ? { id: m.presentacionOriginalId, nombre: presentaciones.get(m.presentacionOriginalId)?.nombre ?? '' } : null,
      cantidadBase: m.cantidadBase, unidadBase: resumenUnidad(m.unidadBaseId),
      referencia: m.referenciaTipo ? { tipo: m.referenciaTipo, id: m.referenciaId } : null,
      usuario: { id: m.usuarioId, nombre: nombreDeUsuario(m.usuarioId) },
      nota: m.nota ?? null,
    });
  }
  // El registro que originó el movimiento (compra, salida o consumo), con lo que explica por qué se hizo.
  function origenDeMovimiento(inventario, m) {
    if (!m.referenciaTipo) return null;
    const base = { tipo: m.referenciaTipo, id: m.referenciaId };
    if (m.referenciaTipo === 'compra') {
      const c = inventario.compras.find((x) => x.id === m.referenciaId);
      return c ? { ...base, fechaCompra: c.fechaCompra, nota: c.nota ?? null } : base;
    }
    if (m.referenciaTipo === 'salida') {
      const s = inventario.salidas.find((x) => x.id === m.referenciaId);
      return s ? { ...base, motivo: s.motivo, nota: s.nota ?? null } : base;
    }
    if (m.referenciaTipo === 'consumo') {
      const c = inventario.consumos.find((x) => x.id === m.referenciaId);
      return c ? { ...base, nota: c.nota ?? null } : base;
    }
    return base;
  }

  function obtenerOperacion(clase, id) {
    const inventario = leerInventario();
    const registro = listaDe(inventario, clase).find((r) => r.id === id);
    if (!registro) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
    return crearVistas(inventario, clase)(registro);
  }

  // GASTOS (V8). Un gasto es un importe con concepto, opcionalmente ligado a un producto y/o a una compra. NO toca existencias, compras
  // ni costos: un gasto relacionado a una compra se identifica como relacionado y NO se suma automáticamente a nada.
  function leerGastos() {
    try {
      const lista = JSON.parse(almacen.getItem(LLAVE_GASTOS) ?? '[]');
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }
  const guardarGastos = (lista) => almacen.setItem(LLAVE_GASTOS, JSON.stringify(lista));

  function crearVistaDeGasto() {
    const productos = new Map(leerProductos().map((p) => [p.id, p]));
    const compras = new Map(leerInventario().compras.map((c) => [c.id, c]));
    return (gasto) => {
      const { claveIdempotencia, productoId, compraId, ...propio } = gasto;
      const producto = productoId ? productos.get(productoId) : null;
      const compra = compraId ? compras.get(compraId) : null;
      return {
        ...propio,
        producto: productoId ? { id: productoId, nombre: producto?.nombre ?? '' } : null,
        compra: compraId ? { id: compraId, fechaCompra: compra?.fechaCompra ?? '', total: compra?.total ?? null } : null,
        relacionadoConCompra: Boolean(compraId), // se identifica como relacionado; NO se suma automáticamente
      };
    };
  }

  return {
    nombre: 'demo',
    esDemo: true,
    autenticacion: {
      async iniciarSesion(correo, clave) {
        await esperar(retardoMs);
        const correoLimpio = String(correo ?? '').trim().toLowerCase();
        if (!correoLimpio || !clave) throw new ErrorDatos(CODIGOS.VALIDACION);
        if (correoLimpio !== USUARIO_DEMO.correo || clave !== CLAVE_DEMO) {
          throw new ErrorDatos(CODIGOS.CREDENCIALES_INVALIDAS);
        }
        almacen.setItem(LLAVE_SESION, JSON.stringify(USUARIO_DEMO));
        avisar(USUARIO_DEMO);
        return { ...USUARIO_DEMO };
      },
      async cerrarSesion() {
        await esperar(retardoMs / 3);
        almacen.removeItem(LLAVE_SESION);
        avisar(null);
      },
      async obtenerSesion() {
        const crudo = almacen.getItem(LLAVE_SESION);
        if (!crudo) return null;
        try {
          return JSON.parse(crudo);
        } catch {
          almacen.removeItem(LLAVE_SESION);
          return null;
        }
      },
      alCambiarSesion(callback) {
        oyentes.add(callback);
        return () => oyentes.delete(callback);
      },
    },
    productos: {
      async crearProducto({ nombre, unidadBaseId } = {}) {
        await esperar(retardoMs);
        const usuario = exigirSesion();
        const { nombre: limpio, nombreNormalizado } = validarEntradaProducto({ nombre, unidadBaseId }, { unidadObligatoria: true });
        const lista = leerProductos();
        const repetido = lista.find((p) => p.nombreNormalizado === nombreNormalizado);
        if (repetido) throw errorNombreDuplicado(repetido);
        const ahora = new Date().toISOString(); // la hora la asigna la capa de datos, no la interfaz
        const producto = {
          id: generarId(), nombre: limpio, nombreNormalizado, activo: true,
          unidadBaseId, // obligatoria desde la V3
          creadoEn: ahora, actualizadoEn: ahora, creadoPor: usuario.id,
        };
        guardarProductos([...lista, producto]);
        return { ...producto };
      },
      async editarProducto(id, entrada = {}) {
        await esperar(retardoMs);
        exigirSesion();
        const lista = leerProductos();
        const actual = exigirProducto(lista, id);
        // Si la entrada trae `unidadBaseId` se valida y se cambia (así se completan los productos de la V2);
        // si no la trae, la unidad base actual no se toca.
        const traeUnidad = Object.prototype.hasOwnProperty.call(entrada, 'unidadBaseId');
        const { nombre: limpio, nombreNormalizado } = validarEntradaProducto(entrada, {
          unidadObligatoria: traeUnidad, unidadActualId: actual.unidadBaseId,
        });
        // V4: con movimientos registrados, la unidad base ya no se puede cambiar (las existencias están expresadas en ella).
        // Completar un producto heredado sin unidad base sí se permite: no puede tener movimientos.
        if (traeUnidad && actual.unidadBaseId && entrada.unidadBaseId !== actual.unidadBaseId
          && leerInventario().movimientos.some((m) => m.productoId === id)) {
          const mensaje = 'No se puede cambiar la unidad base: el producto ya tiene movimientos.';
          throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { unidadBaseId: mensaje });
        }
        const repetido = lista.find((p) => p.id !== id && p.nombreNormalizado === nombreNormalizado);
        if (repetido) throw errorNombreDuplicado(repetido);
        const editado = {
          ...actual, nombre: limpio, nombreNormalizado,
          unidadBaseId: traeUnidad ? entrada.unidadBaseId : actual.unidadBaseId,
          actualizadoEn: new Date().toISOString(),
        };
        guardarProductos(lista.map((p) => (p.id === id ? editado : p)));
        return { ...editado };
      },
      async obtenerProducto(id) {
        await esperar(retardoMs);
        exigirSesion();
        return { ...exigirProducto(leerProductos(), id) };
      },
      async listarProductos(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { busqueda, estado, pagina, tamanoPagina, soloCompletos } = normalizarConsulta(consulta);
        const resultado = paginar(filtrarYOrdenar(leerProductos(), { busqueda, estado, soloCompletos }), pagina, tamanoPagina);
        return { ...resultado, items: resultado.items.map((p) => ({ ...p })) };
      },
      async cambiarEstadoProducto(id, activo) {
        await esperar(retardoMs);
        exigirSesion();
        if (typeof activo !== 'boolean') throw new ErrorDatos(CODIGOS.VALIDACION);
        const lista = leerProductos();
        const actual = exigirProducto(lista, id);
        const cambiado = { ...actual, activo, actualizadoEn: new Date().toISOString() };
        guardarProductos(lista.map((p) => (p.id === id ? cambiado : p)));
        return { ...cambiado };
      },
    },
    unidades: {
      async crearUnidad(entrada = {}) {
        await esperar(retardoMs);
        const usuario = exigirSesion();
        const valida = validarUnidad(entrada);
        const lista = leerUnidades();
        const repetida = detectarUnidadDuplicada(lista, valida);
        if (repetida) throw errorUnidadDuplicada(repetida);
        const ahora = new Date().toISOString();
        const unidad = {
          id: generarId(), ...valida, activo: true, sugerida: false,
          creadoEn: ahora, actualizadoEn: ahora, creadoPor: usuario.id,
        };
        guardarUnidades([...lista, unidad]);
        return unidadPublica(unidad);
      },
      async editarUnidad(id, entrada = {}) {
        await esperar(retardoMs);
        exigirSesion();
        const lista = leerUnidades();
        const actual = exigirUnidad(lista, id);
        const valida = validarUnidad(entrada);
        const repetida = detectarUnidadDuplicada(lista, valida, id);
        if (repetida) throw errorUnidadDuplicada(repetida);
        if (valida.dimension !== actual.dimension && unidadEnUso(id)) {
          const mensaje = 'Esta unidad ya se usa en productos: no se puede cambiar lo que mide.';
          throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { dimension: mensaje });
        }
        const editada = { ...actual, ...valida, actualizadoEn: new Date().toISOString() };
        guardarUnidades(lista.map((u) => (u.id === id ? editada : u)));
        return unidadPublica(editada);
      },
      async obtenerUnidad(id) {
        await esperar(retardoMs);
        exigirSesion();
        return unidadPublica(exigirUnidad(leerUnidades(), id));
      },
      async listarUnidades({ estado = 'activas' } = {}) {
        await esperar(retardoMs);
        exigirSesion();
        const e = ESTADOS_UNIDAD.includes(estado) ? estado : 'activas';
        return filtrarUnidades(leerUnidades(), e).map(unidadPublica);
      },
      async cambiarEstadoUnidad(id, activo) {
        await esperar(retardoMs);
        exigirSesion();
        if (typeof activo !== 'boolean') throw new ErrorDatos(CODIGOS.VALIDACION);
        const lista = leerUnidades();
        const actual = exigirUnidad(lista, id);
        const cambiada = { ...actual, activo, actualizadoEn: new Date().toISOString() };
        guardarUnidades(lista.map((u) => (u.id === id ? cambiada : u)));
        return unidadPublica(cambiada);
      },
    },
    presentaciones: {
      async crearPresentacion(productoId, entrada = {}) {
        await esperar(retardoMs);
        const usuario = exigirSesion();
        exigirProducto(leerProductos(), productoId);
        const valida = validarPresentacion(entrada, leerUnidades());
        const lista = leerPresentaciones();
        const repetida = detectarPresentacionDuplicada(lista, productoId, valida.nombreNormalizado);
        if (repetida) throw errorPresentacionDuplicada(repetida);
        const ahora = new Date().toISOString();
        const presentacion = { id: generarId(), productoId, ...valida, activo: true, creadoEn: ahora, actualizadoEn: ahora, creadoPor: usuario.id };
        guardarPresentaciones([...lista, presentacion]);
        return { ...presentacion };
      },
      async editarPresentacion(id, entrada = {}) {
        await esperar(retardoMs);
        exigirSesion();
        const lista = leerPresentaciones();
        const actual = exigirPresentacion(lista, id);
        const valida = validarPresentacion(entrada, leerUnidades(), { unidadActualId: actual.unidadId });
        const repetida = detectarPresentacionDuplicada(lista, actual.productoId, valida.nombreNormalizado, id);
        if (repetida) throw errorPresentacionDuplicada(repetida);
        // Los movimientos futuros guardarán el factor con el que se registraron: editar el contenido no reescribe el historial.
        const editada = { ...actual, ...valida, actualizadoEn: new Date().toISOString() };
        guardarPresentaciones(lista.map((p) => (p.id === id ? editada : p)));
        return { ...editada };
      },
      async obtenerPresentacion(id) {
        await esperar(retardoMs);
        exigirSesion();
        return { ...exigirPresentacion(leerPresentaciones(), id) };
      },
      async listarPresentaciones(productoId, { estado = 'activas' } = {}) {
        await esperar(retardoMs);
        exigirSesion();
        exigirProducto(leerProductos(), productoId);
        const e = ESTADOS_PRESENTACION.includes(estado) ? estado : 'activas';
        return filtrarPresentaciones(leerPresentaciones().filter((p) => p.productoId === productoId), e).map((p) => ({ ...p }));
      },
      async cambiarEstadoPresentacion(id, activo) {
        await esperar(retardoMs);
        exigirSesion();
        if (typeof activo !== 'boolean') throw new ErrorDatos(CODIGOS.VALIDACION);
        const lista = leerPresentaciones();
        const actual = exigirPresentacion(lista, id);
        const cambiada = { ...actual, activo, actualizadoEn: new Date().toISOString() };
        guardarPresentaciones(lista.map((p) => (p.id === id ? cambiada : p)));
        return { ...cambiada };
      },
    },
    conversiones: {
      async crearConversion(entrada = {}) {
        await esperar(retardoMs);
        const usuario = exigirSesion();
        const productoId = entrada.productoId ?? null;
        if (productoId !== null) exigirProducto(leerProductos(), productoId);
        const valida = validarConversion(entrada, leerUnidades(), { productoId });
        const lista = leerConversiones();
        if (detectarConversionDuplicada(lista, productoId, valida.unidadOrigenId, valida.unidadDestinoId)) throw errorConversionDuplicada();
        const conversion = {
          id: generarId(), productoId, ...valida, vigente: true, sugerida: false,
          reemplazaId: null, reemplazadaPorId: null, creadoEn: new Date().toISOString(), creadoPor: usuario.id,
        };
        guardarConversiones([...lista, conversion]);
        return { ...conversion };
      },
      // Un factor NUNCA se edita en el lugar: se crea una versión nueva y la anterior queda no vigente.
      // Así, lo registrado con la equivalencia anterior conserva su sentido. PROVISIONAL: aplica a todas las conversiones.
      async cambiarFactorConversion(id, factor) {
        await esperar(retardoMs);
        const usuario = exigirSesion();
        const lista = leerConversiones();
        const actual = exigirConversion(lista, id);
        if (!actual.vigente) {
          const mensaje = 'Esa equivalencia ya no está vigente. Cambiá la versión vigente.';
          throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { factor: mensaje });
        }
        const { mensaje, factor: factorLimpio } = leerFactor(factor);
        if (mensaje) throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { factor: mensaje });
        if (aDecimalIgual(factorLimpio, actual.factor)) throw errorFactorSinCambio();
        const nueva = {
          id: generarId(), productoId: actual.productoId, unidadOrigenId: actual.unidadOrigenId, unidadDestinoId: actual.unidadDestinoId,
          factor: factorLimpio, vigente: true, sugerida: false, reemplazaId: actual.id, reemplazadaPorId: null,
          creadoEn: new Date().toISOString(), creadoPor: usuario.id,
        };
        guardarConversiones([...lista.map((c) => (c.id === id ? { ...c, vigente: false, reemplazadaPorId: nueva.id } : c)), nueva]);
        return { ...nueva };
      },
      async retirarConversion(id) {
        await esperar(retardoMs);
        exigirSesion();
        const lista = leerConversiones();
        const actual = exigirConversion(lista, id);
        if (!actual.vigente) throw new ErrorDatos(CODIGOS.VALIDACION, 'Esa equivalencia ya no está vigente.');
        const retirada = { ...actual, vigente: false };
        guardarConversiones(lista.map((c) => (c.id === id ? retirada : c)));
        return { ...retirada };
      },
      async obtenerConversion(id) {
        await esperar(retardoMs);
        exigirSesion();
        return { ...exigirConversion(leerConversiones(), id) };
      },
      async listarConversiones({ productoId = null, vigentes = true } = {}) {
        await esperar(retardoMs);
        exigirSesion();
        if (productoId !== null) exigirProducto(leerProductos(), productoId);
        return leerConversiones()
          .filter((c) => c.productoId === productoId && (!vigentes || c.vigente))
          .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
          .map((c) => ({ ...c }));
      },
      async convertir(productoId, cantidad, origen, destino) {
        await esperar(retardoMs);
        exigirSesion();
        exigirProducto(leerProductos(), productoId);
        return convertirCantidad({
          productoId, cantidad, origen, destino,
          unidades: leerUnidades(), presentaciones: leerPresentaciones(), conversiones: leerConversiones(),
        });
      },
    },
    inventario: {
      // ÚNICA vía para cambiar existencias. Todo ocurre dentro de `enSerie` y se confirma con UNA sola escritura.
      async registrarMovimiento(entrada) {
        await esperar(retardoMs);
        return enSerie(() => {
          try {
            const usuario = exigirSesion();
            const n = validarEntradaMovimiento(entrada);
            const inventario = leerInventario();
            const r = procesarMovimiento(inventario, n, usuario, new Date().toISOString());
            if (r.repetido) return { movimiento: { ...r.movimiento }, existencia: { ...r.existencia }, repetido: true };
            ganchos.antesDeConfirmar?.();
            guardarInventario({ ...inventario, movimientos: r.movimientos, existencias: r.existencias });
            avisarInventario({ productoId: n.productoId, movimientoId: r.movimiento.id }); // tiempo real
            return { movimiento: { ...r.movimiento }, existencia: { ...r.existencia }, repetido: false };
          } catch (e) {
            if (e instanceof ErrorDatos) throw e;
            throw new ErrorDatos(CODIGOS.DESCONOCIDO); // un fallo inesperado no deja nada guardado
          }
        });
      },
      async listarExistencias(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { busqueda, estado, pagina, tamanoPagina } = normalizarConsulta(consulta);
        const productos = leerProductos();
        const unidades = leerUnidades();
        const { existencias } = leerInventario();
        const completos = paginar(filtrarYOrdenar(productos, { busqueda, estado, soloCompletos: true }), pagina, tamanoPagina);
        const incompletos = filtrarYOrdenar(productos, { busqueda: '', estado, soloCompletos: false }).filter(productoIncompleto).length;
        const items = completos.items.map((p) => {
          const fila = existencias.find((x) => x.productoId === p.id);
          const u = unidades.find((x) => x.id === p.unidadBaseId);
          const cantidadBase = fila?.cantidadBase ?? '0';
          return {
            productoId: p.id, nombre: p.nombre, activo: p.activo,
            unidadBase: u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null,
            cantidadBase, actualizadoEn: fila?.actualizadoEn ?? null, sinExistencia: new Decimal(cantidadBase).isZero(),
          };
        });
        return { ...completos, items, incompletos };
      },
      async obtenerExistencia(productoId) {
        await esperar(retardoMs);
        exigirSesion();
        const producto = exigirProducto(leerProductos(), productoId);
        const fila = leerInventario().existencias.find((x) => x.productoId === productoId);
        const u = leerUnidades().find((x) => x.id === producto.unidadBaseId);
        const cantidadBase = fila?.cantidadBase ?? '0';
        return {
          productoId, cantidadBase, actualizadoEn: fila?.actualizadoEn ?? null,
          unidadBase: u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null,
          sinExistencia: new Decimal(cantidadBase).isZero(),
        };
      },
      async verificarConsistencia() {
        await esperar(retardoMs);
        exigirSesion();
        const { movimientos, existencias } = leerInventario();
        return calcularConsistencia(movimientos, existencias);
      },
      alCambiarInventario(callback) {
        oyentesInventario.add(callback);
        return () => oyentesInventario.delete(callback);
      },
    },
    movimientos: {
      // SOLO LECTURA (V7): no modifica nada. Los movimientos son inmutables; las correcciones se hacen con movimientos nuevos (V12).
      async listarMovimientos(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const c = normalizarConsultaMovimientos(consulta);
        if (c.productoId) exigirProducto(leerProductos(), c.productoId); // un producto inactivo sí se puede consultar
        const { movimientos } = leerInventario();
        const pagina = paginar(filtrarMovimientos(movimientos, c), c.pagina, c.tamanoPagina);
        const vista = crearVistaDeMovimiento();
        return { ...pagina, items: pagina.items.map(vista) }; // la vista solo se arma para la página pedida
      },
      async obtenerMovimiento(id) {
        await esperar(retardoMs);
        exigirSesion();
        const inventario = leerInventario();
        const m = inventario.movimientos.find((x) => x.id === id);
        if (!m) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
        const existencia = existenciaAlMovimiento(inventario.movimientos, id);
        return {
          ...crearVistaDeMovimiento()(m),
          factorAplicado: m.factorAplicado, conversionId: m.conversionId, redondeado: m.redondeado,
          existenciaAnterior: existencia.antes, existenciaResultante: existencia.despues,
          origen: origenDeMovimiento(inventario, m),
        };
      },
      async consolidarMovimientos(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { desde, hasta, productoId } = normalizarConsultaMovimientos({ desde: consulta?.desde, hasta: consulta?.hasta, productoId: consulta?.productoId });
        if (productoId) exigirProducto(leerProductos(), productoId);
        const { movimientos } = leerInventario();
        const productos = new Map(leerProductos().map((p) => [p.id, p]));
        const unidades = new Map(leerUnidades().map((u) => [u.id, u]));
        const filas = consolidar(movimientos, { desde, hasta, productoId })
          .map(({ productoId: id, unidadBaseId, ...cifras }) => {
            const u = unidades.get(unidadBaseId);
            return {
              producto: { id, nombre: productos.get(id)?.nombre ?? '' },
              unidadBase: u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null,
              ...cifras,
            };
          })
          .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, 'es'));
        const totalMovimientos = filas.reduce((t, f) => t + f.cantidadEntradas + f.cantidadSalidas + f.cantidadAjustes, 0);
        return { desde, hasta, filas, totalMovimientos };
      },
    },
    reportes: {
      // SOLO LECTURA (V9): no modifica nada. Los reportes reflejan únicamente operaciones confirmadas (movimientos y compras guardados).
      async inventarioAlCierre(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { mes, desde, hasta } = validarMes(consulta?.mes);
        const { movimientos } = leerInventario();
        const ayudas = crearAyudasDeReporte();
        const filas = calcularCierre(movimientos, { hasta })
          .map((f) => ({
            producto: ayudas.producto(f.productoId), unidadBase: ayudas.unidad(f.unidadBaseId),
            existencia: f.existencia, cantidadMovimientos: f.cantidadMovimientos,
          }))
          .sort(ayudas.porNombre);
        return { mes, desde, hasta, cierre: hasta, filas, totalProductos: filas.length };
      },
      async resumenMovimientos(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { mes, desde, hasta } = validarMes(consulta?.mes);
        const { movimientos } = leerInventario();
        const ayudas = crearAyudasDeReporte();
        const filas = resumenDelMes(movimientos, { desde, hasta })
          .map(({ productoId, unidadBaseId, ...cifras }) => ({ producto: ayudas.producto(productoId), unidadBase: ayudas.unidad(unidadBaseId), ...cifras }))
          .sort(ayudas.porNombre);
        const totalMovimientos = filas.reduce((t, f) => t + f.cantidadIngresos + f.cantidadSalidas + f.cantidadAjustes, 0);
        return { mes, desde, hasta, filas, totalMovimientos };
      },
      async comprasMensuales(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { mes, desde, hasta } = validarMes(consulta?.mes);
        const { compras, compraLineas, movimientos } = leerInventario();
        const ayudas = crearAyudasDeReporte();
        const resultado = comprasDelMes(compras, compraLineas, movimientos, { desde, hasta });
        const grupos = resultado.grupos
          .map((g) => ({
            producto: ayudas.producto(g.productoId), unidadBase: ayudas.unidad(g.unidadBaseId),
            lineas: g.lineas.map((l) => ({
              lineaId: l.lineaId, compraId: l.compraId, fechaCompra: l.fechaCompra, cantidad: l.cantidad,
              unidad: ayudas.unidad(l.unidadId), presentacion: ayudas.presentacion(l.presentacionId),
              costoUnitario: l.costoUnitario, costoTotal: l.costoTotal, cantidadBase: l.cantidadBase,
            })),
            subtotalCosto: g.subtotalCosto, subtotalCantidadBase: g.subtotalCantidadBase, cantidadLineas: g.cantidadLineas,
          }))
          .sort(ayudas.porNombre);
        return {
          mes, desde, hasta, grupos, totalGeneral: resultado.totalGeneral,
          cantidadCompras: resultado.cantidadCompras, cantidadLineas: resultado.cantidadLineas,
        };
      },
    },
    compras: {
      // Compra e ingreso son UNA sola operación: cada línea genera un ingreso por el mismo núcleo que registrarMovimiento
      // y TODO (compra, líneas, movimientos y existencias) se confirma con una sola escritura. Si una línea falla, no queda nada.
      async registrarCompra(entrada) {
        await esperar(retardoMs);
        return enSerie(() => {
          try {
            const usuario = exigirSesion();
            const ahoraFecha = new Date();
            const ahora = ahoraFecha.toISOString();
            const n = validarCompra(entrada, { hoy: hoyEnCostaRica(ahoraFecha) });
            const inventario = leerInventario();

            // Idempotencia: reenviar la misma compra devuelve la original; la misma clave con otra compra se rechaza.
            const previa = inventario.compras.find((c) => c.claveIdempotencia === n.claveIdempotencia);
            if (previa) {
              const lineasPrevias = inventario.compraLineas.filter((l) => l.compraId === previa.id);
              if (!compraCoincide(n, previa, lineasPrevias)) throw errorClaveReutilizada();
              return { compra: { ...previa, lineas: lineasPrevias.map((l) => ({ ...l })) }, repetido: true };
            }

            const compraId = generarId();
            let estado = inventario;
            const lineas = [];
            n.lineas.forEach((l, i) => {
              try {
                const entradaMovimiento = validarEntradaMovimiento({
                  productoId: l.productoId, tipo: 'ingreso', subtipo: 'compra', cantidad: l.cantidad,
                  unidadId: l.unidadId ?? undefined, presentacionId: l.presentacionId ?? undefined,
                  referenciaTipo: 'compra', referenciaId: compraId, claveIdempotencia: claveDeLinea(n.claveIdempotencia, i),
                });
                const r = procesarMovimiento(estado, entradaMovimiento, usuario, ahora);
                estado = { ...estado, movimientos: r.movimientos, existencias: r.existencias };
                lineas.push({
                  id: generarId(), compraId, productoId: l.productoId, presentacionId: r.movimiento.presentacionOriginalId,
                  cantidad: r.movimiento.cantidadOriginal, unidadId: r.movimiento.unidadOriginalId,
                  costoUnitario: l.costoUnitario, costoTotal: l.costoTotal, movimientoId: r.movimiento.id,
                });
              } catch (e) {
                if (e instanceof ErrorDatos) throw errorDeLinea(e, i);
                throw e;
              }
            });
            const compra = {
              id: compraId, fechaCompra: n.fechaCompra, registradaEn: ahora, usuarioId: usuario.id, nota: n.nota,
              total: totalDeLineas(lineas), claveIdempotencia: n.claveIdempotencia,
            };
            ganchos.antesDeConfirmar?.();
            guardarInventario({
              ...estado, compras: [...inventario.compras, compra], compraLineas: [...inventario.compraLineas, ...lineas],
            });
            const nuevos = estado.movimientos.slice(inventario.movimientos.length);
            nuevos.forEach((m) => avisarInventario({ productoId: m.productoId, movimientoId: m.id })); // tiempo real
            return { compra: { ...compra, lineas: lineas.map((l) => ({ ...l })) }, repetido: false };
          } catch (e) {
            if (e instanceof ErrorDatos) throw e;
            throw new ErrorDatos(CODIGOS.DESCONOCIDO); // un fallo inesperado no deja nada guardado
          }
        });
      },
      async listarCompras(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { desde, hasta, productoId, pagina, tamanoPagina } = normalizarConsultaCompras(consulta);
        if (productoId) exigirProducto(leerProductos(), productoId);
        const { compras, compraLineas } = leerInventario();
        const nombres = new Map(leerProductos().map((p) => [p.id, p.nombre]));
        const filtradas = compras
          .filter((c) => (!desde || c.fechaCompra >= desde) && (!hasta || c.fechaCompra <= hasta))
          .filter((c) => !productoId || compraLineas.some((l) => l.compraId === c.id && l.productoId === productoId))
          .sort((a, b) => b.fechaCompra.localeCompare(a.fechaCompra) || b.registradaEn.localeCompare(a.registradaEn));
        const pag = paginar(filtradas, pagina, tamanoPagina);
        const items = pag.items.map((c) => {
          const propias = compraLineas.filter((l) => l.compraId === c.id);
          const productos = [...new Set(propias.map((l) => nombres.get(l.productoId) ?? ''))].filter(Boolean);
          const { claveIdempotencia, ...resto } = c;
          return { ...resto, cantidadLineas: propias.length, productos };
        });
        return { ...pag, items };
      },
      async obtenerCompra(id) {
        await esperar(retardoMs);
        exigirSesion();
        const { compras, compraLineas, movimientos } = leerInventario();
        const compra = compras.find((c) => c.id === id);
        if (!compra) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
        const productos = new Map(leerProductos().map((p) => [p.id, p]));
        const unidades = new Map(leerUnidades().map((u) => [u.id, u]));
        const presentaciones = new Map(leerPresentaciones().map((p) => [p.id, p]));
        const resumenUnidad = (uid) => { const u = unidades.get(uid); return u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null; };
        const lineas = compraLineas.filter((l) => l.compraId === id).map((l) => {
          const m = movimientos.find((x) => x.id === l.movimientoId);
          return {
            ...l,
            producto: { id: l.productoId, nombre: productos.get(l.productoId)?.nombre ?? '' },
            unidad: resumenUnidad(l.unidadId),
            presentacion: l.presentacionId ? { id: l.presentacionId, nombre: presentaciones.get(l.presentacionId)?.nombre ?? '' } : null,
            // El ingreso generado conserva lo USADO: cantidad base, factor y conversión (cambiar después una equivalencia no lo reescribe).
            movimiento: m ? {
              id: m.id, tipo: m.tipo, subtipo: m.subtipo, cantidadBase: m.cantidadBase, unidadBase: resumenUnidad(m.unidadBaseId),
              factorAplicado: m.factorAplicado, conversionId: m.conversionId, redondeado: m.redondeado, fechaHora: m.fechaHora,
            } : null,
          };
        });
        const { claveIdempotencia, ...resto } = compra;
        return { ...resto, lineas };
      },
    },
    salidas: {
      // Una salida descuenta existencias por el MISMO núcleo que registrarMovimiento. Mayor que lo disponible: se rechaza sin guardar nada.
      async registrarSalida(entrada) {
        await esperar(retardoMs);
        return registrarOperacion('salida', entrada);
      },
      async listarSalidas(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        return listarOperaciones('salida', consulta);
      },
      async obtenerSalida(id) {
        await esperar(retardoMs);
        exigirSesion();
        return obtenerOperacion('salida', id);
      },
    },
    consumos: {
      // Un consumo NO es una salida con otro nombre: tiene su propia tabla, sin motivo (el costo llega en la V8).
      async registrarConsumo(entrada) {
        await esperar(retardoMs);
        return registrarOperacion('consumo', entrada);
      },
      async listarConsumos(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        return listarOperaciones('consumo', consulta);
      },
      async obtenerConsumo(id) {
        await esperar(retardoMs);
        exigirSesion();
        return obtenerOperacion('consumo', id);
      },
      // ÚNICO dato editable de un consumo (RF-030): el costo manual. Todo lo demás sigue inmutable. Cada cambio queda en un historial
      // (el valor anterior no se pierde) y se confirma con UNA sola escritura. Solo mientras el período no esté cerrado.
      async editarCostoConsumo(id, entrada) {
        await esperar(retardoMs);
        return enSerie(() => {
          try {
            const usuario = exigirSesion();
            const ahora = new Date().toISOString();
            const { costoImporte } = validarEdicionDeCosto(entrada);
            const inventario = leerInventario();
            const actual = inventario.consumos.find((c) => c.id === id);
            if (!actual) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
            if (periodoCerrado(hoyEnCostaRica(new Date(actual.fechaRegistro)))) {
              const mensaje = 'El período de este consumo está cerrado: su costo ya no se puede editar.';
              throw new ErrorDatos(CODIGOS.VALIDACION, mensaje, { costoImporte: mensaje });
            }
            const anterior = actual.costoImporte ?? null;
            if (anterior === costoImporte) return { consumo: crearVistas(inventario, 'consumo')(actual), cambiado: false };
            const actualizado = {
              ...actual, costoImporte, costoOrigen: costoImporte ? 'manual' : null, costoActualizadoEn: costoImporte ? ahora : null,
            };
            const cambio = { id: generarId(), consumoId: id, importeAnterior: anterior, importeNuevo: costoImporte, cambiadoEn: ahora, usuarioId: usuario.id };
            const siguiente = {
              ...inventario,
              consumos: inventario.consumos.map((c) => (c.id === id ? actualizado : c)),
              consumoCostoCambios: [...inventario.consumoCostoCambios, cambio],
            };
            ganchos.antesDeConfirmar?.();
            guardarInventario(siguiente);
            return { consumo: crearVistas(siguiente, 'consumo')(actualizado), cambiado: true };
          } catch (e) {
            if (e instanceof ErrorDatos) throw e;
            throw new ErrorDatos(CODIGOS.DESCONOCIDO); // un fallo inesperado no deja nada guardado
          }
        });
      },
    },
    gastos: {
      async registrarGasto(entrada) {
        await esperar(retardoMs);
        return enSerie(() => {
          try {
            const usuario = exigirSesion();
            const ahoraFecha = new Date();
            const ahora = ahoraFecha.toISOString();
            const n = validarGasto(entrada, { hoy: hoyEnCostaRica(ahoraFecha) });
            const gastos = leerGastos();

            // Idempotencia: reenviar el mismo gasto devuelve el original; la misma clave con otro gasto se rechaza.
            const previo = gastos.find((g) => g.claveIdempotencia === n.claveIdempotencia);
            if (previo) {
              if (!gastoCoincide(n, previo)) throw errorClaveReutilizada();
              return { gasto: crearVistaDeGasto()(previo), repetido: true };
            }

            const campos = {};
            if (n.productoId && !leerProductos().some((p) => p.id === n.productoId)) campos.productoId = 'El producto elegido no existe.';
            if (n.compraId && !leerInventario().compras.some((c) => c.id === n.compraId)) campos.compraId = 'La compra elegida no existe.';
            lanzarSiHayCampos(campos);

            const gasto = {
              id: generarId(), fechaGasto: n.fechaGasto, concepto: n.concepto, importe: n.importe,
              productoId: n.productoId, compraId: n.compraId, nota: n.nota, usuarioId: usuario.id, registradoEn: ahora,
              claveIdempotencia: n.claveIdempotencia,
            };
            guardarGastos([...gastos, gasto]);
            return { gasto: crearVistaDeGasto()(gasto), repetido: false };
          } catch (e) {
            if (e instanceof ErrorDatos) throw e;
            throw new ErrorDatos(CODIGOS.DESCONOCIDO);
          }
        });
      },
      async listarGastos(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { desde, hasta, productoId, compraId, pagina, tamanoPagina } = normalizarConsultaGastos(consulta);
        if (productoId) exigirProducto(leerProductos(), productoId);
        if (compraId && !leerInventario().compras.some((c) => c.id === compraId)) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
        const vista = crearVistaDeGasto();
        const filtrados = leerGastos()
          .map((gasto, posicion) => ({ gasto, posicion }))
          .filter(({ gasto }) => (!desde || gasto.fechaGasto >= desde) && (!hasta || gasto.fechaGasto <= hasta))
          .filter(({ gasto }) => !productoId || gasto.productoId === productoId)
          .filter(({ gasto }) => !compraId || gasto.compraId === compraId)
          .sort((a, b) => b.gasto.fechaGasto.localeCompare(a.gasto.fechaGasto) || b.gasto.registradoEn.localeCompare(a.gasto.registradoEn) || b.posicion - a.posicion)
          .map(({ gasto }) => vista(gasto));
        return paginar(filtrados, pagina, tamanoPagina);
      },
      async obtenerGasto(id) {
        await esperar(retardoMs);
        exigirSesion();
        const gasto = leerGastos().find((g) => g.id === id);
        if (!gasto) throw new ErrorDatos(CODIGOS.NO_ENCONTRADO);
        return crearVistaDeGasto()(gasto);
      },
    },
    costos: {
      // SOLO LECTURA y solo información REAL: lo que costó cada línea de compra. NO hay ninguna operación de costo promedio (BLOQUEADO).
      async listarCostosPorProducto(consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const { busqueda, estado, pagina, tamanoPagina } = normalizarConsulta(consulta);
        const unidades = new Map(leerUnidades().map((u) => [u.id, u]));
        const { compraLineas } = leerInventario();
        const pag = paginar(filtrarYOrdenar(leerProductos(), { busqueda, estado, soloCompletos: false }), pagina, tamanoPagina);
        const items = pag.items.map((p) => {
          const u = unidades.get(p.unidadBaseId);
          return {
            productoId: p.id, nombre: p.nombre, activo: p.activo,
            unidadBase: u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null,
            lineasDeCompra: compraLineas.filter((l) => l.productoId === p.id).length,
          };
        });
        return { ...pag, items };
      },
      async historialCostosAdquisicion(productoId, consulta) {
        await esperar(retardoMs);
        exigirSesion();
        const producto = exigirProducto(leerProductos(), productoId);
        const { desde, hasta, pagina, tamanoPagina } = normalizarConsultaCompras(consulta);
        const unidades = new Map(leerUnidades().map((u) => [u.id, u]));
        const presentaciones = new Map(leerPresentaciones().map((p) => [p.id, p]));
        const resumenUnidad = (uid) => { const u = unidades.get(uid); return u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null; };
        const { compras, compraLineas } = leerInventario();
        const porId = new Map(compras.map((c) => [c.id, c]));
        const filtradas = compraLineas
          .map((linea, posicion) => ({ linea, posicion, compra: porId.get(linea.compraId) }))
          .filter(({ linea, compra }) => linea.productoId === productoId && compra)
          .filter(({ compra }) => (!desde || compra.fechaCompra >= desde) && (!hasta || compra.fechaCompra <= hasta))
          .sort((a, b) => b.compra.fechaCompra.localeCompare(a.compra.fechaCompra) || b.compra.registradaEn.localeCompare(a.compra.registradaEn) || b.posicion - a.posicion)
          .map(({ linea, compra }) => ({
            // Tal como se registró: sin promediar y sin convertir a costo por unidad base (fórmula sin aprobar).
            lineaId: linea.id, compraId: compra.id, fechaCompra: compra.fechaCompra, cantidad: linea.cantidad,
            unidad: resumenUnidad(linea.unidadId),
            presentacion: linea.presentacionId ? { id: linea.presentacionId, nombre: presentaciones.get(linea.presentacionId)?.nombre ?? '' } : null,
            costoUnitario: linea.costoUnitario, costoTotal: linea.costoTotal,
          }));
        const u = unidades.get(producto.unidadBaseId);
        return {
          ...paginar(filtradas, pagina, tamanoPagina),
          producto: {
            id: producto.id, nombre: producto.nombre, activo: producto.activo,
            unidadBase: u ? { id: u.id, nombre: u.nombre, abreviatura: u.abreviatura } : null,
          },
        };
      },
    },
  };
}
