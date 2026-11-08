import {
  normalizarConsultaMovimientos, filtrarMovimientos, consolidarMovimientos, existenciaAlMovimiento,
  diaEnCostaRica, tipoDeSubtipo, TAMANO_PAGINA_MOVIMIENTOS, TAMANO_PAGINA_MOVIMIENTOS_MAX,
} from '../nucleo/datos/movimientos.js';

const mov = (i, extra = {}) => ({
  id: `m-${i}`, productoId: 'p1', tipo: 'ingreso', subtipo: 'compra', sentido: 1, cantidadBase: '1', unidadBaseId: 'u1',
  fechaHora: '2026-03-10T15:00:00.000Z', ...extra,
});

describe('diaEnCostaRica', () => {
  it('cuenta el día en hora de Costa Rica (UTC-6)', () => {
    expect(diaEnCostaRica('2026-03-01T05:59:59.000Z')).toBe('2026-02-28');
    expect(diaEnCostaRica('2026-03-01T06:00:00.000Z')).toBe('2026-03-01');
    expect(diaEnCostaRica('2026-04-01T05:30:00.000Z')).toBe('2026-03-31'); // 23:30 del último día de marzo
    expect(diaEnCostaRica('2026-04-01T06:00:00.000Z')).toBe('2026-04-01');
  });
});

describe('tipoDeSubtipo', () => {
  it('deduce el tipo de cada subtipo', () => {
    expect(tipoDeSubtipo('compra')).toBe('ingreso');
    expect(tipoDeSubtipo('consumo')).toBe('salida');
    expect(tipoDeSubtipo('salida_general')).toBe('salida');
    expect(tipoDeSubtipo('ajuste_conteo')).toBe('ajuste');
    expect(tipoDeSubtipo('inventado')).toBeNull();
  });
});

describe('normalizarConsultaMovimientos', () => {
  it('completa los valores por defecto', () => {
    expect(normalizarConsultaMovimientos()).toEqual({
      tipo: '', subtipo: '', desde: '', hasta: '', productoId: '', orden: 'reciente', pagina: 1, tamanoPagina: TAMANO_PAGINA_MOVIMIENTOS,
    });
  });
  it('deduce el tipo desde el subtipo y acota página y tamaño', () => {
    expect(normalizarConsultaMovimientos({ subtipo: 'consumo' })).toMatchObject({ tipo: 'salida', subtipo: 'consumo' });
    expect(normalizarConsultaMovimientos({ pagina: -4, tamanoPagina: 5000 })).toMatchObject({ pagina: 1, tamanoPagina: TAMANO_PAGINA_MOVIMIENTOS_MAX });
    expect(normalizarConsultaMovimientos({ tamanoPagina: 0 }).tamanoPagina).toBe(TAMANO_PAGINA_MOVIMIENTOS);
  });
  it('informa juntos los errores de cada campo', () => {
    try {
      normalizarConsultaMovimientos({ tipo: 'xx', subtipo: 'yy', desde: 'hoy', hasta: '2026-02-30' });
      throw new Error('debía lanzar');
    } catch (e) {
      expect(e.codigo).toBe('VALIDACION');
      expect(Object.keys(e.campos).sort()).toEqual(['desde', 'hasta', 'subtipo', 'tipo']);
    }
    expect(() => normalizarConsultaMovimientos({ tipo: 'ingreso', subtipo: 'consumo' })).toThrowError(expect.objectContaining({ campos: { subtipo: expect.any(String) } }));
  });
});

describe('filtrarMovimientos', () => {
  const lista = [
    mov(1, { fechaHora: '2026-03-10T15:00:00.000Z' }),
    mov(2, { fechaHora: '2026-03-12T15:00:00.000Z', productoId: 'p2' }),
    mov(3, { fechaHora: '2026-03-11T15:00:00.000Z', tipo: 'salida', subtipo: 'consumo', sentido: -1 }),
    mov(4, { fechaHora: '2026-03-11T15:00:00.000Z' }),
  ];
  it('ordena el más reciente primero y, a igual hora, el registrado después', () => {
    expect(filtrarMovimientos(lista).map((m) => m.id)).toEqual(['m-2', 'm-4', 'm-3', 'm-1']);
    expect(filtrarMovimientos(lista, { orden: 'antiguo' }).map((m) => m.id)).toEqual(['m-1', 'm-3', 'm-4', 'm-2']);
  });
  it('filtra por producto, tipo, subtipo y fechas inclusivas, sin modificar la lista original', () => {
    const copia = JSON.stringify(lista);
    expect(filtrarMovimientos(lista, { productoId: 'p2' }).map((m) => m.id)).toEqual(['m-2']);
    expect(filtrarMovimientos(lista, { tipo: 'salida' }).map((m) => m.id)).toEqual(['m-3']);
    expect(filtrarMovimientos(lista, { subtipo: 'compra' }).map((m) => m.id)).toEqual(['m-2', 'm-4', 'm-1']);
    expect(filtrarMovimientos(lista, { desde: '2026-03-11', hasta: '2026-03-11' }).map((m) => m.id)).toEqual(['m-4', 'm-3']);
    expect(JSON.stringify(lista)).toBe(copia);
  });
});

