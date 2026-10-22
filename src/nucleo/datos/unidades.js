// REGLAS DE NEGOCIO DE LAS UNIDADES DE MEDIDA (Versión 3)
// Funciones puras, sin acceso a datos. Las usa el adaptador de demostración y las debe
// reutilizar (o replicar en la base: unicidad sobre nombre_normalizado y abreviatura_normalizada)
// cualquier adaptador real. La validación vive en la capa de datos, no solo en el formulario.
import { ErrorDatos, CODIGOS } from './errores.js';
import { limpiarEspacios, normalizarNombre } from '../../compartido/utilidades/texto.js';

export const DIMENSIONES = Object.freeze(['masa', 'volumen', 'conteo']);
export const ETIQUETA_DIMENSION = Object.freeze({
  masa: 'Masa (peso)',
  volumen: 'Volumen',
  conteo: 'Conteo (por unidad)',
});
export const ESTADOS_UNIDAD = Object.freeze(['activas', 'inactivas', 'todas']);
export const NOMBRE_UNIDAD_MIN = 2;
export const NOMBRE_UNIDAD_MAX = 40;
export const ABREVIATURA_MAX = 10;

// Datos iniciales SUGERIDOS (el hogar puede editarlos o desactivarlos). PROVISIONAL.
export const UNIDADES_SUGERIDAS = Object.freeze([
  { clave: 'kg', nombre: 'Kilogramo', abreviatura: 'kg', dimension: 'masa' },
  { clave: 'g', nombre: 'Gramo', abreviatura: 'g', dimension: 'masa' },
  { clave: 'l', nombre: 'Litro', abreviatura: 'l', dimension: 'volumen' },
  { clave: 'ml', nombre: 'Mililitro', abreviatura: 'ml', dimension: 'volumen' },
  { clave: 'u', nombre: 'Unidad', abreviatura: 'u', dimension: 'conteo' },
]);

// Conversiones GENERALES (sirven para todos los productos), dentro de la misma dimensión.
// Se guardan como filas explícitas: 1 origen = factor destino. La inversa se deduce (ver conversiones.js).
export const CONVERSIONES_GENERALES_SUGERIDAS = Object.freeze([
  { origen: 'kg', destino: 'g', factor: '1000' },
  { origen: 'l', destino: 'ml', factor: '1000' },
]);

/** Valida y limpia los datos de una unidad. Lanza VALIDACION con { campos } por campo. */
export function validarUnidad({ nombre, abreviatura, dimension } = {}) {
  const nombreLimpio = limpiarEspacios(typeof nombre === 'string' ? nombre : '');
  const abreviaturaLimpia = limpiarEspacios(typeof abreviatura === 'string' ? abreviatura : '');
  const campos = {};
  if (!nombreLimpio) campos.nombre = 'El nombre es obligatorio.';
  else if (nombreLimpio.length < NOMBRE_UNIDAD_MIN) campos.nombre = `El nombre debe tener al menos ${NOMBRE_UNIDAD_MIN} caracteres.`;
  else if (nombreLimpio.length > NOMBRE_UNIDAD_MAX) campos.nombre = `El nombre no puede tener más de ${NOMBRE_UNIDAD_MAX} caracteres.`;
  if (!abreviaturaLimpia) campos.abreviatura = 'La abreviatura es obligatoria.';
  else if (abreviaturaLimpia.length > ABREVIATURA_MAX) campos.abreviatura = `La abreviatura no puede tener más de ${ABREVIATURA_MAX} caracteres.`;
  if (!DIMENSIONES.includes(dimension)) campos.dimension = 'Elegí si la unidad mide masa, volumen o conteo.';
  const primero = Object.values(campos)[0];
  if (primero) throw new ErrorDatos(CODIGOS.VALIDACION, primero, campos);
  return {
    nombre: nombreLimpio,
    abreviatura: abreviaturaLimpia,
    dimension,
    nombreNormalizado: normalizarNombre(nombreLimpio),
    abreviaturaNormalizada: normalizarNombre(abreviaturaLimpia),
  };
}

/** Busca otra unidad con el mismo nombre o abreviatura (comparación normalizada). */
export function detectarUnidadDuplicada(unidades, { nombreNormalizado, abreviaturaNormalizada }, idExcluido = null) {
  for (const u of unidades) {
    if (u.id === idExcluido) continue;
    if (u.nombreNormalizado === nombreNormalizado) return { campo: 'nombre', existente: u };
    if (u.abreviaturaNormalizada === abreviaturaNormalizada) return { campo: 'abreviatura', existente: u };
  }
  return null;
}

export function errorUnidadDuplicada({ campo, existente }) {
  const que = campo === 'nombre' ? 'ese nombre' : 'esa abreviatura';
  const mensaje = existente.activo === false
    ? `Ya existe una unidad con ${que}, pero está inactiva. Buscala en las inactivas para volver a activarla.`
    : `Ya existe una unidad con ${que}.`;
  return new ErrorDatos(CODIGOS.VALIDACION, mensaje, { [campo]: mensaje });
}

/** Filtra por estado y ordena por nombre. */
export function filtrarUnidades(unidades, estado = 'activas') {
  const e = ESTADOS_UNIDAD.includes(estado) ? estado : 'activas';
  return unidades
    .filter((u) => e === 'todas' || (e === 'activas' ? u.activo : !u.activo))
    .sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado, 'es'));
}
