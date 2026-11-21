import { validarMes, inventarioAlCierre, resumenDelMes, comprasDelMes } from '../nucleo/datos/reportes.js';

const mov = (i, extra = {}) => ({
  id: `m-${i}`, productoId: 'p1', tipo: 'ingreso', subtipo: 'compra', sentido: 1, cantidadBase: '1', unidadBaseId: 'u1',
  fechaHora: '2026-03-10T18:00:00.000Z', ...extra,
});

describe('validarMes', () => {
  it('devuelve el primer y el último día del mes', () => {
    expect(validarMes('2026-03')).toEqual({ mes: '2026-03', desde: '2026-03-01', hasta: '2026-03-31' });
    expect(validarMes('2026-04').hasta).toBe('2026-04-30');
    expect(validarMes('2026-02').hasta).toBe('2026-02-28');
    expect(validarMes('2028-02').hasta).toBe('2028-02-29');
    expect(validarMes('2026-12').hasta).toBe('2026-12-31');
  });
  it('rechaza lo que no es un mes AAAA-MM, con el mensaje en campos.mes', () => {
    for (const malo of [undefined, null, '', '2026-13', '2026-3', 'marzo', '1999-12', '2101-01', 202603, {}]) {
      expect(() => validarMes(malo)).toThrowError(expect.objectContaining({ codigo: 'VALIDACION', campos: { mes: expect.any(String) } }));
    }
  });
});

describe('inventarioAlCierre', () => {
  it('suma con signo hasta el último día (hora de Costa Rica) y no incluye lo posterior', () => {
    const lista = [
      mov(1, { cantidadBase: '10' }),
      mov(2, { tipo: 'salida', subtipo: 'consumo', sentido: -1, cantidadBase: '4' }),
      mov(3, { fechaHora: '2026-04-01T06:30:00.000Z', cantidadBase: '100' }), // 01/04 00:30 en Costa Rica
      mov(4, { productoId: 'p2', cantidadBase: '0.1' }), mov(5, { productoId: 'p2', cantidadBase: '0.2' }),
    ];
    expect(inventarioAlCierre(lista, { hasta: '2026-03-31' })).toEqual([
      { productoId: 'p1', unidadBaseId: 'u1', existencia: '6', cantidadMovimientos: 2 },
      { productoId: 'p2', unidadBaseId: 'u1', existencia: '0.3', cantidadMovimientos: 2 }, // 0,1 + 0,2 exacto
    ]);
    expect(inventarioAlCierre(lista, { hasta: '2026-04-30' }).find((f) => f.productoId === 'p1').existencia).toBe('106');
    expect(inventarioAlCierre(lista, { hasta: '2026-02-28' })).toEqual([]);
  });
});

describe('resumenDelMes', () => {
  const lista = [
    mov(1, { fechaHora: '2026-02-10T18:00:00.000Z', cantidadBase: '10' }),
    mov(2, { cantidadBase: '5' }),
    mov(3, { tipo: 'salida', subtipo: 'salida_general', sentido: -1, cantidadBase: '3' }),
    mov(4, { tipo: 'salida', subtipo: 'consumo', sentido: -1, cantidadBase: '2' }),
    mov(5, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido: -1, cantidadBase: '1' }),
    mov(6, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido: 1, cantidadBase: '4' }),
  ];
  it('arma saldo inicial, ingresos, salidas, ajustes y saldo final que siempre cuadran', () => {
    expect(resumenDelMes(lista, { desde: '2026-03-01', hasta: '2026-03-31' })).toEqual([{
      productoId: 'p1', unidadBaseId: 'u1', saldoInicial: '10', ingresos: '5', salidas: '5', salidasGenerales: '3', consumos: '2', ajustes: '3', saldoFinal: '13',
      cantidadIngresos: 1, cantidadSalidas: 2, cantidadAjustes: 2,
    }]);
  });
  it('un producto con saldo y sin movimientos aparece; sin saldo ni movimientos, no', () => {
    expect(resumenDelMes(lista, { desde: '2026-05-01', hasta: '2026-05-31' })[0]).toMatchObject({ saldoInicial: '13', saldoFinal: '13', cantidadIngresos: 0 });
    expect(resumenDelMes(lista, { desde: '2026-01-01', hasta: '2026-01-31' })).toEqual([]);
    const cero = [mov(1, { cantidadBase: '4' }), mov(2, { tipo: 'salida', subtipo: 'consumo', sentido: -1, cantidadBase: '4' })];
    expect(resumenDelMes(cero, { desde: '2026-04-01', hasta: '2026-04-30' })).toEqual([]); // saldo 0 y nada en abril
  });
});