describe('consolidarMovimientos', () => {
  it('suma con decimales exactos (0,1 + 0,2 = 0,3) y separa entradas, salidas, consumos y ajustes', () => {
    const lista = [
      mov(1, { cantidadBase: '0.1' }), mov(2, { cantidadBase: '0.2' }),
      mov(3, { tipo: 'salida', subtipo: 'salida_general', sentido: -1, cantidadBase: '0.05' }),
      mov(4, { tipo: 'salida', subtipo: 'consumo', sentido: -1, cantidadBase: '0.1' }),
      mov(5, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido: -1, cantidadBase: '0.01' }),
      mov(6, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido: 1, cantidadBase: '0.5' }),
    ];
    expect(consolidarMovimientos(lista)).toEqual([{
      productoId: 'p1', unidadBaseId: 'u1', entradas: '0.3', salidas: '0.15', salidasGenerales: '0.05', consumos: '0.1',
      diferencia: '0.15', ajustes: '0.49', cantidadEntradas: 2, cantidadSalidas: 2, cantidadAjustes: 2,
    }]);
  });
  it('un ajuste no cambia entradas, salidas ni diferencia', () => {
    const [fila] = consolidarMovimientos([mov(1, { cantidadBase: '10' }), mov(2, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido: 1, cantidadBase: '5' })]);
    expect(fila).toMatchObject({ entradas: '10', salidas: '0', diferencia: '10', ajustes: '5' });
  });
  it('solo incluye productos con movimientos en el período', () => {
    const lista = [mov(1), mov(2, { productoId: 'p2', fechaHora: '2026-05-01T15:00:00.000Z' })];
    expect(consolidarMovimientos(lista, { desde: '2026-05-01', hasta: '2026-05-31' }).map((f) => f.productoId)).toEqual(['p2']);
    expect(consolidarMovimientos(lista, { desde: '2027-01-01' })).toEqual([]);
    expect(consolidarMovimientos([])).toEqual([]);
  });
});

describe('existenciaAlMovimiento', () => {
  it('suma en orden de registro solo los movimientos del mismo producto', () => {
    const lista = [
      mov(1, { cantidadBase: '10' }),
      mov(2, { productoId: 'p2', cantidadBase: '99' }),
      mov(3, { tipo: 'salida', subtipo: 'consumo', sentido: -1, cantidadBase: '4' }),
    ];
    expect(existenciaAlMovimiento(lista, 'm-1')).toEqual({ antes: '0', despues: '10' });
    expect(existenciaAlMovimiento(lista, 'm-3')).toEqual({ antes: '10', despues: '6' });
    expect(existenciaAlMovimiento(lista, 'm-2')).toEqual({ antes: '0', despues: '99' });
    expect(existenciaAlMovimiento(lista, 'no-existe')).toBeNull();
  });
});

describe('rendimiento con 10.000 movimientos', () => {
  // 10.000 movimientos de 200 productos repartidos en 120 días.
  const lista = Array.from({ length: 10000 }, (_, i) => mov(i, {
    productoId: `p${i % 200}`, tipo: i % 3 === 0 ? 'salida' : 'ingreso', subtipo: i % 3 === 0 ? 'consumo' : 'compra', sentido: i % 3 === 0 ? -1 : 1,
    cantidadBase: String((i % 7) + 1), fechaHora: new Date(Date.UTC(2026, 0, 1) + (i % 120) * 86400000 + (i % 24) * 3600000).toISOString(),
  }));
  it('filtrar por producto y fechas tarda menos de 2 segundos', () => {
    const t0 = performance.now();
    const r = filtrarMovimientos(lista, { productoId: 'p7', desde: '2026-02-01', hasta: '2026-03-31' });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.productoId === 'p7')).toBe(true);
  });
  it('consolidar todo el período tarda menos de 2 segundos y suma bien', () => {
    const t0 = performance.now();
    const filas = consolidarMovimientos(lista, { desde: '2025-12-01', hasta: '2026-12-31' }); // incluye el 31/12, que en Costa Rica empieza a las 06:00 UTC
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(filas).toHaveLength(200);
    expect(filas.reduce((t, f) => t + f.cantidadEntradas + f.cantidadSalidas, 0)).toBe(10000);
  });
});
