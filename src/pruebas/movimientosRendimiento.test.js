import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { diaEnCostaRica } from '../nucleo/datos/movimientos.js';

// Prueba del adaptador completo con 10.000 movimientos (se siembran directo en el almacén: registrarlos uno a uno sería lento
// y aquí lo que se mide es la consulta). El plan pide que buscar por producto y fecha tarde menos de 2 segundos.
const LLAVE_PRODUCTOS = 'inventario.demo.productos';
const LLAVE_INVENTARIO = 'inventario.demo.inventario';

async function conDiezMilMovimientos() {
  const a = crearAdaptadorDemo({ retardoMs: 0 });
  await a.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const [kg] = await a.unidades.listarUnidades();
  const ahora = '2026-01-01T12:00:00.000Z';
  const productos = Array.from({ length: 200 }, (_, i) => ({
    id: `prod-${i}`, nombre: `Producto ${String(i).padStart(3, '0')}`, nombreNormalizado: `producto ${i}`, activo: true,
    unidadBaseId: kg.id, creadoEn: ahora, actualizadoEn: ahora, creadoPor: USUARIO_DEMO.id,
  }));
  const movimientos = Array.from({ length: 10000 }, (_, i) => ({
    id: `mov-${i}`, productoId: `prod-${i % 200}`, tipo: i % 4 === 0 ? 'salida' : 'ingreso', subtipo: i % 4 === 0 ? 'consumo' : 'compra',
    sentido: i % 4 === 0 ? -1 : 1, cantidadOriginal: '1', unidadOriginalId: kg.id, presentacionOriginalId: null, factorAplicado: '1',
    conversionId: null, redondeado: false, cantidadBase: '1', unidadBaseId: kg.id,
    fechaHora: new Date(Date.UTC(2026, 0, 1) + (i % 90) * 86400000 + (i % 24) * 3600000).toISOString(),
    usuarioId: USUARIO_DEMO.id, claveIdempotencia: `k-${i}`, referenciaTipo: null, referenciaId: null, nota: null,
  }));
  window.sessionStorage.setItem(LLAVE_PRODUCTOS, JSON.stringify(productos));
  window.sessionStorage.setItem(LLAVE_INVENTARIO, JSON.stringify({ movimientos, existencias: [], compras: [], compraLineas: [], salidas: [], consumos: [] }));
  return { a, movimientos };
}

describe('historial y consolidado con 10.000 movimientos', () => {
  it('listar por producto y fechas tarda menos de 2 segundos y devuelve lo correcto', async () => {
    const { a, movimientos } = await conDiezMilMovimientos();
    const esperados = movimientos.filter((m) => m.productoId === 'prod-7' && diaEnCostaRica(m.fechaHora) >= '2026-02-01' && diaEnCostaRica(m.fechaHora) <= '2026-02-28');
    const t0 = performance.now();
    const r = await a.movimientos.listarMovimientos({ productoId: 'prod-7', desde: '2026-02-01', hasta: '2026-02-28' });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r.total).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThanOrEqual(r.tamanoPagina);
    expect(r.items.every((m) => m.producto.id === 'prod-7')).toBe(true);
    expect(r.total).toBe(esperados.length);
  });

  it('listar sin filtros pagina el total y tarda menos de 2 segundos', async () => {
    const { a } = await conDiezMilMovimientos();
    const t0 = performance.now();
    const r = await a.movimientos.listarMovimientos({ pagina: 3 });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r).toMatchObject({ total: 10000, pagina: 3, totalPaginas: 500 });
    expect(r.items).toHaveLength(20);
  });

  it('consolidar y abrir el detalle de un movimiento tardan menos de 2 segundos', async () => {
    const { a } = await conDiezMilMovimientos();
    const t0 = performance.now();
    const c = await a.movimientos.consolidarMovimientos({ desde: '2025-12-01', hasta: '2026-12-31' });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(c.filas).toHaveLength(200);
    expect(c.totalMovimientos).toBe(10000);
    const t1 = performance.now();
    const d = await a.movimientos.obtenerMovimiento('mov-9999');
    expect(performance.now() - t1).toBeLessThan(2000);
    expect(d.id).toBe('mov-9999');
  });
});
