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

// Productos creados en la V2 (sin unidad base). Solo se pueden sembrar escribiendo en el almacén del adaptador demo.
describe('productos heredados de la V2 sin unidad base (INCOMPLETOS)', () => {
  const LLAVE = 'inventario.demo.productos';
  const heredado = {
    id: 'v2-1', nombre: 'Frijoles', nombreNormalizado: 'frijoles', activo: true, unidadBaseId: null,
    creadoEn: '2026-10-01T12:00:00.000Z', actualizadoEn: '2026-10-01T12:00:00.000Z', creadoPor: 'demo-1',
  };
  async function conHeredado() {
    window.sessionStorage.setItem(LLAVE, JSON.stringify([heredado]));
    const a = crearAdaptadorDemo({ retardoMs: 0 });
    await a.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    return a;
  }

  it('siguen consultables y en la lista, pero no entran con soloCompletos', async () => {
    const a = await conHeredado();
    expect((await a.productos.obtenerProducto('v2-1')).unidadBaseId).toBeNull();
    expect((await a.productos.listarProductos()).total).toBe(1);
    expect((await a.productos.listarProductos({ soloCompletos: true })).total).toBe(0);
  });

  it('se completan editándolos con una unidad base, y entonces ya cuentan como completos', async () => {
    const a = await conHeredado();
    const [kg] = await a.unidades.listarUnidades();
    await expect(a.productos.editarProducto('v2-1', { nombre: 'Frijoles', unidadBaseId: '' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    const completo = await a.productos.editarProducto('v2-1', { nombre: 'Frijoles', unidadBaseId: kg.id });
    expect(completo).toMatchObject({ id: 'v2-1', unidadBaseId: kg.id });
    expect((await a.productos.listarProductos({ soloCompletos: true })).total).toBe(1);
  });

  it('editar solo el nombre no les inventa una unidad base', async () => {
    const a = await conHeredado();
    expect((await a.productos.editarProducto('v2-1', { nombre: 'Frijoles negros' })).unidadBaseId).toBeNull();
  });
});
