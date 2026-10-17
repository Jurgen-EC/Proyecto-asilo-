import { useAutenticacion } from '../autenticacion/ContextoAutenticacion.jsx';

// Acceso a la capa de datos desde cualquier componente (adaptador activo: demo o real).
// Las pantallas usan SIEMPRE esto, nunca importan un adaptador concreto.
export function useDatos() {
  return useAutenticacion().datos;
}
