// PRUEBAS DE CONTRATO DE LOS REPORTES MENSUALES: INVENTARIO Y COMPRAS (Versión 9)
// Cualquier adaptador (demo o de la base real) debe pasarlas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { hoyEnCostaRica } from '../../compartido/utilidades/formato.js';

export function ejecutarPruebasContratoReportes(nombre, crearAdaptador, credenciales) {
  describe(`Contrato de reportes mensuales (inventario y compras): ${nombre}`, () => {
    afterEach(() => { vi.useRealTimers(); });
    let n = 0;

    async function conSesion() {
      const a = crearAdaptador();
      await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
      const unidades = await a.unidades.listarUnidades({ estado: 'todas' });
      const un = Object.fromEntries(unidades.map((u) => [u.abreviatura, u.id]));
      const producto = (nombreProducto, unidad = 'kg') => a.productos.crearProducto({ nombre: nombreProducto, unidadBaseId: un[unidad] });
      const movimiento = (p, extra) => a.inventario.registrarMovimiento({ productoId: p.id, unidadId: p.unidadBaseId, claveIdempotencia: `mov-${++n}`, ...extra });
      const ingreso = (p, cantidad) => movimiento(p, { tipo: 'ingreso', subtipo: 'compra', cantidad });
      const ajuste = (p, sentido, cantidad) => movimiento(p, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido, cantidad });
      const salida = (p, cantidad) => a.salidas.registrarSalida({ productoId: p.id, unidadId: p.unidadBaseId, cantidad, motivo: 'Donación', claveIdempotencia: `sal-${++n}` });
      const consumo = (p, cantidad) => a.consumos.registrarConsumo({ productoId: p.id, unidadId: p.unidadBaseId, cantidad, claveIdempotencia: `con-${++n}` });
      // La compra se fecha por defecto «hoy» (del reloj, que los tests pueden adelantar); `fechaCompra` permite una fecha pasada.
      const comprar = (p, cantidad, costoUnitario, extra = {}) => a.compras.registrarCompra({
        fechaCompra: hoyEnCostaRica(), claveIdempotencia: `compra-${++n}`,
        lineas: [{ productoId: p.id, unidadId: p.unidadBaseId, cantidad, costoUnitario }], ...extra,
      });
      return { a, r: a.reportes, un, producto, ingreso, ajuste, salida, consumo, comprar };
    }
    // Reloj falso SOLO para la fecha: permite registrar cosas «en otro mes» sin esperar. 18:00 UTC = 12:00 en Costa Rica.
    const congelarReloj = () => vi.useFakeTimers({ toFake: ['Date'] });
    const enFecha = (iso) => vi.setSystemTime(new Date(iso));
    const filaDe = (reporte, nombreProducto) => reporte.filas.find((f) => f.producto.nombre === nombreProducto);

    // Papa y Arroz repartidos en febrero, marzo y abril de 2026.
    async function escenario() {
      const c = await conSesion();
      const papa = await c.producto('Papa'); const arroz = await c.producto('Arroz');
      congelarReloj();
      enFecha('2026-02-10T18:00:00Z'); await c.comprar(papa, '10', '500');
      enFecha('2026-03-05T18:00:00Z'); await c.comprar(papa, '5', '600'); await c.comprar(arroz, '8', '900');
      enFecha('2026-03-10T18:00:00Z'); await c.salida(papa, '3');
      enFecha('2026-03-15T18:00:00Z'); await c.consumo(papa, '2');
      enFecha('2026-03-20T18:00:00Z'); await c.ajuste(papa, -1, '1'); await c.ajuste(papa, 1, '4');
      enFecha('2026-04-02T18:00:00Z'); await c.comprar(papa, '7', '650');
      return { ...c, papa, arroz };
    }

    it('exige sesión en todas las operaciones', async () => {
      const a = crearAdaptador();
      for (const llamar of [
        () => a.reportes.inventarioAlCierre({ mes: '2026-03' }),
        () => a.reportes.resumenMovimientos({ mes: '2026-03' }),
        () => a.reportes.comprasMensuales({ mes: '2026-03' }),
      ]) await expect(llamar()).rejects.toMatchObject({ codigo: 'SIN_SESION' });
    });

    it('es solo lectura: no ofrece exportar ni modificar nada', async () => {
      const { r } = await conSesion();
      expect(Object.keys(r).sort()).toEqual(['comprasMensuales', 'inventarioAlCierre', 'resumenMovimientos']);
    });

    it('rechaza un mes que falta o no es válido, con el mensaje en campos.mes (VALIDACION)', async () => {
      const { r } = await conSesion();
      for (const mes of [undefined, null, '', '2026-13', '2026-00', '2026-3', 'marzo', '03-2026', '2026/03', '1999-12', '2101-01', 202603]) {
        for (const operacion of ['inventarioAlCierre', 'resumenMovimientos', 'comprasMensuales']) {
          await expect(r[operacion]({ mes })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { mes: expect.any(String) } });
        }
      }
      await expect(r.inventarioAlCierre()).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { mes: expect.any(String) } });
    });

    it('sin datos devuelve reportes vacíos pero válidos, con los límites del mes', async () => {
      const { r } = await conSesion();
      expect(await r.inventarioAlCierre({ mes: '2026-02' })).toEqual({ mes: '2026-02', desde: '2026-02-01', hasta: '2026-02-28', cierre: '2026-02-28', filas: [], totalProductos: 0 });
      expect(await r.resumenMovimientos({ mes: '2028-02' })).toEqual({ mes: '2028-02', desde: '2028-02-01', hasta: '2028-02-29', filas: [], totalMovimientos: 0 }); // año bisiesto
      expect(await r.comprasMensuales({ mes: '2026-04' })).toEqual({
        mes: '2026-04', desde: '2026-04-01', hasta: '2026-04-30', grupos: [], totalGeneral: '0.00', cantidadCompras: 0, cantidadLineas: 0,
      });
    });

    describe('estado del inventario al cierre del mes', () => {
      it('calcula la existencia de cada producto al último día del mes, sin mezclar meses', async () => {
        const { r } = await escenario();
        const febrero = await r.inventarioAlCierre({ mes: '2026-02' });
        expect(febrero.filas.map((f) => [f.producto.nombre, f.existencia])).toEqual([['Papa', '10']]); // el arroz aún no tenía movimientos
        const marzo = await r.inventarioAlCierre({ mes: '2026-03' });
        expect(marzo.filas.map((f) => [f.producto.nombre, f.existencia, f.cantidadMovimientos])).toEqual([['Arroz', '8', 1], ['Papa', '13', 6]]);
        expect(marzo).toMatchObject({ cierre: '2026-03-31', totalProductos: 2 });
        const abril = await r.inventarioAlCierre({ mes: '2026-04' });
        expect(abril.filas.map((f) => [f.producto.nombre, f.existencia])).toEqual([['Arroz', '8'], ['Papa', '20']]);
        expect(filaDe(marzo, 'Papa')).toMatchObject({ unidadBase: { abreviatura: 'kg' }, producto: { activo: true } });
      });

      it('un movimiento a las 23:30 del último día del mes cuenta en ese mes y uno a las 00:30 del siguiente, no (hora de Costa Rica)', async () => {
        const { r, producto, ingreso } = await conSesion();
        const papa = await producto('Papa');
        congelarReloj();
        enFecha('2026-03-31T05:30:00Z'); await ingreso(papa, '3'); // 30/03 23:30
        enFecha('2026-04-01T05:30:00Z'); await ingreso(papa, '4'); // 31/03 23:30: último día de marzo
        enFecha('2026-04-01T06:30:00Z'); await ingreso(papa, '5'); // 01/04 00:30: ya es abril
        expect((await r.inventarioAlCierre({ mes: '2026-03' })).filas[0]).toMatchObject({ existencia: '7', cantidadMovimientos: 2 });
        expect((await r.inventarioAlCierre({ mes: '2026-04' })).filas[0]).toMatchObject({ existencia: '12', cantidadMovimientos: 3 });
        expect((await r.inventarioAlCierre({ mes: '2026-02' })).filas).toEqual([]);
      });

      it('un producto con existencia 0 al cierre sigue apareciendo (tuvo movimientos), y uno desactivado también', async () => {
        const { a, r, producto, ingreso, salida } = await conSesion();
        const papa = await producto('Papa');
        congelarReloj();
        enFecha('2026-03-05T18:00:00Z'); await ingreso(papa, '4'); await salida(papa, '4');
        await a.productos.cambiarEstadoProducto(papa.id, false);
        expect((await r.inventarioAlCierre({ mes: '2026-03' })).filas[0]).toMatchObject({ existencia: '0', producto: { nombre: 'Papa', activo: false } });
      });
    });

    describe('resumen de movimientos del mes', () => {
      it('separa saldo inicial, ingresos, salidas (con consumos aparte), ajustes y saldo final', async () => {
        const { r } = await escenario();
        const marzo = await r.resumenMovimientos({ mes: '2026-03' });
        expect(marzo.filas.map((f) => f.producto.nombre)).toEqual(['Arroz', 'Papa']);
        expect(filaDe(marzo, 'Papa')).toMatchObject({
          unidadBase: { abreviatura: 'kg' }, saldoInicial: '10', ingresos: '5', salidas: '5', salidasGenerales: '3', consumos: '2', ajustes: '3', saldoFinal: '13',
          cantidadIngresos: 1, cantidadSalidas: 2, cantidadAjustes: 2,
        });
        expect(filaDe(marzo, 'Arroz')).toMatchObject({ saldoInicial: '0', ingresos: '8', salidas: '0', ajustes: '0', saldoFinal: '8', cantidadIngresos: 1 });
        expect(marzo.totalMovimientos).toBe(6); // papa: compra, salida, consumo y 2 ajustes; arroz: compra
      });

      it('saldo inicial + ingresos − salidas + ajustes = saldo final, para cada producto y cada mes', async () => {
        const { r } = await escenario();
        for (const mes of ['2026-02', '2026-03', '2026-04', '2026-05']) {
          for (const f of (await r.resumenMovimientos({ mes })).filas) {
            const esperado = Number(f.saldoInicial) + Number(f.ingresos) - Number(f.salidas) + Number(f.ajustes);
            expect(Number(f.saldoFinal)).toBe(esperado);
            expect(Number(f.salidas)).toBe(Number(f.salidasGenerales) + Number(f.consumos));
          }
        }
      });

      it('el saldo inicial es la existencia al cierre del mes anterior y el saldo final coincide con el estado al cierre', async () => {
        const { r } = await escenario();
        const cierres = {};
        for (const mes of ['2026-02', '2026-03', '2026-04']) cierres[mes] = await r.inventarioAlCierre({ mes });
        const existencia = (mes, nombreProducto) => filaDe(cierres[mes], nombreProducto)?.existencia ?? '0';
        const marzo = await r.resumenMovimientos({ mes: '2026-03' });
        const abril = await r.resumenMovimientos({ mes: '2026-04' });
        expect(filaDe(marzo, 'Papa').saldoInicial).toBe(existencia('2026-02', 'Papa'));
        expect(filaDe(marzo, 'Papa').saldoFinal).toBe(existencia('2026-03', 'Papa'));
        expect(filaDe(abril, 'Papa').saldoInicial).toBe(existencia('2026-03', 'Papa'));
        expect(filaDe(abril, 'Papa').saldoFinal).toBe(existencia('2026-04', 'Papa'));
      });

      it('un producto sin movimientos en el mes pero con saldo sigue apareciendo; sin saldo ni movimientos no aparece', async () => {
        const { r } = await escenario();
        const abril = await r.resumenMovimientos({ mes: '2026-04' });
        expect(filaDe(abril, 'Arroz')).toMatchObject({ saldoInicial: '8', ingresos: '0', saldoFinal: '8', cantidadIngresos: 0, cantidadSalidas: 0, cantidadAjustes: 0 });
        const febrero = await r.resumenMovimientos({ mes: '2026-02' });
        expect(febrero.filas.map((f) => f.producto.nombre)).toEqual(['Papa']); // el arroz todavía no existía
        expect((await r.resumenMovimientos({ mes: '2025-12' })).filas).toEqual([]);
      });

      it('el saldo final del último mes es la existencia actual del producto', async () => {
        const { a, r, papa } = await escenario();
        vi.useRealTimers();
        const resumen = await r.resumenMovimientos({ mes: '2026-04' });
        expect(filaDe(resumen, 'Papa').saldoFinal).toBe((await a.inventario.obtenerExistencia(papa.id)).cantidadBase);
      });

      it('los ajustes no cuentan como ingresos ni como salidas', async () => {
        const { r, producto, ingreso, ajuste } = await conSesion();
        const papa = await producto('Papa');
        congelarReloj();
        enFecha('2026-03-05T18:00:00Z'); await ingreso(papa, '10'); await ajuste(papa, 1, '5'); await ajuste(papa, -1, '2');
        expect((await r.resumenMovimientos({ mes: '2026-03' })).filas[0]).toMatchObject({ ingresos: '10', salidas: '0', ajustes: '3', saldoFinal: '13' });
      });

      it('cada total se puede verificar con el historial de movimientos del mismo mes', async () => {
        const { a, r } = await escenario();
        const resumen = await r.resumenMovimientos({ mes: '2026-03' });
        const suma = (items, valor = (x) => Number(x.cantidadBase)) => items.reduce((t, x) => t + valor(x), 0);
        for (const f of resumen.filas) {
          const filtro = { productoId: f.producto.id, desde: '2026-03-01', hasta: '2026-03-31', tamanoPagina: 100 };
          expect(Number(f.ingresos)).toBe(suma((await a.movimientos.listarMovimientos({ ...filtro, tipo: 'ingreso' })).items));
          expect(Number(f.salidas)).toBe(suma((await a.movimientos.listarMovimientos({ ...filtro, tipo: 'salida' })).items));
          expect(Number(f.ajustes)).toBe(suma((await a.movimientos.listarMovimientos({ ...filtro, tipo: 'ajuste' })).items, (x) => x.sentido * Number(x.cantidadBase)));
        }
      });
    });

    describe('reporte mensual de compras', () => {
      it('agrupa por producto las compras del mes, con subtotales y total general', async () => {
        const { r } = await escenario();
        const marzo = await r.comprasMensuales({ mes: '2026-03' });
        expect(marzo.grupos.map((g) => g.producto.nombre)).toEqual(['Arroz', 'Papa']);
        expect(marzo.grupos[1]).toMatchObject({
          producto: { nombre: 'Papa' }, unidadBase: { abreviatura: 'kg' }, subtotalCosto: '3000.00', subtotalCantidadBase: '5', cantidadLineas: 1,
          lineas: [{
            fechaCompra: '2026-03-05', cantidad: '5', unidad: { abreviatura: 'kg' }, presentacion: null, costoUnitario: '600.00', costoTotal: '3000.00', cantidadBase: '5',
            lineaId: expect.any(String), compraId: expect.any(String),
          }],
        });
        expect(marzo.grupos[0]).toMatchObject({ producto: { nombre: 'Arroz' }, subtotalCosto: '7200.00' });
        expect(marzo).toMatchObject({ totalGeneral: '10200.00', cantidadCompras: 2, cantidadLineas: 2 });
        expect((await r.comprasMensuales({ mes: '2026-02' })).totalGeneral).toBe('5000.00');
        expect((await r.comprasMensuales({ mes: '2026-04' })).totalGeneral).toBe('4550.00');
      });

      it('el total general y cada subtotal son exactamente la suma de las líneas mostradas (con decimales)', async () => {
        const { r, producto, comprar } = await conSesion();
        const harina = await producto('Harina');
        congelarReloj();
        enFecha('2026-03-05T18:00:00Z');
        await comprar(harina, '3.5', '1250.75'); // 4377.625 → 4377.63
        await comprar(harina, '1.25', '99.99');
        const m = await r.comprasMensuales({ mes: '2026-03' });
        const grupo = m.grupos[0];
        const sumaDeLineas = grupo.lineas.reduce((t, l) => t + Math.round(Number(l.costoTotal) * 100), 0);
        expect(Math.round(Number(grupo.subtotalCosto) * 100)).toBe(sumaDeLineas);
        expect(m.totalGeneral).toBe(grupo.subtotalCosto);
        expect(grupo.subtotalCantidadBase).toBe('4.75');
        expect(grupo.cantidadLineas).toBe(2);
      });

      it('el total general coincide con el total de las compras del mes en el listado de compras', async () => {
        const { a, r } = await escenario();
        const compras = (await a.compras.listarCompras({ desde: '2026-03-01', hasta: '2026-03-31', tamanoPagina: 100 })).items;
        const enCentavos = compras.reduce((t, c) => t + Math.round(Number(c.total) * 100), 0);
        expect(Math.round(Number((await r.comprasMensuales({ mes: '2026-03' })).totalGeneral) * 100)).toBe(enCentavos);
      });

      it('el mes se cuenta por la fecha de la compra, no por el día en que se registró', async () => {
        const { r, producto, comprar } = await conSesion();
        const papa = await producto('Papa');
        congelarReloj();
        enFecha('2026-04-02T18:00:00Z');
        await comprar(papa, '5', '100', { fechaCompra: '2026-03-31' }); // registrada en abril, pero es una compra de marzo
        expect((await r.comprasMensuales({ mes: '2026-03' })).totalGeneral).toBe('500.00');
        expect((await r.comprasMensuales({ mes: '2026-04' })).grupos).toEqual([]);
        // en el inventario, en cambio, su ingreso cuenta en abril (el día en que se registró)
        expect((await r.inventarioAlCierre({ mes: '2026-03' })).filas).toEqual([]);
        expect((await r.inventarioAlCierre({ mes: '2026-04' })).filas[0]).toMatchObject({ existencia: '5' });
      });

      it('conserva la presentación usada y muestra la cantidad en la unidad base (3 cajas de 12 unidades = 36 unidades)', async () => {
        const { a, r, un, producto } = await conSesion();
        const huevos = await producto('Huevos', 'u');
        const caja = await a.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: un.u, cantidadContenida: '12' });
        congelarReloj();
        enFecha('2026-03-05T18:00:00Z');
        await a.compras.registrarCompra({
          fechaCompra: hoyEnCostaRica(), claveIdempotencia: 'compra-cajas',
          lineas: [{ productoId: huevos.id, presentacionId: caja.id, cantidad: '3', costoUnitario: '2400' }],
        });
        const [grupo] = (await r.comprasMensuales({ mes: '2026-03' })).grupos;
        expect(grupo.lineas[0]).toMatchObject({ cantidad: '3', presentacion: { nombre: 'Caja' }, cantidadBase: '36', costoTotal: '7200.00' });
        expect(grupo).toMatchObject({ unidadBase: { abreviatura: 'u' }, subtotalCantidadBase: '36' });
      });

      it('ordena las líneas de cada producto de la más antigua a la más reciente', async () => {
        const { r, producto, comprar } = await conSesion();
        const papa = await producto('Papa');
        congelarReloj();
        enFecha('2026-03-20T18:00:00Z'); await comprar(papa, '1', '100');
        enFecha('2026-03-05T18:00:00Z'); await comprar(papa, '2', '100');
        enFecha('2026-03-12T18:00:00Z'); await comprar(papa, '3', '100');
        expect((await r.comprasMensuales({ mes: '2026-03' })).grupos[0].lineas.map((l) => l.fechaCompra)).toEqual(['2026-03-05', '2026-03-12', '2026-03-20']);
      });
    });

    it('consultar los reportes no modifica nada: el inventario sigue consistente y no se crean movimientos', async () => {
      const { a, r } = await escenario();
      vi.useRealTimers();
      const antes = (await a.movimientos.listarMovimientos()).total;
      for (const mes of ['2026-02', '2026-03', '2026-04']) {
        await r.inventarioAlCierre({ mes }); await r.resumenMovimientos({ mes }); await r.comprasMensuales({ mes });
      }
      expect((await a.movimientos.listarMovimientos()).total).toBe(antes);
      expect(await a.inventario.verificarConsistencia()).toMatchObject({ consistente: true });
    });
  });
}
