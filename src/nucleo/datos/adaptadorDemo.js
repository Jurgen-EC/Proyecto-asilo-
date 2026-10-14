// ADAPTADOR DE DEMOSTRACIÓN
// Sirve solo para que la versión 1 funcione sin base de datos. NO guarda nada
// real: la sesión vive en la memoria del navegador (sessionStorage) y el único
// usuario es ficticio. Se reemplazará por el adaptador de la base de datos real.
import { ErrorDatos, CODIGOS } from './errores.js';

export const USUARIO_DEMO = Object.freeze({
  id: 'demo-1',
  correo: 'demo@hogar.local',
  nombre: 'Usuario de demostración',
});
export const CLAVE_DEMO = 'demo1234';
const LLAVE_SESION = 'inventario.demo.sesion';

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

export function crearAdaptadorDemo({ almacen = crearAlmacen(), retardoMs = 150 } = {}) {
  const oyentes = new Set();
  const avisar = (usuario) => oyentes.forEach((cb) => cb(usuario));

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
  };
}
