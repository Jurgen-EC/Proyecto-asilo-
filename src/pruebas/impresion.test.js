import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// La vista imprimible se define en la hoja de estilos (@media print). jsdom no imprime, así que aquí se verifica que las reglas
// que ocultan los menús y evitan cortar las tablas estén presentes.
const css = readFileSync(resolve(process.cwd(), 'src/estilos.css'), 'utf8');
const bloquePrint = css.slice(css.indexOf('@media print'));

describe('hoja de estilos de impresión', () => {
  it('existe un bloque @media print', () => {
    expect(css).toContain('@media print');
  });
  it('oculta los menús, el encabezado, el aviso de demostración, las pestañas y los botones al imprimir', () => {
    for (const selector of ['.banner-demo', '.encabezado', '.menu', '.subnavegacion', '.herramientas', '.pestanas', '.no-imprimir', '.selector-periodo']) {
      expect(bloquePrint).toContain(selector);
    }
    expect(bloquePrint).toMatch(/display:\s*none\s*!important/);
  });
  it('muestra el encabezado de impresión solo al imprimir', () => {
    expect(css).toMatch(/\.encabezado-impresion\s*\{\s*display:\s*none;?\s*\}/); // en pantalla, oculto
    expect(bloquePrint).toMatch(/\.encabezado-impresion\s*\{[^}]*display:\s*block/);
  });
  it('evita cortar las filas de las tablas y repite el encabezado en cada página', () => {
    expect(bloquePrint).toMatch(/break-inside:\s*avoid/);
    expect(bloquePrint).toMatch(/page-break-inside:\s*avoid/);
    expect(bloquePrint).toMatch(/thead\s*\{[^}]*table-header-group/);
  });
  it('imprime siempre en claro, aunque la pantalla esté en modo oscuro', () => {
    expect(bloquePrint).toMatch(/--fondo:\s*#fff/);
    expect(bloquePrint).toMatch(/color-scheme:\s*light/);
  });
});
