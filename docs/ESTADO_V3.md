# ESTADO DE VERSIÓN 3

> **Resumen honesto:** la V3 está **construida y probada en modo demostración**, pero **NO cumple la definición de terminado del plan** (punto 1: «conectados a la base de datos real»), porque la base de datos sigue sin definirse (ADR-001 pendiente). Unidades, presentaciones y conversiones viven en `sessionStorage` y **se pierden al cerrar la pestaña**. Al conectar la base real solo hay que escribir su adaptador y pasar las pruebas de contrato.

## Versión completada
- Versión 3: Unidades de medida, presentaciones y conversiones, octubre de 2026. Estado: **parcial (demo)**.
- Se construyó sobre la V2 tal como la dejó el equipo (`docs/ESTADO_V2.md`).

## Stack vigente
- **Base de datos / alojamiento:** NO definidos. Adaptador de demostración (`sessionStorage`) con banner «MODO DEMOSTRACIÓN».
- **Bibliotecas:** sin cambios (React 18.3, react-router-dom 6, Vite 5, decimal.js 10, Vitest 2 + Testing Library + jsdom). No se agregó ninguna.
- **Comandos:** `npm install` · `npm run dev` · `npm test` · `npm run build`.

## Requerimientos
| Requerimiento | Estado |
| --- | --- |
| RF-005 Registrar unidades de medida | Implementado y probado en demo |
| RF-006 Registrar presentaciones de un producto | Implementado y probado en demo |
| RF-007 Configurar conversiones entre unidades | Implementado y probado en demo |
| RNF-86 Cantidades claras (unidad junto a cada cantidad) | Parcial: aplicado en lo construido (unidades, presentaciones, conversiones); se completa con las pantallas de movimientos (V4 en adelante) |
| RNF-87 Manejo correcto de unidades y conversiones | Implementado en la función `convertir` y probado; la verificación final con movimientos es de la V19 |
| RNF-88 Incorporar productos sin cambios estructurales | Cumplido (un producto, unidad o presentación nueva es una fila nueva) |
- **Bloqueado:** la verificación contra base real (todas las pruebas de aceptación «conectado a la base real»).

## Archivos
**Nuevos**
- `src/nucleo/datos/unidades.js`, `presentaciones.js`, `conversiones.js` — reglas de negocio puras y función de conversión
- `src/compartido/componentes/Pestanas.jsx`
- `src/modulos/unidades/PaginaUnidades.jsx`, `GestorConversiones.jsx`
- `src/modulos/productos/PestanaPresentaciones.jsx`, `PestanaConversiones.jsx`
- `src/pruebas/unidades.test.jsx`, `presentaciones.test.jsx`, `conversiones.test.jsx`, `productosIncompletos.test.jsx`
- `docs/ESTADO_V3.md`

**Modificados**
- `src/nucleo/datos/contrato.js` (secciones `unidades`, `presentaciones`, `conversiones`), `adaptadorDemo.js`, `errores.js` (códigos `CONVERSION_NO_CONFIGURADA`, `UNIDAD_INCOMPATIBLE` y clase `ConversionNoConfigurada`), `productos.js` (unidad base, `soloCompletos`), `pruebasDeContrato.js`
- `src/compartido/utilidades/decimales.js` (`leerDecimal`, `decimalesDe`), `src/compartido/componentes/SelectorDeProducto.jsx` (solo productos completos)
- `src/modulos/productos/PaginaFormularioProducto.jsx` (campo Unidad base), `PaginaDetalleProducto.jsx` (pestañas), `PaginaListaProductos.jsx` (columna Unidad base)
- `src/nucleo/modulos.js` (Unidades y conversiones: disponible), `src/App.jsx` (ruta `unidades`), `src/estilos.css`
- `src/pruebas/productos.test.jsx`, `adaptadorDemo.test.js` (ajustadas: el producto ahora exige unidad base)
- `docs/CONTRATO_DATOS.md` (secciones 2.3 a 2.5), `docs/MODELO_DE_DATOS_PLANIFICADO.md`, `docs/GUIA_CONEXION_BASE_DE_DATOS.md`, `README.md`

## Modelo de datos
Sin migraciones (no hay base real). Estructura que debe crear la base real (campos en camelCase en el código; la base puede usar snake_case):

