import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';

// Adaptador completo con 8.000 movimientos y 400 compras sembrados (el almacén del navegador de prueba admite unos 5 MB) directo en el almacén (registrarlos uno a uno sería lento
// y aquí lo que se mide es la consulta). Los reportes mensuales tienen que tardar menos de 2 segundos.
const LLAVE_PRODUCTOS = 'inventario.demo.productos';
const LLAVE_INVENTARIO = 'inventario.demo.inventario';

async function conDatosGrandes() {
  const a = crearAdaptadorDemo({ retardoMs: 0 });
  await a.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const [kg] = await a.unidades.listarUnidades();
  const ahora = '2026-01-01T12:00:00.000Z';
  const productos = Array.from({ length: 200 }, (_, i) => ({
    id: `prod-${i}`, nombre: `Producto ${String(i).padStart(3, '0')}`, nombreNormalizado: `producto ${i}`, activo: true,
    unidadBaseId: kg.id, creadoEn: ahora, actualizadoEn: ahora, creadoPor: USUARIO_DEMO.id,
  }));
  const dia = (i) => new Date(Date.UTC(2026, 0, 1, 12) + (i % 90) * 86400000);
  const movimientos = Array.from({ length: 8000 }, (_, i) => ({
    id: `mov-${i}`, productoId: `prod-${i % 200}`, tipo: i % 4 === 0 ? 'salida' : 'ingreso', subtipo: i % 4 === 0 ? 'consumo' : 'compra',
    sentido: i % 4 === 0 ? -1 : 1, cantidadOriginal: '1', unidadOriginalId: kg.id, presentacionOriginalId: null, factorAplicado: '1',
    conversionId: null, redondeado: false, cantidadBase: '1', unidadBaseId: kg.id, fechaHora: dia(i).toISOString(),
    usuarioId: USUARIO_DEMO.id, claveIdempotencia: `k-${i}`, referenciaTipo: null, referenciaId: null, nota: null,
  }));
  const compras = Array.from({ length: 400 }, (_, i) => ({
    id: `compra-${i}`, fechaCompra: dia(i).toISOString().slice(0, 10), registradaEn: dia(i).toISOString(), usuarioId: USUARIO_DEMO.id, nota: null, total: '100.00', claveIdempotencia: `c-${i}`,
  }));
  const compraLineas = compras.map((c, i) => ({
    id: `linea-${i}`, compraId: c.id, productoId: `prod-${i % 200}`, presentacionId: null, cantidad: '1', unidadId: kg.id,
    costoUnitario: '100.00', costoTotal: '100.00', movimientoId: `mov-${i}`,
  }));
  window.sessionStorage.setItem(LLAVE_PRODUCTOS, JSON.stringify(productos));
  window.sessionStorage.setItem(LLAVE_INVENTARIO, JSON.stringify({ movimientos, existencias: [], compras, compraLineas, salidas: [], consumos: [], consumoCostoCambios: [] }));
  return a;
}

describe('reportes mensuales con 8.000 movimientos y 400 compras', () => {
  it('el estado al cierre, el resumen y las compras del mes tardan menos de 2 segundos cada uno', async () => {
    const a = await conDatosGrandes();
    const medir = async (operacion) => { const t0 = performance.now(); const r = await a.reportes[operacion]({ mes: '2026-02' }); return { r, ms: performance.now() - t0 }; };
    const cierre = await medir('inventarioAlCierre');
    const resumen = await medir('resumenMovimientos');
    const compras = await medir('comprasMensuales');
    expect(cierre.ms).toBeLessThan(2000);
    expect(resumen.ms).toBeLessThan(2000);
    expect(compras.ms).toBeLessThan(2000);
    expect(cierre.r.totalProductos).toBe(200);
    expect(resumen.r.filas.length).toBeGreaterThan(0);
    expect(Number(compras.r.totalGeneral)).toBe(compras.r.cantidadLineas * 100);
  });
});
