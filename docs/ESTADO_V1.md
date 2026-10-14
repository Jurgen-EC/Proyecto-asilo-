# ESTADO DE VERSIÓN 1

**Versión completada:** 1 — Base del sistema (con base de datos NO definida por decisión del equipo). Octubre de 2026.

## Stack vigente
- Interfaz: React 18 + Vite 5 + React Router 6. Decimales: decimal.js. Pruebas: Vitest + Testing Library.
- Base de datos: **NO DEFINIDA**. Se usa el adaptador `demo` (sesión en sessionStorage, un usuario ficticio).
- Alojamiento: no definido.
- Comandos: `npm install`, `npm run dev`, `npm test`, `npm run build`.

## Requerimientos
- Implementado y probado: estructura base que habilita RNF-089 y RNF-090 (arquitectura por módulos y capa de datos con contrato).
- Parcial: inicio de sesión **de demostración** (no real).
- Pendiente: tareas BD-1 a BD-5 (`docs/GUIA_CONEXION_BASE_DE_DATOS.md`).

## Archivos creados (rutas principales)
- `src/nucleo/datos/` (contrato.js, errores.js, adaptadorDemo.js, index.js, pruebasDeContrato.js)
- `src/nucleo/autenticacion/` (ContextoAutenticacion.jsx, RutaProtegida.jsx), `src/nucleo/modulos.js`
- `src/compartido/componentes/` (Layout, Notificaciones, DialogoConfirmacion, Cargando, EstadoVacio, LimiteDeError, BannerDemo)
- `src/compartido/utilidades/` (decimales.js, formato.js)
- `src/modulos/` (inicio, autenticacion, NoEncontrado), `src/App.jsx`, `src/main.jsx`, `src/estilos.css`
- `src/pruebas/` (23 pruebas), `docs/` (contrato, modelo planificado, guía de conexión, ADR-001)

## Modelo de datos
Ninguna tabla creada. El modelo previsto está en `docs/MODELO_DE_DATOS_PLANIFICADO.md`.

## Funciones y componentes clave
- `datos` (src/nucleo/datos/index.js): único punto de acceso a datos. `crearDatos(nombre)` elige el adaptador.
- `validarAdaptador`, `ejecutarPruebasDeContrato`: verifican cualquier adaptador nuevo.
- `ProveedorAutenticacion` / `useAutenticacion`, `RutaProtegida`.
- `useNotificaciones()` (`exito`, `error`, `info`), `DialogoConfirmacion`, `Cargando`, `EstadoVacio`.
- `decimales.js` (sumar, restar, multiplicar, dividir, redondear, comparar), `formato.js` (fecha, fecha y hora, dinero, cantidad).

## Reglas aplicadas
Decimales exactos; fechas en hora de Costa Rica; texto en español; las pantallas no acceden a la base directamente; módulos futuros deshabilitados con "Próximamente".

## Pruebas
23 pruebas automáticas pasando (contrato del adaptador, rutas protegidas, inicio y cierre de sesión, 404, diálogo, decimales, formato). `npm run build` exitoso. No se probó contra una base real (no existe).

## Permisos requeridos
Ninguno todavía. Todo usuario autenticado tiene acceso completo (temporal hasta la Versión 18).

## Decisiones provisionales (PROVISIONAL)
- Moneda: colones costarricenses (₡), a confirmar con el hogar.
- 4 decimales para cantidades y 2 para dinero; redondeo half-up (regla pendiente).

## Pendientes para el hogar / el equipo
- Elegir la base de datos y alojamiento (ADR-001).
- Confirmar moneda y regla de redondeo.

## Deuda técnica
- Login real y conexión a base (BD-1 a BD-5), estimados en 4,5 horas.
- Avisos de "future flags" de React Router 6 en las pruebas (sin impacto funcional).

## Siguiente versión
Versión 2 (catálogo de productos). Aviso: como no hay base, el módulo de productos debe agregar su sección `productos` al contrato y, mientras no haya base, necesitará un adaptador demo en memoria para poder probarse; o conviene resolver BD-1 a BD-5 antes.
