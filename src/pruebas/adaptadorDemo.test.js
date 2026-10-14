import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { ejecutarPruebasDeContrato } from '../nucleo/datos/pruebasDeContrato.js';
import { crearDatos } from '../nucleo/datos/index.js';

ejecutarPruebasDeContrato(
  'adaptador demo',
  () => crearAdaptadorDemo({ retardoMs: 0 }),
  { correo: USUARIO_DEMO.correo, clave: CLAVE_DEMO },
);

describe('selección de adaptador', () => {
  it('crea el adaptador demo por nombre', () => {
    expect(crearDatos('demo').esDemo).toBe(true);
  });
  it('rechaza un adaptador no registrado con mensaje claro', () => {
    expect(() => crearDatos('inexistente')).toThrow(/no registrado/);
  });
});
