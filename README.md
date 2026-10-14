# Inventario de Cocina — Hogar de Ancianos Jafeth Jiménez Morales (TCU-797)

Sistema web (React) para el inventario, costos y gestión de insumos de cocina.
Este repositorio contiene la **Versión 1**: base del proyecto, inicio de sesión de
demostración, navegación en español y capa de datos preparada para conectar la
base de datos real cuando se defina.

> **Estado de la base de datos: NO DEFINIDA.** La aplicación corre con un adaptador
> de demostración. No se guarda información real. Ver `docs/decisiones/ADR-001-base-de-datos.md`.

## Requisitos
- Node.js 18 o superior y npm.

## Cómo ejecutarlo
```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # pruebas automáticas
npm run build      # versión de producción en /dist
```
Usuario de demostración: `demo@hogar.local` · Contraseña: `demo1234`

## Estructura
```
src/
  nucleo/
    datos/            Capa de datos: contrato, errores, adaptador demo, pruebas de contrato
    autenticacion/    Contexto de sesión y ruta protegida
    modulos.js        Catálogo de módulos (Próximamente / disponible)
  compartido/
    componentes/      Layout, notificaciones, diálogo de confirmación, carga, estado vacío, límite de error
    utilidades/       Decimales exactos y formato de fechas/dinero (hora de Costa Rica)
  modulos/            Un directorio por módulo (inicio, autenticación; luego productos, compras...)
  pruebas/            Pruebas automáticas
docs/
  CONTRATO_DATOS.md                    Qué debe cumplir cualquier base de datos/adaptador
  MODELO_DE_DATOS_PLANIFICADO.md       Tablas y campos previstos por versión
  GUIA_CONEXION_BASE_DE_DATOS.md       Pasos para conectar la base real
  decisiones/ADR-001-base-de-datos.md  Decisión de base de datos (PENDIENTE)
  ESTADO_V1.md                         Bloque de estado para la siguiente versión
```

## Reglas del proyecto (resumen)
- Las pantallas nunca hablan con la base de datos directamente: usan `datos` (`src/nucleo/datos`).
- Dinero y cantidades siempre con decimales exactos (`src/compartido/utilidades/decimales.js`).
- Fechas y horas se muestran en hora de Costa Rica.
- Todo el texto visible está en español.
- No incluye el módulo nutricional de residentes (excluido del alcance).
