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
| BD-6 Productos (V2) | Crear la tabla `productos` (ver `MODELO_DE_DATOS_PLANIFICADO.md`) y la sección `productos` del adaptador real (contrato 2.2); pasar las pruebas de contrato de productos | por estimar |
| BD-7 Unidades, presentaciones y conversiones (V3) | Crear las tablas `unidades`, `presentaciones` y `conversiones` y la llave foránea `productos.unidad_base_id`; cargar los datos iniciales sugeridos (kg, g, l, ml, u y kg→g, l→ml); implementar las secciones 2.3 a 2.5 del contrato reutilizando `unidades.js`, `presentaciones.js` y `conversiones.js` (incluida `convertirCantidad`); restricciones: unicidad de nombre y abreviatura normalizados, nombre de presentación único por producto, una conversión vigente por par y alcance, factor > 0; pasar las pruebas de contrato | por estimar |

## Pasos
1. Completar ADR-001.
2. Crear la base y la migración inicial de usuarios.
3. Copiar `.env.example` a `.env` y completar las variables de la base (solo claves públicas en `VITE_*`).
4. Crear el adaptador real. Debe traducir los errores de la base a `ErrorDatos` y declarar `esDemo: false`.
   Desde la Versión 2 también debe implementar la sección `productos` (contrato 2.2): reutilizar `src/nucleo/datos/productos.js`
   (validación, normalización, búsqueda) y apoyarse en una restricción de unicidad sobre `nombre_normalizado`. Hasta entonces los productos
   solo existen en el adaptador demo y se pierden al cerrar la pestaña.
5. Registrar el adaptador y activar `VITE_ADAPTADOR_DATOS`.
6. Ejecutar `npm test` y reutilizar `ejecutarPruebasDeContrato` con el adaptador real (apuntando a una base de pruebas).
7. Crear un usuario real de prueba y verificar inicio y cierre de sesión contra la base. Solo entonces se puede afirmar que está conectada.
8. Desde la Versión 4, implementar `registrarMovimiento` dentro de la base (función transaccional o equivalente) según `CONTRATO_DATOS.md`, sección 4.

## Qué NO cambia al conectar la base
Pantallas, rutas, componentes, utilidades y pruebas de interfaz: todo usa `datos`, no la base directamente.
