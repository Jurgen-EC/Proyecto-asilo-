# ESTADO DE VERSIÓN 2

> **Resumen honesto:** la V2 está **construida y probada en modo demostración**, pero **NO cumple la definición de terminado del plan** (punto 1: "conectados a la base de datos real"), porque la V1 quedó sin base de datos definida. Los productos viven en `sessionStorage` del navegador y **se pierden al cerrar la pestaña**. Al conectar la base real, solo hay que escribir su adaptador y pasar las pruebas de contrato (ver "Guía para el adaptador real").

## Versión completada
- Versión 2: Catálogo de productos, octubre de 2026. Estado: **parcial (demo)**.
- Se construyó sobre la V1 tal como la dejó el equipo; ver `docs/ESTADO_V1.md`.

## Stack vigente
- **Base de datos / alojamiento:** NO definidos (pendiente ADR-001). Datos en el adaptador de demostración (`sessionStorage`), rotulado con el banner "MODO DEMOSTRACIÓN".
- **Bibliotecas:** React 18.3, react-router-dom 6, Vite 5, decimal.js 10, Vitest 2 + Testing Library + jsdom. No se agregó ninguna biblioteca nueva en la V2 (sin React Hook Form ni Zod: el formulario tiene un solo campo y las reglas viven en la capa de datos).
- **Comandos:** `npm install` · `npm run dev` · `npm test` (`vitest run`) · `npm run build`.
- **Configuración de pruebas:** globales de Vitest, jsdom y `src/pruebas/configuracion.js` (definidos en `vite.config.js`).

## Requerimientos
| Requerimiento | Estado |
| --- | --- |
| RF-001 Registrar productos | Implementado y probado en demo |
| RF-002 Editar productos | Implementado y probado en demo |
| RF-003 Consultar un producto | Implementado y probado en demo |
| RF-004 Buscador integrado (sin mayúsculas ni tildes, mientras se escribe) | Implementado y probado en demo |
| RNF-84 Consulta ágil | Parcial: no se puede medir sin base real |
| RNF-88 Incorporar productos sin cambios estructurales | Cumplido (un producto nuevo es una fila nueva) |
- **Bloqueado:** la verificación contra base real (todas las pruebas de aceptación "conectado a la base real").

## Archivos
**Nuevos**
- `src/nucleo/datos/productos.js` — reglas de negocio puras del catálogo
- `src/nucleo/datos/useDatos.js` — hook de acceso a la capa de datos
- `src/compartido/utilidades/texto.js` — normalización de nombres y búsqueda
- `src/compartido/utilidades/useValorConRetardo.js` — retardo para buscar mientras se escribe
- `src/compartido/componentes/SelectorDeProducto.jsx` — selector reutilizable
- `src/modulos/productos/ModuloProductos.jsx`, `PaginaListaProductos.jsx`, `PaginaFormularioProducto.jsx`, `PaginaDetalleProducto.jsx`
- `src/pruebas/productos.test.jsx`
- `docs/ESTADO_V2.md`

**Modificados**
- `src/nucleo/datos/contrato.js` (sección `productos` requerida), `adaptadorDemo.js` (implementación demo), `errores.js` (código `NOMBRE_DUPLICADO` y `campos` por campo), `pruebasDeContrato.js` (pruebas de productos para cualquier adaptador)
- `src/nucleo/autenticacion/ContextoAutenticacion.jsx` (el contexto ahora también expone `datos`)
- `src/nucleo/modulos.js` (Productos pasa a `disponible`), `src/App.jsx` (ruta `productos/*`), `src/modulos/inicio/PaginaInicio.jsx` (las tarjetas de módulos disponibles son enlaces)
- `src/estilos.css` (tabla, formularios, selector, ficha), `src/pruebas/utilidades.test.js`
- `docs/CONTRATO_DATOS.md` (sección 2.2 `productos`, código `NOMBRE_DUPLICADO`, `campos`) y `docs/GUIA_CONEXION_BASE_DE_DATOS.md` (tarea BD-6)

## Modelo de datos
Entidad **Producto** (campos en camelCase en el código; la base real puede usar snake_case):

| Campo | Detalle |
| --- | --- |
| `id` | Identificador estable, nunca cambia |
| `nombre` | Texto limpio (sin espacios sobrantes), 2 a 120 caracteres |
| `nombreNormalizado` | Minúsculas, sin tildes, espacios colapsados, **único** |
| `activo` | Verdadero o falso |
| `unidadBaseId` | `null` por ahora; sin llave foránea hasta la V3 |
| `creadoEn`, `actualizadoEn` | Fechas ISO asignadas por la capa de datos |
| `creadoPor` | Id del usuario con sesión |

No hay migraciones: no existe base real. Almacenamiento demo: clave `inventario.demo.productos` en `sessionStorage`.

## Funciones y componentes clave
- `datos.productos.{crearProducto, editarProducto, obtenerProducto, listarProductos, cambiarEstadoProducto}` — contrato en `nucleo/datos/contrato.js`. Todas exigen sesión (`SIN_SESION`).
- `validarNombreProducto`, `errorNombreDuplicado`, `normalizarConsulta`, `filtrarYOrdenar`, `paginar` (`nucleo/datos/productos.js`) — reglas reutilizables por cualquier adaptador.
- `normalizarNombre` / `normalizarBusqueda` / `limpiarEspacios` (`compartido/utilidades/texto.js`).
- `useDatos()` — obtiene el adaptador activo; las pantallas nunca importan un adaptador concreto.
- `SelectorDeProducto` (`compartido/componentes/`) — props `valor` (producto o null), `onChange(producto | null)`, `etiqueta`, `error`. Solo productos activos, con buscador y manejo por teclado. **Lo usan todas las versiones siguientes.**
- Rutas: `/productos`, `/productos/nuevo`, `/productos/:id`, `/productos/:id/editar`. El estado de la lista (búsqueda, filtro, página) vive en la dirección (`?q=&estado=&pagina=`).

