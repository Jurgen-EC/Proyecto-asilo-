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
import { hoyEnCostaRica } from '../../compartido/utilidades/formato.js';
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

  // Inventario (V4) y compras (V5): movimientos, existencias, compras y líneas de compra. Siempre se leen y se guardan
  // JUNTOS, en una sola clave (atomicidad): una compra con varias líneas se confirma con UNA escritura o no se escribe nada.
  function leerInventario() {
    try {
      const o = JSON.parse(almacen.getItem(LLAVE_INVENTARIO) ?? 'null');
      if (o && Array.isArray(o.movimientos) && Array.isArray(o.existencias)) {
        return { ...o, compras: Array.isArray(o.compras) ? o.compras : [], compraLineas: Array.isArray(o.compraLineas) ? o.compraLineas : [] };
      }
    } catch { /* se trata como vacío */ }
    return { movimientos: [], existencias: [], compras: [], compraLineas: [] };
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
  };
}
