// PRUEBAS DE CONTRATO DE MOVIMIENTOS: HISTORIAL, DETALLE Y CONSOLIDADO (Versión 7)
// Cualquier adaptador (demo o de la base real) debe pasarlas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { hoyEnCostaRica } from '../../compartido/utilidades/formato.js';

export function ejecutarPruebasContratoMovimientos(nombre, crearAdaptador, credenciales) {
  describe(`Contrato de movimientos (historial y consolidado): ${nombre}`, () => {
    afterEach(() => { vi.useRealTimers(); });
    let n = 0;

    async function conSesion() {
      const a = crearAdaptador();
      await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
      const unidades = await a.unidades.listarUnidades({ estado: 'todas' });
      const un = Object.fromEntries(unidades.map((u) => [u.abreviatura, u.id]));
      const producto = (nombreProducto, unidad = 'kg') => a.productos.crearProducto({ nombre: nombreProducto, unidadBaseId: un[unidad] });
      const movimiento = (p, extra) => a.inventario.registrarMovimiento({ productoId: p.id, unidadId: p.unidadBaseId, claveIdempotencia: `mov-${++n}`, ...extra });
      const ingreso = (p, cantidad, extra = {}) => movimiento(p, { tipo: 'ingreso', subtipo: 'compra', cantidad, ...extra });
      const ajuste = (p, sentido, cantidad) => movimiento(p, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido, cantidad });
      const salida = (p, cantidad, extra = {}) => a.salidas.registrarSalida({
        productoId: p.id, unidadId: p.unidadBaseId, cantidad, motivo: 'Donación', claveIdempotencia: `sal-${++n}`, ...extra,
      });
      const consumo = (p, cantidad, extra = {}) => a.consumos.registrarConsumo({
        productoId: p.id, unidadId: p.unidadBaseId, cantidad, claveIdempotencia: `con-${++n}`, ...extra,
      });
      return { a, m: a.movimientos, un, producto, ingreso, ajuste, salida, consumo };
    }
    // Reloj falso SOLO para la fecha: permite registrar movimientos «en otro día» sin esperar.
    const congelarReloj = () => vi.useFakeTimers({ toFake: ['Date'] });
    const enFecha = (iso) => vi.setSystemTime(new Date(iso));
    // Recorre todas las páginas de un listado.
    async function recorrer(m, consulta) {
      const items = [];
      for (let pagina = 1; ; pagina += 1) {
        const r = await m.listarMovimientos({ ...consulta, pagina, tamanoPagina: 100 });
        items.push(...r.items);
        if (pagina >= r.totalPaginas) return items;
      }
    }
    const cantidades = (items) => items.map((x) => x.cantidadBase);

    it('exige sesión en todas las operaciones', async () => {
      const a = crearAdaptador();
      const llamadas = [
        () => a.movimientos.listarMovimientos(),
        () => a.movimientos.obtenerMovimiento('x'),
        () => a.movimientos.consolidarMovimientos(),
      ];
      for (const llamar of llamadas) await expect(llamar()).rejects.toMatchObject({ codigo: 'SIN_SESION' });
    });

    it('es solo lectura: no ofrece editar ni eliminar movimientos', async () => {
      const { m } = await conSesion();
      for (const nombreOperacion of ['editarMovimiento', 'eliminarMovimiento', 'borrarMovimiento', 'anularMovimiento', 'registrarMovimiento']) {
        expect(m[nombreOperacion]).toBeUndefined();
      }
    });

    it('sin movimientos devuelve una lista y un consolidado vacíos pero válidos', async () => {
      const { m } = await conSesion();
      expect(await m.listarMovimientos()).toMatchObject({ items: [], total: 0, pagina: 1, totalPaginas: 1 });
      expect(await m.consolidarMovimientos()).toMatchObject({ filas: [], totalMovimientos: 0 });
    });

    describe('historial', () => {
      it('ordena del más reciente al más antiguo y permite invertir el orden', async () => {
        const { m, producto, ingreso, salida, consumo } = await conSesion();
        const p = await producto('Papa');
        congelarReloj();
        enFecha('2026-03-10T15:00:00Z'); await ingreso(p, '10');
        enFecha('2026-03-11T15:00:00Z'); await salida(p, '2');
        enFecha('2026-03-12T15:00:00Z'); await consumo(p, '1');
        expect((await m.listarMovimientos()).items.map((x) => x.subtipo)).toEqual(['consumo', 'salida_general', 'compra']);
        expect((await m.listarMovimientos({ orden: 'antiguo' })).items.map((x) => x.subtipo)).toEqual(['compra', 'salida_general', 'consumo']);
        expect((await m.listarMovimientos({ orden: 'inválido' })).items[0].subtipo).toBe('consumo'); // vuelve al orden por defecto
      });

      it('a igual fecha y hora, el registrado después va primero', async () => {
        const { m, producto, ingreso } = await conSesion();
        const p = await producto('Papa');
        congelarReloj();
        enFecha('2026-03-10T15:00:00Z');
        await ingreso(p, '1'); await ingreso(p, '2'); await ingreso(p, '3');
        expect(cantidades((await m.listarMovimientos()).items)).toEqual(['3', '2', '1']);
      });

      it('trae la vista completa: producto, cantidad original con su presentación, cantidad base, usuario y fecha', async () => {
        const { a, m, un, producto } = await conSesion();
        const huevos = await producto('Huevos', 'u');
        const caja = await a.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: un.u, cantidadContenida: '12' });
        await a.inventario.registrarMovimiento({
          productoId: huevos.id, tipo: 'ingreso', subtipo: 'compra', cantidad: '3', presentacionId: caja.id, claveIdempotencia: 'k-caja',
        });
        const [mov] = (await m.listarMovimientos()).items;
        expect(mov).toMatchObject({
          id: expect.any(String), tipo: 'ingreso', subtipo: 'compra', sentido: 1,
          producto: { id: huevos.id, nombre: 'Huevos' },
          cantidadOriginal: '3', unidad: { id: un.u, abreviatura: 'u' }, presentacion: { id: caja.id, nombre: 'Caja' },
          cantidadBase: '36', unidadBase: { id: un.u, abreviatura: 'u' },
          referencia: null, usuario: { id: expect.any(String) }, nota: null,
        });
        expect(Number.isNaN(Date.parse(mov.fechaHora))).toBe(false);
        expect(mov).not.toHaveProperty('claveIdempotencia');
      });

      it('clasifica por tipo: ingresos, salidas (salidas generales y consumos) y ajustes por separado', async () => {
        const { m, producto, ingreso, salida, consumo, ajuste } = await conSesion();
        const p = await producto('Papa');
        await ingreso(p, '20'); await salida(p, '3'); await consumo(p, '2'); await ajuste(p, -1, '1');
        const tipos = async (consulta) => (await m.listarMovimientos(consulta)).items.map((x) => `${x.tipo}/${x.subtipo}`).sort();
        expect(await tipos({})).toEqual(['ajuste/ajuste_conteo', 'ingreso/compra', 'salida/consumo', 'salida/salida_general']);
        expect(await tipos({ tipo: 'ingreso' })).toEqual(['ingreso/compra']);
        expect(await tipos({ tipo: 'salida' })).toEqual(['salida/consumo', 'salida/salida_general']);
        expect(await tipos({ tipo: 'ajuste' })).toEqual(['ajuste/ajuste_conteo']);
      });

      it('filtra por subtipo; un subtipo sin tipo deduce el tipo, y un subtipo que no corresponde se rechaza', async () => {
        const { m, producto, ingreso, salida, consumo } = await conSesion();
        const p = await producto('Papa');
        await ingreso(p, '20'); await salida(p, '3'); await consumo(p, '2');
        expect((await m.listarMovimientos({ subtipo: 'consumo' })).items.map((x) => x.subtipo)).toEqual(['consumo']);
        expect((await m.listarMovimientos({ tipo: 'salida', subtipo: 'salida_general' })).items.map((x) => x.subtipo)).toEqual(['salida_general']);
        expect((await m.listarMovimientos({ subtipo: 'compra' })).total).toBe(1);
        await expect(m.listarMovimientos({ tipo: 'ingreso', subtipo: 'consumo' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { subtipo: expect.any(String) } });
        await expect(m.listarMovimientos({ subtipo: 'inventado' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { subtipo: expect.any(String) } });
        await expect(m.listarMovimientos({ tipo: 'inventado' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { tipo: expect.any(String) } });
      });

      it('filtra por producto: solo sus movimientos, y un producto inactivo se sigue pudiendo consultar', async () => {
        const { a, m, producto, ingreso, salida } = await conSesion();
        const papa = await producto('Papa'); const arroz = await producto('Arroz');
        await ingreso(papa, '10'); await ingreso(arroz, '7'); await salida(papa, '2');
        const deLaPapa = await m.listarMovimientos({ productoId: papa.id });
        expect(deLaPapa.total).toBe(2);
        expect(deLaPapa.items.every((x) => x.producto.id === papa.id)).toBe(true);
        await a.productos.cambiarEstadoProducto(papa.id, false);
        expect((await m.listarMovimientos({ productoId: papa.id })).total).toBe(2); // el historial se conserva
        expect((await m.listarMovimientos()).total).toBe(3);
        await expect(m.listarMovimientos({ productoId: 'no-existe' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('filtra por fechas inclusivas contadas en hora de Costa Rica (23:30 del último día queda en ese mes)', async () => {
        const { m, producto, ingreso } = await conSesion();
        const p = await producto('Papa');
        congelarReloj();
        enFecha('2026-03-01T05:59:00Z'); await ingreso(p, '1'); // 28/02 23:59 en Costa Rica
        enFecha('2026-03-01T06:00:00Z'); await ingreso(p, '2'); // 01/03 00:00
        enFecha('2026-03-31T05:30:00Z'); await ingreso(p, '3'); // 30/03 23:30
        enFecha('2026-04-01T05:30:00Z'); await ingreso(p, '4'); // 31/03 23:30: último día de marzo
        enFecha('2026-04-01T06:00:00Z'); await ingreso(p, '5'); // 01/04 00:00
        const rango = async (desde, hasta) => cantidades((await m.listarMovimientos({ desde, hasta })).items);
        expect(await rango('2026-03-01', '2026-03-31')).toEqual(['4', '3', '2']);
        expect(await rango('2026-03-01', '2026-03-30')).toEqual(['3', '2']);
        expect(await rango('2026-03-01', '2026-03-01')).toEqual(['2']);
        expect(await rango('2026-03-31', '2026-03-31')).toEqual(['4']);
        expect(await rango('2026-04-01', '')).toEqual(['5']);
        expect(await rango('', '2026-02-28')).toEqual(['1']);
        expect(await rango('', '')).toEqual(['5', '4', '3', '2', '1']);
        expect(await rango('2027-01-01', '2027-12-31')).toEqual([]);
      });

      it('rechaza fechas inválidas o invertidas con un mensaje por campo (VALIDACION)', async () => {
        const { m } = await conSesion();
        await expect(m.listarMovimientos({ desde: '2026-02-30' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { desde: expect.any(String) } });
        await expect(m.listarMovimientos({ hasta: 'ayer' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { hasta: expect.any(String) } });
        await expect(m.listarMovimientos({ desde: '2026-03-10', hasta: '2026-03-01' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { hasta: expect.any(String) } });
      });

      it('pagina el historial sin repetir ni perder movimientos, y acota la página fuera de rango', async () => {
        const { m, producto, ingreso } = await conSesion();
        const p = await producto('Papa');
        for (const c of ['1', '2', '3', '4', '5']) await ingreso(p, c);
        const p1 = await m.listarMovimientos({ tamanoPagina: 2, pagina: 1 });
        expect(p1).toMatchObject({ total: 5, pagina: 1, tamanoPagina: 2, totalPaginas: 3 });
        const p2 = await m.listarMovimientos({ tamanoPagina: 2, pagina: 2 });
        const p3 = await m.listarMovimientos({ tamanoPagina: 2, pagina: 3 });
        expect(cantidades([...p1.items, ...p2.items, ...p3.items])).toEqual(['5', '4', '3', '2', '1']);
        expect((await m.listarMovimientos({ tamanoPagina: 2, pagina: 99 })).pagina).toBe(3);
      });

      it('cada movimiento apunta a su origen: compra, salida o consumo (y ninguno si se registró directo)', async () => {
        const { a, m, producto, ingreso, salida, consumo } = await conSesion();
        const p = await producto('Papa');
        const { compra } = await a.compras.registrarCompra({
          fechaCompra: hoyEnCostaRica(), nota: 'Feria del agricultor', claveIdempotencia: 'compra-1',
          lineas: [{ productoId: p.id, unidadId: p.unidadBaseId, cantidad: '10', costoUnitario: '500' }],
        });
        const { salida: s } = await salida(p, '2');
        const { consumo: c } = await consumo(p, '1');
        await ingreso(p, '5', { subtipo: 'inventario_inicial' });
        const referencia = async (subtipo) => (await m.listarMovimientos({ subtipo })).items[0].referencia;
        expect(await referencia('compra')).toEqual({ tipo: 'compra', id: compra.id });
        expect(await referencia('salida_general')).toEqual({ tipo: 'salida', id: s.id });
        expect(await referencia('consumo')).toEqual({ tipo: 'consumo', id: c.id });
        expect(await referencia('inventario_inicial')).toBeNull();
      });
    });

    describe('detalle de un movimiento', () => {
      it('muestra el factor y la conversión usados, el usuario y la existencia anterior y resultante', async () => {
        const { m, producto, ingreso, salida, consumo } = await conSesion();
        const papa = await producto('Papa'); const arroz = await producto('Arroz');
        await ingreso(papa, '10');
        await ingreso(arroz, '100'); // otro producto: no afecta la existencia de la papa
        await salida(papa, '4');
        await consumo(papa, '1');
        const detalleDe = async (subtipo, productoId) => {
          const { id } = (await m.listarMovimientos({ subtipo, productoId })).items[0];
          return m.obtenerMovimiento(id);
        };
        expect(await detalleDe('compra', papa.id)).toMatchObject({
          existenciaAnterior: '0', existenciaResultante: '10', cantidadBase: '10', factorAplicado: expect.any(String), redondeado: expect.any(Boolean),
          usuario: { id: expect.any(String) }, producto: { nombre: 'Papa' },
        });
        expect(await detalleDe('salida_general', papa.id)).toMatchObject({ existenciaAnterior: '10', existenciaResultante: '6', sentido: -1 });
        expect(await detalleDe('consumo', papa.id)).toMatchObject({ existenciaAnterior: '6', existenciaResultante: '5' });
        expect(await detalleDe('compra', arroz.id)).toMatchObject({ existenciaAnterior: '0', existenciaResultante: '100' });
      });

      it('conserva la presentación y la conversión usadas aunque después se cambie la equivalencia', async () => {
        const { a, m, un, producto } = await conSesion();
        const huevos = await producto('Huevos', 'u');
        const caja = await a.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: un.u, cantidadContenida: '12' });
        await a.inventario.registrarMovimiento({
          productoId: huevos.id, tipo: 'ingreso', subtipo: 'compra', cantidad: '3', presentacionId: caja.id, claveIdempotencia: 'k-caja',
        });
        const { id } = (await m.listarMovimientos()).items[0];
        const antes = await m.obtenerMovimiento(id);
        await a.presentaciones.editarPresentacion(caja.id, { nombre: 'Caja', unidadId: un.u, cantidadContenida: '30' });
        const despues = await m.obtenerMovimiento(id);
        expect(despues).toEqual(antes);
        expect(despues).toMatchObject({ cantidadOriginal: '3', cantidadBase: '36', factorAplicado: '12', presentacion: { nombre: 'Caja' } });
      });

      it('explica el origen: la compra (con su fecha y nota), la salida (con su motivo) y el consumo (con su nota)', async () => {
        const { a, m, producto, salida, consumo } = await conSesion();
        const p = await producto('Papa');
        const { compra } = await a.compras.registrarCompra({
          fechaCompra: hoyEnCostaRica(), nota: 'Feria del agricultor', claveIdempotencia: 'compra-1',
          lineas: [{ productoId: p.id, unidadId: p.unidadBaseId, cantidad: '10', costoUnitario: '500' }],
        });
        const { salida: s } = await salida(p, '2', { motivo: 'Donación a la parroquia', nota: 'Entregado el lunes' });
        const { consumo: c } = await consumo(p, '1', { nota: 'Almuerzo' });
        const origenDe = async (subtipo) => (await m.obtenerMovimiento((await m.listarMovimientos({ subtipo })).items[0].id)).origen;
        expect(await origenDe('compra')).toEqual({ tipo: 'compra', id: compra.id, fechaCompra: hoyEnCostaRica(), nota: 'Feria del agricultor' });
        expect(await origenDe('salida_general')).toEqual({ tipo: 'salida', id: s.id, motivo: 'Donación a la parroquia', nota: 'Entregado el lunes' });
        expect(await origenDe('consumo')).toEqual({ tipo: 'consumo', id: c.id, nota: 'Almuerzo' });
      });

      it('un movimiento registrado directo no tiene origen; no expone la clave de idempotencia; un id inexistente lanza NO_ENCONTRADO', async () => {
        const { m, producto, ingreso } = await conSesion();
        const p = await producto('Papa');
        await ingreso(p, '10', { nota: 'Conteo inicial' });
        const detalle = await m.obtenerMovimiento((await m.listarMovimientos()).items[0].id);
        expect(detalle.origen).toBeNull();
        expect(detalle.nota).toBe('Conteo inicial');
        expect(detalle).not.toHaveProperty('claveIdempotencia');
        await expect(m.obtenerMovimiento('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });
    });

    describe('consolidado', () => {
      async function sembrarDosProductos() {
        const c = await conSesion();
        const papa = await c.producto('Papa'); const huevos = await c.producto('Huevos', 'u');
        await c.ingreso(papa, '10'); await c.ingreso(papa, '5');
        await c.salida(papa, '3'); await c.consumo(papa, '2');
        await c.ajuste(papa, -1, '1'); await c.ajuste(papa, 1, '4');
        await c.ingreso(huevos, '7');
        return { ...c, papa, huevos };
      }

      it('suma por producto las entradas, las salidas (con consumos aparte), la diferencia y los ajustes', async () => {
        const { m } = await sembrarDosProductos();
        const r = await m.consolidarMovimientos();
        expect(r.filas.map((f) => f.producto.nombre)).toEqual(['Huevos', 'Papa']); // por nombre
        const [huevos, papa] = r.filas;
        expect(papa).toMatchObject({
          unidadBase: { abreviatura: 'kg' }, entradas: '15', salidas: '5', salidasGenerales: '3', consumos: '2', diferencia: '10', ajustes: '3',
          cantidadEntradas: 2, cantidadSalidas: 2, cantidadAjustes: 2,
        });
        expect(huevos).toMatchObject({
          unidadBase: { abreviatura: 'u' }, entradas: '7', salidas: '0', salidasGenerales: '0', consumos: '0', diferencia: '7', ajustes: '0',
          cantidadEntradas: 1, cantidadSalidas: 0, cantidadAjustes: 0,
        });
        expect(r.totalMovimientos).toBe(7);
      });

      it('los ajustes NO cuentan como entradas ni como salidas', async () => {
        const { m, producto, ingreso, ajuste } = await conSesion();
        const p = await producto('Papa');
        await ingreso(p, '10'); await ajuste(p, 1, '5'); await ajuste(p, -1, '2');
        const [fila] = (await m.consolidarMovimientos()).filas;
        expect(fila).toMatchObject({ entradas: '10', salidas: '0', diferencia: '10', ajustes: '3', cantidadAjustes: 2 });
      });

      it('cada total coincide con la suma de los movimientos que lo componen (se puede verificar abriendo el historial)', async () => {
        const { m } = await sembrarDosProductos();
        const hoy = hoyEnCostaRica();
        const suma = (items, valor = (x) => Number(x.cantidadBase)) => items.reduce((t, x) => t + valor(x), 0);
        const resultado = await m.consolidarMovimientos({ desde: hoy, hasta: hoy });
        expect(resultado.filas).toHaveLength(2);
        for (const fila of resultado.filas) {
          const filtro = { productoId: fila.producto.id, desde: hoy, hasta: hoy };
          expect(Number(fila.entradas)).toBe(suma(await recorrer(m, { ...filtro, tipo: 'ingreso' })));
          expect(Number(fila.salidas)).toBe(suma(await recorrer(m, { ...filtro, tipo: 'salida' })));
          expect(Number(fila.consumos)).toBe(suma(await recorrer(m, { ...filtro, subtipo: 'consumo' })));
          expect(Number(fila.salidasGenerales)).toBe(suma(await recorrer(m, { ...filtro, subtipo: 'salida_general' })));
          expect(Number(fila.ajustes)).toBe(suma(await recorrer(m, { ...filtro, tipo: 'ajuste' }), (x) => x.sentido * Number(x.cantidadBase)));
          expect(fila.cantidadEntradas + fila.cantidadSalidas + fila.cantidadAjustes).toBe((await recorrer(m, filtro)).length);
        }
      });

      it('respeta el período en hora de Costa Rica y no mezcla períodos', async () => {
        const { m, producto, ingreso } = await conSesion();
        const p = await producto('Papa');
        congelarReloj();
        enFecha('2026-03-31T05:30:00Z'); await ingreso(p, '3'); // 30/03 23:30
        enFecha('2026-04-01T05:30:00Z'); await ingreso(p, '4'); // 31/03 23:30: último día de marzo
        enFecha('2026-04-01T06:30:00Z'); await ingreso(p, '5'); // 01/04 00:30
        const marzo = await m.consolidarMovimientos({ desde: '2026-03-01', hasta: '2026-03-31' });
        const abril = await m.consolidarMovimientos({ desde: '2026-04-01', hasta: '2026-04-30' });
        expect(marzo.filas[0]).toMatchObject({ entradas: '7', cantidadEntradas: 2 });
        expect(abril.filas[0]).toMatchObject({ entradas: '5', cantidadEntradas: 1 });
        expect(marzo).toMatchObject({ desde: '2026-03-01', hasta: '2026-03-31', totalMovimientos: 2 });
        expect((await m.consolidarMovimientos({ desde: '2026-05-01', hasta: '2026-05-31' })).filas).toEqual([]);
      });

      it('se puede limitar a un producto; valida fechas y producto', async () => {
        const { m, papa } = await sembrarDosProductos();
        const soloPapa = await m.consolidarMovimientos({ productoId: papa.id });
        expect(soloPapa.filas.map((f) => f.producto.nombre)).toEqual(['Papa']);
        expect(soloPapa.totalMovimientos).toBe(6);
        await expect(m.consolidarMovimientos({ desde: '2026-13-01' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { desde: expect.any(String) } });
        await expect(m.consolidarMovimientos({ desde: '2026-03-10', hasta: '2026-03-01' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { hasta: expect.any(String) } });
        await expect(m.consolidarMovimientos({ productoId: 'no-existe' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('consultar el historial y el consolidado no modifica nada: el inventario sigue consistente', async () => {
        const { a, m, papa } = await sembrarDosProductos();
        const antes = (await a.inventario.obtenerExistencia(papa.id)).cantidadBase;
        const primero = (await m.listarMovimientos()).items[0];
        await m.obtenerMovimiento(primero.id);
        await m.consolidarMovimientos();
        expect((await a.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe(antes);
        expect((await m.listarMovimientos()).total).toBe(7);
        expect(await a.inventario.verificarConsistencia()).toMatchObject({ consistente: true });
      });
    });
  });
}
