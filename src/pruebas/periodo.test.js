import { desplazarMes, esMesValido, mesDeHoy, nombreDelMes, rangoDeMes } from '../compartido/utilidades/periodo.js';

describe('periodo', () => {
  it('valida el formato AAAA-MM', () => {
    for (const bueno of ['2026-03', '2026-12', '2000-01']) expect(esMesValido(bueno)).toBe(true);
    for (const malo of ['2026-13', '2026-00', '2026-3', 'marzo', '', null, undefined, 202603, '2026-03-01']) expect(esMesValido(malo)).toBe(false);
  });
  it('el mes de hoy sale de la fecha de Costa Rica', () => {
    expect(mesDeHoy('2026-03-31')).toBe('2026-03');
    expect(mesDeHoy('2026-12-01')).toBe('2026-12');
  });
  it('desplaza meses cruzando el cambio de año', () => {
    expect(desplazarMes('2026-03', -1)).toBe('2026-02');
    expect(desplazarMes('2026-01', -1)).toBe('2025-12');
    expect(desplazarMes('2026-12', 1)).toBe('2027-01');
    expect(desplazarMes('2026-03', -15)).toBe('2024-12');
  });
  it('escribe el nombre del mes y devuelve vacío si no es válido', () => {
    expect(nombreDelMes('2026-03')).toBe('marzo de 2026');
    expect(nombreDelMes('2026-09')).toBe('septiembre de 2026');
    expect(nombreDelMes('2026-13')).toBe('');
  });
  it('da el primer y el último día del mes (incluido febrero bisiesto)', () => {
    expect(rangoDeMes('2026-03')).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' });
    expect(rangoDeMes('2026-04')).toEqual({ desde: '2026-04-01', hasta: '2026-04-30' });
    expect(rangoDeMes('2026-02').hasta).toBe('2026-02-28');
    expect(rangoDeMes('2028-02').hasta).toBe('2028-02-29');
  });
});
