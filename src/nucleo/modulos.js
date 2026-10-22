// Catálogo de módulos del sistema. Los módulos aún no construidos aparecen
// deshabilitados con la etiqueta "Próximamente". Al construir un módulo se cambia
// su estado a 'disponible' y se registra su ruta en src/App.jsx.
export const MODULOS = [
  { id: 'productos',    nombre: 'Productos',               ruta: '/productos',    version: 2,  estado: 'disponible', descripcion: 'Catálogo de productos' },
  { id: 'unidades',     nombre: 'Unidades y conversiones', ruta: '/unidades',     version: 3,  estado: 'disponible', descripcion: 'Unidades, presentaciones y equivalencias' },
  { id: 'inventario',   nombre: 'Inventario',              ruta: '/inventario',   version: 4,  estado: 'proximamente', descripcion: 'Existencias actuales' },
  { id: 'compras',      nombre: 'Compras',                 ruta: '/compras',      version: 5,  estado: 'proximamente', descripcion: 'Compras e ingresos' },
  { id: 'salidas',      nombre: 'Salidas y consumo',       ruta: '/salidas',      version: 6,  estado: 'proximamente', descripcion: 'Salidas y consumos de productos' },
  { id: 'movimientos',  nombre: 'Movimientos',             ruta: '/movimientos',  version: 7,  estado: 'proximamente', descripcion: 'Historial, ingresos, salidas y consolidado' },
  { id: 'costos',       nombre: 'Gastos y costos',         ruta: '/costos',       version: 8,  estado: 'proximamente', descripcion: 'Gastos y costos de adquisición' },
  { id: 'reportes',     nombre: 'Reportes mensuales',      ruta: '/reportes',     version: 9,  estado: 'proximamente', descripcion: 'Inventario, compras, gastos, consumo y costos' },
  { id: 'conteos',      nombre: 'Conteos y ajustes',       ruta: '/conteos',      version: 11, estado: 'proximamente', descripcion: 'Conciliación físico-digital y ajustes' },
  { id: 'desinfeccion', nombre: 'Desinfección',            ruta: '/desinfeccion', version: 13, estado: 'proximamente', descripcion: 'Control de verduras desinfectadas' },
  { id: 'recetas',      nombre: 'Menú y recetas',          ruta: '/recetas',      version: 14, estado: 'proximamente', descripcion: 'Platillos, recetas y cálculo por comensales' },
  { id: 'cocina',       nombre: 'Modo cocina',             ruta: '/cocina',       version: 16, estado: 'proximamente', descripcion: 'Interfaz rápida para la cocina' },
  { id: 'importaciones',nombre: 'Importaciones',           ruta: '/importaciones',version: 17, estado: 'proximamente', descripcion: 'Carga de datos desde Excel' },
  { id: 'usuarios',     nombre: 'Usuarios y permisos',     ruta: '/usuarios',     version: 18, estado: 'proximamente', descripcion: 'Gestión de usuarios y permisos' },
];
