import { rangoDelMes } from '../modulos/movimientos/periodos.js';

describe('rangoDelMes', () => {
  it('devuelve el primer y el último día del mes de hoy', () => {
    expect(rangoDelMes(0, '2026-03-15')).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' });
    expect(rangoDelMes(0, '2026-04-30')).toEqual({ desde: '2026-04-01', hasta: '2026-04-30' });
  });
  it('el mes anterior cruza el cambio de año', () => {
    expect(rangoDelMes(-1, '2026-01-10')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(rangoDelMes(-1, '2026-03-01')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });
  it('febrero tiene 29 días en año bisiesto', () => {
    expect(rangoDelMes(0, '2028-02-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
  });
});
