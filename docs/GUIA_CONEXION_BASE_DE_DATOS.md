# Guía para conectar la base de datos real

Se usa cuando el equipo decida la base (ver `docs/decisiones/ADR-001-base-de-datos.md`).
Son las tareas que quedaron **pendientes de la Versión 1** (estimación original: 4,5 horas).

## Tareas pendientes (BD)
| Tarea | Detalle | Horas |
|---|---|---|
| BD-1 Decidir | Completar ADR-001 con la opción elegida y el motivo | 1,5 |
| BD-2 Provisionar | Crear el proyecto/instancia de la base, entornos de desarrollo y producción, variables en `.env` (nunca en el código) | 1,5 |
| BD-3 Migración inicial | Crear `perfiles_usuario` (ver `MODELO_DE_DATOS_PLANIFICADO.md`) vinculada a la autenticación | (incluida en BD-2) |
| BD-4 Adaptador real | Escribir `src/nucleo/datos/adaptador<Nombre>.js` con `autenticacion` según `CONTRATO_DATOS.md`; registrarlo en `FABRICAS` de `src/nucleo/datos/index.js`; poner el nombre en `VITE_ADAPTADOR_DATOS` | 1,5 |
| BD-5 Verificar | Pasar `ejecutarPruebasDeContrato` con el adaptador nuevo; confirmar que ya no aparece el banner de demostración | (incluida en BD-4) |

## Pasos
1. Completar ADR-001.
2. Crear la base y la migración inicial de usuarios.
3. Copiar `.env.example` a `.env` y completar las variables de la base (solo claves públicas en `VITE_*`).
4. Crear el adaptador real. Debe traducir los errores de la base a `ErrorDatos` y declarar `esDemo: false`.
5. Registrar el adaptador y activar `VITE_ADAPTADOR_DATOS`.
6. Ejecutar `npm test` y reutilizar `ejecutarPruebasDeContrato` con el adaptador real (apuntando a una base de pruebas).
7. Crear un usuario real de prueba y verificar inicio y cierre de sesión contra la base. Solo entonces se puede afirmar que está conectada.
8. Desde la Versión 4, implementar `registrarMovimiento` dentro de la base (función transaccional o equivalente) según `CONTRATO_DATOS.md`, sección 4.

## Qué NO cambia al conectar la base
Pantallas, rutas, componentes, utilidades y pruebas de interfaz: todo usa `datos`, no la base directamente.