| Entidad | Campos |
| --- | --- |
| `unidades` | `id`, `nombre`, `abreviatura`, `dimension` (`masa`\|`volumen`\|`conteo`), `activo`, `sugerida`, `nombreNormalizado` (único), `abreviaturaNormalizada` (único), `creadoEn`, `actualizadoEn`, `creadoPor` |
| `presentaciones` | `id`, `productoId`, `nombre`, `nombreNormalizado` (único por producto), `unidadId`, `cantidadContenida` decimal(14,4) > 0, `activo`, fechas, `creadoPor` |
| `conversiones` | `id`, `productoId` (nulo = general), `unidadOrigenId`, `unidadDestinoId`, `factor` decimal(18,6) > 0, `vigente`, `sugerida`, `reemplazaId`, `reemplazadaPorId`, `creadoEn`, `creadoPor`. Una sola vigente por par de unidades (cualquier sentido) y alcance |
| `productos` | `unidadBaseId` pasa a ser **obligatoria** al crear (llave foránea a `unidades`; nula = producto INCOMPLETO heredado de la V2) |

Datos iniciales sugeridos (migración): unidades Kilogramo, Gramo, Litro, Mililitro, Unidad; conversiones generales kg → g = 1000 y l → ml = 1000. Almacenamiento demo: claves `inventario.demo.unidades`, `.presentaciones`, `.conversiones` en `sessionStorage`.

## Funciones y componentes clave
- `datos.unidades.*`, `datos.presentaciones.*`, `datos.conversiones.*` — contrato en `nucleo/datos/contrato.js` y `docs/CONTRATO_DATOS.md` (2.3 a 2.5).
- **`datos.conversiones.convertir(productoId, cantidad, origen, destino)`** — la función central de conversión; usa `convertirCantidad` (`nucleo/datos/conversiones.js`), pura y reutilizable por cualquier adaptador. `origen`/`destino`: id de unidad o `{presentacionId}`. **La usarán la V4 (`registrarMovimiento`), la V5, la V6, la V11, la V14 y la V15.**
- `validarUnidad`, `validarPresentacion`, `validarConversion`, `leerFactor`, `buscarEquivalencia`, `leerDecimal`.
- `Pestanas` (barra de pestañas accesible), `GestorConversiones` (equivalencias generales o de un producto).
- `SelectorDeProducto` ahora solo ofrece productos **completos** (con unidad base). Rutas nuevas: `/unidades`; el detalle del producto tiene pestañas (`?pestana=presentaciones|conversiones`).

## Reglas aplicadas
- Toda cantidad lleva su unidad; nunca se mezclan unidades sin una equivalencia configurada.
- **Nunca se asume una equivalencia:** sin conversión, `ConversionNoConfigurada` (misma dimensión) o `UNIDAD_INCOMPATIBLE` (dimensiones distintas, p. ej. litros a kilogramos). Cruzar dimensiones solo se permite con una equivalencia configurada **para ese producto**.
- No se asume que todas las cajas contienen lo mismo: la presentación es de cada producto.
- Una equivalencia vale en los dos sentidos (inversa = 1 / factor, exacta). No se aceptan duplicadas ni circulares.
- El factor no se edita: cambiarlo crea una versión nueva y la anterior queda no vigente (no se reescribe lo anterior).
- Decimales exactos (decimal.js); factores hasta 6 decimales, cantidades hasta 4; coma o punto al escribir.
- Nada se borra: unidades, presentaciones y conversiones se desactivan o retiran.
- Una unidad usada por un producto, una presentación o una equivalencia no cambia de dimensión.
- Unidad inactiva: sigue siendo válida para lo que ya la usa, pero no se ofrece para configuraciones nuevas.
- Producto sin unidad base = **INCOMPLETO**: no se usa en operaciones (ni aparece en `SelectorDeProducto`) hasta completarla.
- Validaciones en la capa de datos; los formularios solo muestran sus mensajes (todos a la vez, junto a cada campo).