## Reglas aplicadas
- Nombre obligatorio, de 2 a 120 caracteres, sin espacios sobrantes (se recortan y colapsan).
- Sin nombres duplicados por comparación normalizada («Papa» = « papa » = «PAPA» = «Pápa»). Si el duplicado es un producto **inactivo**, el mensaje lo indica.
- Nunca se elimina: el contrato no ofrece borrado. Se desactiva y sigue consultable.
- Un inactivo no aparece en `SelectorDeProducto`, pero sí en la lista (filtros Inactivos y Todos).
- Editar el nombre conserva el id. Se puede cambiar solo mayúsculas o tildes del mismo producto.
- Las validaciones se ejecutan en la capa de datos; el formulario solo muestra sus mensajes.
- Fechas de creación y modificación las asigna la capa de datos.
- Buscador: sin mayúsculas ni tildes, todas las palabras deben aparecer (en cualquier orden), resultados mientras se escribe (250 ms), mensaje claro sin resultados.
- Desactivar pide confirmación; activar es inmediato.

## Pruebas
`npm test` → **55 pruebas, todas pasan** (4 archivos), y `vite build` compila.
- `adaptadorDemo.test.js` (23): contrato de autenticación (6) + contrato de productos (15: sesión obligatoria, sin borrado, creación, validaciones, duplicados incluido inactivo, edición con mismo id, NO_ENCONTRADO, activar/desactivar y filtros, búsqueda sin tildes, orden y paginación) + selección de adaptador (2).
- `productos.test.jsx` (13): acceso y menú, estado vacío, búsqueda «azucar» → Azúcar, sin resultados, paginación 1–20 de 25, crear y ver en detalle y lista, «Papa» luego « papa » rechazado, validaciones junto al campo, editar conserva id, producto inexistente, desactivar con confirmación → Inactivos → reactivar, `SelectorDeProducto` con ratón y teclado.
- `utilidades.test.js` (12) y `aplicacion.test.jsx` (7): V1 sin cambios en su comportamiento, más 4 pruebas nuevas de normalización.
- **No probado:** nada contra una base real; no se revisó la interfaz en un navegador real ni en el celular.

## Permisos requeridos (para la V18)
`productos.ver`, `productos.crear`, `productos.editar`, `productos.desactivar`. **No se aplican todavía**: todo usuario autenticado tiene acceso completo (temporal).

## Decisiones provisionales (PROVISIONAL)
- Nombres de las operaciones: se usaron los del Plan (`crearProducto`, `listarProductos`, …) en vez de los previstos en `CONTRATO_DATOS.md` (`crear`, `listar`, …). El contrato se actualizó (sección 2.2). Si el equipo prefiere los cortos, es un cambio de nombres en contrato, adaptador, pantallas y pruebas.
- La **ñ es una letra propia** para la unicidad (piña ≠ pina), pero el buscador las trata igual. Confirmar con el hogar.
- Un nombre de producto **inactivo no se puede reutilizar**: hay que reactivarlo.
- Tamaño de página: 20 productos (máximo 100).
- Los datos demo viven en `sessionStorage` (se pierden al cerrar la pestaña) y empiezan vacíos: no hay productos de ejemplo.
- `unidadBaseId` es una columna nula sin llave foránea; la V3 agrega la restricción.

## Pendientes para el hogar
- Campos adicionales del producto (categoría, código, etc.): **no se agregaron** hasta que el hogar los confirme.
- Confirmar el criterio de la ñ y de nombres de productos inactivos.

## Deuda técnica
1. **Base de datos real (bloqueante):** decidir (ADR-001 en `docs/decisiones/`), provisionar, conectar, migrar usuarios y productos, y escribir su adaptador. Sin esto la V1 y la V2 no cumplen su definición de terminado.
2. Siguen pendientes de la V1 las tareas BD-1 a BD-5 de `docs/GUIA_CONEXION_BASE_DE_DATOS.md` (ADR-001 está en estado PENDIENTE DE DECISIÓN); la V2 añade BD-6 (tabla y adaptador de productos).
3. Permisos no aplicados (V18). Sin clave de idempotencia (no hace falta para productos: el nombre único evita el duplicado).
4. La lista no tiene acciones rápidas por fila (activar/desactivar solo desde el detalle).
5. La interfaz no se revisó en un navegador real; solo pruebas automáticas.

## Guía para el adaptador real (productos)
- Restricción de **unicidad sobre `nombre_normalizado`**; calcularlo con `normalizarNombre` (o replicar la regla en la base).
- Longitud 2–120 y estado en la base; `creado_en` y `actualizado_en` los asigna la base; `creado_por` sale de la sesión.
- Búsqueda: conviene una columna de búsqueda normalizada con `normalizarBusqueda`; orden por `nombre_normalizado` con colación en español.
- Mapear errores a `ErrorDatos`: `VALIDACION` (con `campos.nombre`), `NOMBRE_DUPLICADO` (usar `errorNombreDuplicado`), `NO_ENCONTRADO`, `SIN_SESION`.
- Pasar `ejecutarPruebasDeContrato` contra la base de pruebas.

## Siguiente versión
**V3: Unidades, presentaciones y conversiones.** Advertencias: añadir la sección `unidades` al contrato y a `pruebasDeContrato.js`; agregar la llave foránea de `unidadBaseId`; la unidad base obligatoria por producto es decisión provisional del plan. Antes de empezar, idealmente conectar la base real.
