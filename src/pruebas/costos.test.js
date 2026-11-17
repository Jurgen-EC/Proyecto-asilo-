import * as costos from '../nucleo/costos/index.js';

const { calcularCostoPromedio, costoPromedioParaMostrar, FormulaPendiente, periodoCerrado, TEXTO_COSTO_PENDIENTE } = costos;

describe('módulo aislado de costos (costo promedio BLOQUEADO)', () => {
  it('calcularCostoPromedio lanza FormulaPendiente, con o sin datos', () => {
    expect(() => calcularCostoPromedio()).toThrow(FormulaPendiente);
    expect(() => calcularCostoPromedio([])).toThrow(FormulaPendiente);
    expect(() => calcularCostoPromedio([
      { cantidad: '10', costoUnitario: '800.00', costoTotal: '8000.00' },
      { cantidad: '10', costoUnitario: '1000.00', costoTotal: '10000.00' },
    ])).toThrow(FormulaPendiente);
  });

  it('FormulaPendiente es un error identificable y explica que falta la aprobación del hogar', () => {
    let capturado;
    try { calcularCostoPromedio([]); } catch (e) { capturado = e; }
    expect(capturado).toBeInstanceOf(Error);
    expect(capturado).toMatchObject({ name: 'FormulaPendiente', codigo: 'FORMULA_PENDIENTE' });
    expect(capturado.message).toMatch(/pendiente de aprobación del hogar/i);
  });

  it('la pantalla recibe «Pendiente de definición», nunca un número', () => {
    expect(TEXTO_COSTO_PENDIENTE).toBe('Pendiente de definición');
    expect(costoPromedioParaMostrar([{ costoUnitario: '800.00' }])).toEqual({ pendiente: true, texto: 'Pendiente de definición' });
  });

  it('el módulo no ofrece ninguna otra fórmula (promedio simple, ponderado, último costo ni costo por unidad base)', () => {
    expect(Object.keys(costos).sort()).toEqual([
      'FormulaPendiente', 'TEXTO_COSTO_PENDIENTE', 'calcularCostoPromedio', 'costoPromedioParaMostrar', 'periodoCerrado',
    ]);
  });

  it('el cierre todavía no existe: ningún período está cerrado', () => {
    expect(periodoCerrado('2026-10-31')).toBe(false);
    expect(periodoCerrado('2020-01-01')).toBe(false);
  });
});
