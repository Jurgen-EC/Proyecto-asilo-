// Errores tipificados de la capa de datos. Toda pantalla debe mostrar un mensaje
// comprensible según el código; nunca el mensaje técnico original.
export const CODIGOS = Object.freeze({
  CREDENCIALES_INVALIDAS: 'CREDENCIALES_INVALIDAS',
  SIN_SESION: 'SIN_SESION',
  VALIDACION: 'VALIDACION',
  NO_ENCONTRADO: 'NO_ENCONTRADO',
  SIN_PERMISO: 'SIN_PERMISO',
  CONEXION: 'CONEXION',
  OPERACION_DUPLICADA: 'OPERACION_DUPLICADA',
  NOMBRE_DUPLICADO: 'NOMBRE_DUPLICADO',
  DESCONOCIDO: 'DESCONOCIDO',
});

export const MENSAJES = Object.freeze({
  CREDENCIALES_INVALIDAS: 'El correo o la contraseña no son correctos.',
  SIN_SESION: 'Tu sesión terminó. Iniciá sesión de nuevo.',
  VALIDACION: 'Hay datos que no son válidos. Revisalos e intentá de nuevo.',
  NO_ENCONTRADO: 'No se encontró lo que buscabas.',
  SIN_PERMISO: 'No tenés permiso para realizar esta acción.',
  CONEXION: 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.',
  OPERACION_DUPLICADA: 'Esta operación ya había sido registrada.',
  NOMBRE_DUPLICADO: 'Ya existe un producto con ese nombre.',
  DESCONOCIDO: 'Ocurrió un error inesperado. Intentá de nuevo.',
});

export class ErrorDatos extends Error {
  // `campos` (opcional): mensajes por campo del formulario, p. ej. { nombre: 'El nombre es obligatorio.' }.
  constructor(codigo, detalle, campos) {
    super(detalle ?? MENSAJES[codigo] ?? MENSAJES.DESCONOCIDO);
    this.name = 'ErrorDatos';
    this.codigo = CODIGOS[codigo] ? codigo : CODIGOS.DESCONOCIDO;
    this.campos = campos ?? null;
  }
  /** Mensaje seguro para mostrar al usuario final. */
  get mensajeUsuario() {
    return MENSAJES[this.codigo] ?? MENSAJES.DESCONOCIDO;
  }
}

export function mensajeParaUsuario(error) {
  return error instanceof ErrorDatos ? error.mensajeUsuario : MENSAJES.DESCONOCIDO;
}
