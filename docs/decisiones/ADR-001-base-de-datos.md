# ADR-001: Base de datos del sistema

**Estado:** PENDIENTE DE DECISIÓN (el equipo decidió dejarla abierta en la Versión 1).
**Fecha:** octubre de 2026

## Contexto
El sistema debe garantizar que las existencias sean correctas y trazables. Por eso la
base de datos no es un simple almacén: debe sostener reglas críticas (ver `docs/CONTRATO_DATOS.md`).

## Requisitos que cualquier opción debe cumplir
1. **Transacciones atómicas:** registrar un movimiento y actualizar la existencia ocurre todo o nada.
2. **Restricciones de integridad:** unicidad (nombres normalizados, claves de idempotencia), llaves foráneas, valores válidos.
3. **Decimales exactos** para cantidades (4 decimales) y dinero (2 decimales). Sin flotantes.
4. **Concurrencia segura:** dos salidas simultáneas del mismo producto no pueden dejar existencia negativa.
5. **Inmutabilidad de movimientos:** sin modificar ni borrar movimientos (se corrigen con movimientos nuevos).
6. **Validación y permisos en la capa confiable** (base o servidor), no solo en la interfaz.
7. **Autenticación** de usuarios y registro del usuario responsable de cada operación.
8. **Respaldo y recuperación** probables y documentables.
9. **Hora del servidor** para fecha y hora de movimientos.
10. **Consulta ágil** de productos, existencias e historial (decenas de miles de movimientos).

## Opciones consideradas (sin decisión)
| Opción | A favor | A tener en cuenta |
|---|---|---|
| Supabase (PostgreSQL) | Transacciones y restricciones nativas, decimales exactos, autenticación incluida, reglas de acceso a nivel de fila, plan gratuito para empezar | Dependencia de un proveedor; hay que aprender sus reglas de seguridad |
| Node.js + PostgreSQL propio | Control total, sin proveedor de plataforma | Hay que construir y mantener autenticación, servidor y despliegue |
| Firebase (Firestore) | Autenticación y alojamiento simples, tiempo real | Transacciones y consultas de reportes más limitadas; sin decimales exactos nativos; más trabajo para garantizar consistencia |

## Preguntas por resolver antes de decidir
- ¿Quién administrará la base y el respaldo después del TCU?
- ¿Hay presupuesto o un plan gratuito es suficiente?
- ¿El hogar tiene conexión estable a internet en la cocina?
- ¿Hay alguna restricción institucional sobre dónde se alojan los datos?
- ¿Qué tan grande se espera que sea el volumen de movimientos por mes?

## Decisión
_(Pendiente. Al decidir, completar aquí la opción elegida, el motivo y la fecha, y seguir
`docs/GUIA_CONEXION_BASE_DE_DATOS.md`.)_