## Pruebas
`npm test` → **144 pruebas, todas pasan** (8 archivos) y `vite build` compila.
- `adaptadorDemo.test.js` (79): contrato de autenticación, productos (con unidad base), unidades, unidad base del producto, presentaciones, conversiones y `convertir`, más productos heredados de la V2 y selección de adaptador.
- `unidades.test.jsx` (9), `presentaciones.test.jsx` (10), `conversiones.test.jsx` (11), `productosIncompletos.test.jsx` (3): pantallas, pestañas, validaciones, desactivar con confirmación, `convertirCantidad`.
- `productos.test.jsx` (13), `aplicacion.test.jsx` (7), `utilidades.test.js` (12): V1 y V2; **las de productos se ajustaron** porque ahora el producto exige unidad base.
- Casos de aceptación del plan cubiertos: Caja de 12 unidades × 3 = 36 unidades; 1,5 kg = 1500 g; convertir sin equivalencia → `ConversionNoConfigurada`; litros a kilogramos sin equivalencia → rechazado; cambiar un factor crea versión nueva y deja la anterior no vigente.
- **No probado:** nada contra una base real; no se revisó la interfaz en un navegador real ni en tablet. Las pruebas pueden mostrar avisos de `act(...)` ocasionales (sin impacto funcional) además de los de React Router de la V1.

## Permisos requeridos (para la V18)
`unidades.ver`, `unidades.administrar`, `presentaciones.administrar`, `conversiones.administrar` (más `productos.editar` para completar la unidad base). **No se aplican todavía**: todo usuario autenticado tiene acceso completo (temporal).

## Decisiones provisionales (PROVISIONAL)
- Unidades sugeridas (kg, g, l, ml, u) y conversiones generales sugeridas (kg↔g, l↔ml): el hogar puede cambiarlas.
- Unidad base **obligatoria** por producto; fracciones permitidas hasta 4 decimales; factores hasta 6.
- **Todo cambio de factor crea una versión nueva**, aunque la anterior no se haya usado (la V4 podrá afinarlo cuando existan movimientos).
- Una conversión general solo entre unidades de la misma dimensión; cruzar dimensiones solo por producto.
- Solo conversión directa (una fila) más el paso por la presentación; no se encadenan equivalencias.
- Redondeo half-up a 4 decimales en `convertir` (regla de redondeo pendiente: constante única en `decimales.js`).
- Nombre de unidad único y **abreviatura única** (comparación sin mayúsculas ni tildes); nombre de presentación único por producto, incluyendo inactivas.
- La unidad base de un producto se puede cambiar mientras no existan movimientos (hoy no existen). **La V4 debe bloquear el cambio cuando el producto ya tenga movimientos.**
- Nombres de operaciones en español largo (`crearUnidad`, `crearPresentacion`, `crearConversion`), como en la V2.

## Pendientes para el hogar
- Unidad base de cada producto real, si se usan fracciones y cómo se representan los productos por peso, volumen o unidad.
- Equivalencias reales de sus presentaciones (cuánto trae cada caja, bolsa o saco de cada producto) y las equivalencias propias que necesiten (peso ↔ volumen).
- Regla de redondeo definitiva.
- Si se necesitan unidades adicionales a las cinco sugeridas.

## Deuda técnica
1. **Base de datos real (bloqueante):** ADR-001, provisionar, conectar y escribir el adaptador con `unidades`, `presentaciones` y `conversiones` (tarea BD-7 de `docs/GUIA_CONEXION_BASE_DE_DATOS.md`). Siguen pendientes BD-1 a BD-6.
2. En la base real, `convertir` debe leer las tres tablas de forma consistente (misma transacción o lectura coherente) cuando lo llame `registrarMovimiento` (V4).
3. Permisos no aplicados (V18).
4. Sin vista del historial de equivalencias por producto más allá de la casilla «Ver versiones anteriores y retiradas».
5. La interfaz no se revisó en un navegador real; solo pruebas automáticas.
6. Avisos de `act(...)` ocasionales en las pruebas de pantalla.

## Siguiente versión
**V4: Núcleo de movimientos y existencias.** Advertencias: `registrarMovimiento` debe llamar a `datos.conversiones.convertir` y guardar `conversionId`, el `factor` aplicado y la unidad original en cada movimiento; usar solo productos completos (`soloCompletos`); bloquear el cambio de unidad base de un producto con movimientos; agregar la sección `inventario` al contrato y a `pruebasDeContrato.js`. Antes de empezar, idealmente conectar la base real (la atomicidad y la concurrencia no se pueden probar de verdad en el adaptador demo).
