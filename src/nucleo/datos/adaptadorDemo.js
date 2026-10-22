// ADAPTADOR DE DEMOSTRACIÓN
// Sirve solo para que el sistema funcione sin base de datos. NO guarda nada
// real: la sesión y los productos viven en la memoria del navegador (sessionStorage,
// se pierden al cerrar la pestaña) y el único usuario es ficticio. Se reemplazará por
// el adaptador de la base de datos real.
import { ErrorDatos, CODIGOS } from './errores.js';
import {
  validarNombreProducto, errorNombreDuplicado, normalizarConsulta, filtrarYOrdenar, paginar,
  mensajeUnidadBase, lanzarSiHayCampos,
} from './productos.js';
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
import { Decimal } from '../../compartido/utilidades/decimales.js';

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

export function crearAdaptadorDemo({ almacen = crearAlmacen(), retardoMs = 150 } = {}) {
  const oyentes = new Set();
  const avisar = (usuario) => oyentes.forEach((cb) => cb(usuario));

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
  };
}
