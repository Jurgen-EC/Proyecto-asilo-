// Punto único de acceso a los datos. El resto de la aplicación importa `datos`
// desde aquí y nunca un adaptador concreto.
//
// PARA CONECTAR LA BASE DE DATOS REAL (cuando se defina; ver docs/GUIA_CONEXION_BASE_DE_DATOS.md):
//   1. Crear src/nucleo/datos/adaptador<NombreBD>.js que cumpla contrato.js.
//   2. Registrarlo en `FABRICAS` con un nombre nuevo.
//   3. Poner ese nombre en VITE_ADAPTADOR_DATOS.
//   4. Pasar las pruebas de contrato (src/nucleo/datos/pruebasDeContrato.js).
import { crearAdaptadorDemo } from './adaptadorDemo.js';
import { validarAdaptador } from './contrato.js';

const FABRICAS = {
  demo: crearAdaptadorDemo,
  // <nombreBD>: crearAdaptador<NombreBD>,   <-- AQUÍ se registrará el adaptador real
};

export function crearDatos(nombre = import.meta.env?.VITE_ADAPTADOR_DATOS ?? 'demo') {
  const fabrica = FABRICAS[nombre];
  if (!fabrica) {
    const disponibles = Object.keys(FABRICAS).join(', ');
    throw new Error(`Adaptador de datos "${nombre}" no registrado. Disponibles: ${disponibles}.`);
  }
  return validarAdaptador(fabrica());
}

export const datos = crearDatos();