describe('comprasDelMes', () => {
  const compras = [
    { id: 'c1', fechaCompra: '2026-03-05', registradaEn: '2026-03-05T18:00:00.000Z' },
    { id: 'c2', fechaCompra: '2026-03-31', registradaEn: '2026-04-02T18:00:00.000Z' },
    { id: 'c3', fechaCompra: '2026-04-01', registradaEn: '2026-04-01T18:00:00.000Z' },
  ];
  const linea = (id, compraId, productoId, extra = {}) => ({
    id, compraId, productoId, cantidad: '1', unidadId: 'u1', presentacionId: null, costoUnitario: '100.00', costoTotal: '100.00', movimientoId: `m-${id}`, ...extra,
  });
  const lineas = [
    linea('l1', 'c1', 'p1', { costoTotal: '0.10' }), linea('l2', 'c1', 'p2', { costoTotal: '4377.63', cantidad: '3.5' }),
    linea('l3', 'c2', 'p1', { costoTotal: '0.20' }), linea('l4', 'c3', 'p1'),
  ];
  const movimientos = ['l1', 'l2', 'l3', 'l4'].map((id, i) => mov(i, { id: `m-${id}`, cantidadBase: id === 'l2' ? '3.5' : '1' }));
  it('toma las compras por su fecha, agrupa por producto y suma con decimales exactos', () => {
    const r = comprasDelMes(compras, lineas, movimientos, { desde: '2026-03-01', hasta: '2026-03-31' });
    expect(r.grupos).toHaveLength(2);
    const p1 = r.grupos.find((g) => g.productoId === 'p1');
    expect(p1).toMatchObject({ subtotalCosto: '0.30', subtotalCantidadBase: '2', cantidadLineas: 2 }); // 0,10 + 0,20 exacto
    expect(p1.lineas.map((l) => l.fechaCompra)).toEqual(['2026-03-05', '2026-03-31']);
    expect(r).toMatchObject({ totalGeneral: '4377.93', cantidadCompras: 2, cantidadLineas: 3 });
  });
  it('un mes sin compras devuelve cero con dos decimales', () => {
    expect(comprasDelMes(compras, lineas, movimientos, { desde: '2026-06-01', hasta: '2026-06-30' })).toEqual({ grupos: [], totalGeneral: '0.00', cantidadCompras: 0, cantidadLineas: 0 });
  });
});

describe('rendimiento con 10.000 movimientos', () => {
  const lista = Array.from({ length: 10000 }, (_, i) => mov(i, {
    productoId: `p${i % 200}`, tipo: i % 3 === 0 ? 'salida' : 'ingreso', subtipo: i % 3 === 0 ? 'consumo' : 'compra', sentido: i % 3 === 0 ? -1 : 1,
    cantidadBase: String((i % 7) + 1), fechaHora: new Date(Date.UTC(2026, 0, 1, 12) + (i % 120) * 86400000).toISOString(),
  }));
  it('el estado al cierre y el resumen del mes tardan menos de 2 segundos', () => {
    const t0 = performance.now();
    const cierre = inventarioAlCierre(lista, { hasta: '2026-03-31' });
    const resumen = resumenDelMes(lista, { desde: '2026-03-01', hasta: '2026-03-31' });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(cierre).toHaveLength(200);
    for (const f of resumen) {
      expect(Number(f.saldoFinal)).toBe(Number(f.saldoInicial) + Number(f.ingresos) - Number(f.salidas) + Number(f.ajustes));
    }
  });
});
