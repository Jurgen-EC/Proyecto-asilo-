import { sumar, multiplicar, redondear, comparar, dividir } from '../compartido/utilidades/decimales.js';
import { formatearDinero, formatearFechaHora, formatearFecha, formatearCantidad } from '../compartido/utilidades/formato.js';

describe('decimales exactos', () => {
  it('0.1 + 0.2 es exactamente 0.3', () => {
    expect(sumar('0.1', '0.2').toString()).toBe('0.3');
  });
  it('multiplica cantidad por costo sin error de flotantes', () => {
    expect(multiplicar('3.5', '1250.75').toString()).toBe('4377.625');
  });
  it('redondea half-up a 2 decimales', () => {
    expect(redondear('2.675', 2).toString()).toBe('2.68');
  });
  it('compara y divide', () => {
    expect(comparar('2', '3')).toBe(-1);
    expect(dividir('1', '4').toString()).toBe('0.25');
  });
});

describe('formato', () => {
  it('formatea dinero en colones con 2 decimales', () => {
    const t = formatearDinero('1250.75');
    expect(t).toMatch(/₡/);
    expect(t).toMatch(/1\D?250,75/);
  });
  it('usa la hora de Costa Rica (UTC-6) para fecha y hora', () => {
    // 2026-03-01 03:30 UTC es 2026-02-28 21:30 en Costa Rica
    expect(formatearFecha('2026-03-01T03:30:00Z')).toBe('28/02/2026');
    expect(formatearFechaHora('2026-03-01T03:30:00Z')).toMatch(/28\/02\/2026.*21:30/);
  });
  it('devuelve vacío con fechas inválidas', () => {
    expect(formatearFecha('no es fecha')).toBe('');
  });
  it('formatea cantidades con unidad', () => {
    expect(formatearCantidad('1.5', 'kg')).toBe('1,5 kg');
  });
});
