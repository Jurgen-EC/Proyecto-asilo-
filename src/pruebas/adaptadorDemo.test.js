import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { ejecutarPruebasDeContrato } from '../nucleo/datos/pruebasDeContrato.js';
import { crearDatos } from '../nucleo/datos/index.js';

ejecutarPruebasDeContrato(
  'adaptador demo',
  () => crearAdaptadorDemo({ retardoMs: 0 }),
  { correo: USUARIO_DEMO.correo, clave: CLAVE_DEMO },
  {
    // Simula un fallo a mitad de registrarMovimiento (después de insertar el movimiento, antes de confirmar).
    crearConFalloSimulado: () => {
      const ganchos = {};
      return {
        adaptador: crearAdaptadorDemo({ retardoMs: 0, ganchos }),
        provocarFallo: () => { ganchos.despuesDeInsertarMovimiento = () => { throw new Error('Fallo simulado'); }; },
        restaurar: () => { delete ganchos.despuesDeInsertarMovimiento; },
      };
    },
  },
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

// Fallo simulado EXACTAMENTE en la segunda línea de una compra (la primera ya se había procesado en la copia de trabajo).
describe('compra: fallo a mitad de camino en el adaptador demo', () => {
  it('si la segunda línea falla después de procesar la primera, no queda nada guardado', async () => {
    let movimientosInsertados = 0;
    const ganchos = { despuesDeInsertarMovimiento: () => { movimientosInsertados += 1; if (movimientosInsertados === 2) throw new Error('Fallo simulado'); } };
    const a = crearAdaptadorDemo({ retardoMs: 0, ganchos });
    await a.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const kg = (await a.unidades.listarUnidades()).find((u) => u.abreviatura === 'kg');
    const papa = await a.productos.crearProducto({ nombre: 'Papa', unidadBaseId: kg.id });
    const arroz = await a.productos.crearProducto({ nombre: 'Arroz', unidadBaseId: kg.id });
    const hoy = new Date().toISOString().slice(0, 10);
    const entrada = {
      fechaCompra: new Date(Date.now() - 86400000).toISOString().slice(0, 10) <= hoy ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : hoy,
      claveIdempotencia: 'k-1',
      lineas: [
        { productoId: papa.id, unidadId: kg.id, cantidad: '10', costoUnitario: '800' },
        { productoId: arroz.id, unidadId: kg.id, cantidad: '5', costoUnitario: '900' },
      ],
    };
    await expect(a.compras.registrarCompra(entrada)).rejects.toMatchObject({ codigo: 'DESCONOCIDO' });
    expect(movimientosInsertados).toBe(2); // la primera línea sí se procesó; aun así no se guardó
    expect((await a.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe('0');
    expect((await a.compras.listarCompras()).total).toBe(0);
    expect(await a.inventario.verificarConsistencia()).toMatchObject({ consistente: true, movimientosRevisados: 0 });
    // sin el fallo, el mismo reintento funciona
    delete ganchos.despuesDeInsertarMovimiento;
    expect((await a.compras.registrarCompra(entrada)).repetido).toBe(false);
    expect((await a.inventario.obtenerExistencia(arroz.id)).cantidadBase).toBe('5');
  });
});
