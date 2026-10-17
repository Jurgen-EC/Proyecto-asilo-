// ADAPTADOR DE DEMOSTRACIÓN
// Sirve solo para que el sistema funcione sin base de datos. NO guarda nada
// real: la sesión y los productos viven en la memoria del navegador (sessionStorage,
// se pierden al cerrar la pestaña) y el único usuario es ficticio. Se reemplazará por
// el adaptador de la base de datos real.
import { ErrorDatos, CODIGOS } from './errores.js';
import {
  validarNombreProducto, errorNombreDuplicado, normalizarConsulta, filtrarYOrdenar, paginar,
} from './productos.js';

export const USUARIO_DEMO = Object.freeze({
  id: 'demo-1',
  correo: 'demo@hogar.local',
  nombre: 'Usuario de demostración',
});
export const CLAVE_DEMO = 'demo1234';
const LLAVE_SESION = 'inventario.demo.sesion';
const LLAVE_PRODUCTOS = 'inventario.demo.productos';

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
      async crearProducto({ nombre } = {}) {
        await esperar(retardoMs);
        const usuario = exigirSesion();
        const { nombre: limpio, nombreNormalizado } = validarNombreProducto(nombre);
        const lista = leerProductos();
        const repetido = lista.find((p) => p.nombreNormalizado === nombreNormalizado);
        if (repetido) throw errorNombreDuplicado(repetido);
        const ahora = new Date().toISOString(); // la hora la asigna la capa de datos, no la interfaz
        const producto = {
          id: generarId(), nombre: limpio, nombreNormalizado, activo: true,
          unidadBaseId: null, // se completa en la Versión 3
          creadoEn: ahora, actualizadoEn: ahora, creadoPor: usuario.id,
        };
        guardarProductos([...lista, producto]);
        return { ...producto };
      },
      async editarProducto(id, { nombre } = {}) {
        await esperar(retardoMs);
        exigirSesion();
        const lista = leerProductos();
        const actual = exigirProducto(lista, id);
        const { nombre: limpio, nombreNormalizado } = validarNombreProducto(nombre);
        const repetido = lista.find((p) => p.id !== id && p.nombreNormalizado === nombreNormalizado);
        if (repetido) throw errorNombreDuplicado(repetido);
        const editado = { ...actual, nombre: limpio, nombreNormalizado, actualizadoEn: new Date().toISOString() };
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
        const { busqueda, estado, pagina, tamanoPagina } = normalizarConsulta(consulta);
        const resultado = paginar(filtrarYOrdenar(leerProductos(), { busqueda, estado }), pagina, tamanoPagina);
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
  };
}
