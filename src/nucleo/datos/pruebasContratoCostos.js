// PRUEBAS DE CONTRATO DE GASTOS, COSTO DEL CONSUMO Y COSTOS DE ADQUISICIÓN (Versión 8)
// Cualquier adaptador (demo o de la base real) debe pasarlas.
import { describe, it, expect } from 'vitest';
import { hoyEnCostaRica } from '../../compartido/utilidades/formato.js';

export function ejecutarPruebasContratoCostos(nombre, crearAdaptador, credenciales) {
  describe(`Contrato de gastos y costos (Versión 8): ${nombre}`, () => {
    let n = 0;
    const clave = (prefijo) => `${prefijo}-${++n}-${Math.random().toString(36).slice(2, 8)}`;
    const dia = (desplazamiento) => {
      const d = new Date(`${hoyEnCostaRica()}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + desplazamiento);
      return d.toISOString().slice(0, 10);
    };

    async function preparar() {
      const a = crearAdaptador();
      const usuario = await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
      const unidades = await a.unidades.listarUnidades({ estado: 'todas' });
      const un = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
      const producto = (nombreProducto, unidad = 'kg') => a.productos.crearProducto({ nombre: nombreProducto, unidadBaseId: un[unidad].id });
      const compra = (lineas, extra = {}) => a.compras.registrarCompra({ fechaCompra: dia(-1), claveIdempotencia: clave('cmp'), lineas, ...extra });
      const gasto = (extra = {}) => a.gastos.registrarGasto({ fechaGasto: dia(0), concepto: 'Transporte', importe: '1500', claveIdempotencia: clave('gas'), ...extra });
      const ingresar = (p, cantidad) => a.inventario.registrarMovimiento({
        productoId: p.id, tipo: 'ingreso', subtipo: 'compra', cantidad, unidadId: p.unidadBaseId, claveIdempotencia: clave('ing'),
      });
      const consumo = (p, cantidad, extra = {}) => a.consumos.registrarConsumo({
        productoId: p.id, cantidad, unidadId: p.unidadBaseId, claveIdempotencia: clave('con'), ...extra,
      });
      const salida = (p, cantidad, extra = {}) => a.salidas.registrarSalida({
        productoId: p.id, cantidad, unidadId: p.unidadBaseId, motivo: 'Donación', claveIdempotencia: clave('sal'), ...extra,
      });
      return { a, usuario, un, producto, compra, gasto, ingresar, consumo, salida };
    }

    it('exige sesión en todas las operaciones', async () => {
      const a = crearAdaptador();
      const llamadas = [
        () => a.gastos.registrarGasto({}), () => a.gastos.listarGastos(), () => a.gastos.obtenerGasto('x'),
        () => a.costos.listarCostosPorProducto(), () => a.costos.historialCostosAdquisicion('x'),
        () => a.consumos.editarCostoConsumo('x', { costoImporte: '10' }),
      ];
      for (const llamar of llamadas) await expect(llamar()).rejects.toMatchObject({ codigo: 'SIN_SESION' });
    });

    // ---------------------------------------------------------------- GASTOS (RF-012)
    describe('gastos', () => {
      it('no ofrece operaciones para editar ni borrar gastos', async () => {
        const { a } = await preparar();
        for (const verbo of ['editar', 'modificar', 'actualizar', 'eliminar', 'borrar', 'anular']) expect(a.gastos[`${verbo}Gasto`]).toBeUndefined();
      });

      it('registra un gasto y se ve en la lista, con el usuario y la hora asignados por la capa de datos', async () => {
        const { a, usuario, gasto } = await preparar();
        const r = await gasto({ concepto: '  Flete   de verduras ', importe: '1250,5', nota: '  Pagado en efectivo ', registradoEn: '2000-01-01T00:00:00.000Z', usuarioId: 'otro' });
        expect(r.repetido).toBe(false);
        expect(r.gasto).toMatchObject({
          id: expect.any(String), fechaGasto: dia(0), concepto: 'Flete de verduras', importe: '1250.50', nota: 'Pagado en efectivo',
          usuarioId: usuario.id, producto: null, compra: null, relacionadoConCompra: false,
        });
        expect(Math.abs(Date.now() - Date.parse(r.gasto.registradoEn))).toBeLessThan(60_000);
        expect('claveIdempotencia' in r.gasto).toBe(false);
        const lista = await a.gastos.listarGastos();
        expect(lista.total).toBe(1);
        expect(lista.items[0]).toEqual(r.gasto);
        expect(await a.gastos.obtenerGasto(r.gasto.id)).toEqual(r.gasto);
      });

      it('un gasto puede asociarse a un producto', async () => {
        const { a, producto, gasto } = await preparar();
        const papa = await producto('Papa');
        const r = await gasto({ productoId: papa.id });
        expect(r.gasto.producto).toEqual({ id: papa.id, nombre: 'Papa' });
        expect(r.gasto.relacionadoConCompra).toBe(false);
        expect((await a.gastos.obtenerGasto(r.gasto.id)).producto.id).toBe(papa.id);
      });

      it('un gasto relacionado a una compra se identifica como relacionado y NO se suma a la compra ni a los costos', async () => {
        const { a, producto, compra, gasto, un } = await preparar();
        const papa = await producto('Papa');
        const c = await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '10', costoUnitario: '800' }]);
        const historialAntes = await a.costos.historialCostosAdquisicion(papa.id);
        const totalAntes = (await a.compras.obtenerCompra(c.compra.id)).total;
        const r = await gasto({ compraId: c.compra.id, importe: '2500', concepto: 'Flete de la compra' });
        expect(r.gasto).toMatchObject({
          relacionadoConCompra: true, compra: { id: c.compra.id, fechaCompra: c.compra.fechaCompra, total: totalAntes },
        });
        expect((await a.compras.obtenerCompra(c.compra.id)).total).toBe(totalAntes); // la compra no cambió
        expect(totalAntes).toBe('8000.00');
        expect(await a.costos.historialCostosAdquisicion(papa.id)).toEqual(historialAntes); // el costo de adquisición tampoco
      });

      it('valida la entrada y avisa todos los campos con problema a la vez, sin registrar nada', async () => {
        const { a, gasto } = await preparar();
        const casos = [
          [{ fechaGasto: '' }, 'fechaGasto'], [{ fechaGasto: '2026-13-40' }, 'fechaGasto'], [{ fechaGasto: dia(1) }, 'fechaGasto'],
          [{ concepto: '' }, 'concepto'], [{ concepto: 'ab' }, 'concepto'], [{ concepto: 'x'.repeat(121) }, 'concepto'],
          [{ importe: '' }, 'importe'], [{ importe: 0 }, 'importe'], [{ importe: '-5' }, 'importe'], [{ importe: 'abc' }, 'importe'],
          [{ importe: '10.123' }, 'importe'], [{ importe: '9999999999999' }, 'importe'],
          [{ nota: 'x'.repeat(501) }, 'nota'], [{ claveIdempotencia: '' }, 'claveIdempotencia'], [{ claveIdempotencia: 'x'.repeat(81) }, 'claveIdempotencia'],
          [{ productoId: 'no-existe' }, 'productoId'], [{ compraId: 'no-existe' }, 'compraId'],
        ];
        for (const [cambio, campo] of casos) {
          await expect(gasto(cambio)).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { [campo]: expect.any(String) } });
        }
        const varios = await a.gastos.registrarGasto({}).catch((e) => e);
        expect(Object.keys(varios.campos)).toEqual(expect.arrayContaining(['fechaGasto', 'concepto', 'importe', 'claveIdempotencia']));
        expect((await a.gastos.listarGastos()).total).toBe(0);
      });

      it('los importes son exactos: sin errores de coma flotante y siempre con 2 decimales', async () => {
        const { a, gasto } = await preparar();
        const montos = [['0,1', '0.10'], [0.2, '0.20'], ['1234567.89', '1234567.89'], [10.1, '10.10'], ['5', '5.00']];
        for (const [entrada] of montos) await gasto({ importe: entrada });
        const lista = (await a.gastos.listarGastos({ tamanoPagina: 100 })).items.map((g) => g.importe).sort();
        expect(lista).toEqual(montos.map(([, esperado]) => esperado).sort());
      });

      it('idempotencia: la misma clave dos veces registra un solo gasto; con otro gasto se rechaza', async () => {
        const { a, gasto } = await preparar();
        const k = clave('gas');
        const primero = await gasto({ claveIdempotencia: k });
        const segundo = await gasto({ claveIdempotencia: k });
        expect(segundo.repetido).toBe(true);
        expect(segundo.gasto).toEqual(primero.gasto);
        expect((await a.gastos.listarGastos()).total).toBe(1);
        await expect(gasto({ claveIdempotencia: k, importe: '9999' })).rejects.toMatchObject({ codigo: 'OPERACION_DUPLICADA' });
        await expect(gasto({ claveIdempotencia: k, nota: 'otra' })).rejects.toMatchObject({ codigo: 'OPERACION_DUPLICADA' });
        expect((await a.gastos.listarGastos()).total).toBe(1);
      });

      it('dos registros simultáneos con la misma clave crean un solo gasto', async () => {
        const { a, gasto } = await preparar();
        const k = clave('gas');
        const resultados = await Promise.allSettled([gasto({ claveIdempotencia: k }), gasto({ claveIdempotencia: k })]);
        expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);
        expect(resultados.filter((r) => r.value.repetido === false)).toHaveLength(1);
        expect((await a.gastos.listarGastos()).total).toBe(1);
      });

      it('listar: la fecha más reciente primero, filtra por fecha, producto y compra, valida y pagina', async () => {
        const { a, producto, compra, gasto, un } = await preparar();
        const papa = await producto('Papa');
        const c = await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '1', costoUnitario: '100' }]);
        await gasto({ concepto: 'Gasto uno', importe: '1', fechaGasto: dia(-5) });
        await gasto({ concepto: 'Gasto dos', importe: '2', fechaGasto: dia(0), productoId: papa.id });
        await gasto({ concepto: 'Gasto tres', importe: '3', fechaGasto: dia(-2), compraId: c.compra.id });
        const importes = (r) => r.items.map((x) => x.importe);
        const listar = (q) => a.gastos.listarGastos(q);
        expect(importes(await listar())).toEqual(['2.00', '3.00', '1.00']);
        expect(importes(await listar({ desde: dia(-3), hasta: dia(0) }))).toEqual(['2.00', '3.00']);
        expect(importes(await listar({ hasta: dia(-3) }))).toEqual(['1.00']);
        expect(importes(await listar({ productoId: papa.id }))).toEqual(['2.00']);
        expect(importes(await listar({ compraId: c.compra.id }))).toEqual(['3.00']);
        await expect(listar({ desde: dia(1), hasta: dia(0) })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { hasta: expect.any(String) } });
        await expect(listar({ desde: 'mal' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { desde: expect.any(String) } });
        await expect(listar({ productoId: 'no-existe' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(listar({ compraId: 'no-existe' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        const pagina2 = await listar({ pagina: 2, tamanoPagina: 2 });
        expect(pagina2).toMatchObject({ total: 3, pagina: 2, tamanoPagina: 2, totalPaginas: 2 });
        expect(importes(pagina2)).toEqual(['1.00']);
      });

      it('obtener un id inexistente lanza NO_ENCONTRADO, y lo devuelto son copias', async () => {
        const { a, gasto } = await preparar();
        await expect(a.gastos.obtenerGasto('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        const r = await gasto();
        r.gasto.importe = '999.00';
        r.gasto.concepto = 'alterado';
        expect((await a.gastos.obtenerGasto(r.gasto.id))).toMatchObject({ importe: '1500.00', concepto: 'Transporte' });
      });
    });

    // ---------------------------------------------------------------- COSTO DEL CONSUMO (RF-030)
    describe('costo del consumo', () => {
      it('un consumo con costo manual guarda el importe, su origen y no inventa nada más', async () => {
        const { a, producto, ingresar, consumo } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 10);
        const r = await consumo(papa, 2, { costoImporte: '1500,5' });
        expect(r.consumo).toMatchObject({ costoImporte: '1500.50', costoOrigen: 'manual', costoActualizadoEn: expect.any(String), costoCambios: [] });
        expect(r.existencia.cantidadBase).toBe('8');
        expect(await a.consumos.obtenerConsumo(r.consumo.id)).toEqual(r.consumo);
        expect((await a.consumos.listarConsumos()).items[0].costoImporte).toBe('1500.50');
      });

      it('un consumo sin costo queda como valor FALTANTE (null), nunca como cero, y nunca se deriva de un promedio', async () => {
        const { a, producto, compra, ingresar, consumo, un } = await preparar();
        const papa = await producto('Papa');
        await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '10', costoUnitario: '800' }]);
        await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '10', costoUnitario: '1000' }]);
        await ingresar(papa, 5);
        const r = await consumo(papa, 2); // hay compras con costos distintos y aun así NO se inventa un costo
        expect(r.consumo).toMatchObject({ costoImporte: null, costoOrigen: null, costoActualizadoEn: null, costoCambios: [] });
        for (const c of [r.consumo, await a.consumos.obtenerConsumo(r.consumo.id)]) expect(c.costoImporte).toBeNull();
        // un costo vacío o con espacios también es «sin costo»
        for (const vacio of ['', '   ', null, undefined]) expect((await consumo(papa, 1, { costoImporte: vacio })).consumo.costoImporte).toBeNull();
      });

      it('rechaza un costo inválido (cero, negativo, texto, más de 2 decimales, enorme) y no registra nada', async () => {
        const { a, producto, ingresar, consumo } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 10);
        for (const costoImporte of [0, '0', '-5', 'abc', '10.123', '9999999999999']) {
          await expect(consumo(papa, 1, { costoImporte })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { costoImporte: expect.any(String) } });
        }
        expect((await a.consumos.listarConsumos()).total).toBe(0);
        expect((await a.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe('10');
      });

      it('un consumo mayor a la existencia se rechaza aunque lleve costo: no queda consumo, movimiento ni costo', async () => {
        const { a, producto, ingresar, consumo } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 5);
        await expect(consumo(papa, 6, { costoImporte: '1000' })).rejects.toMatchObject({ codigo: 'VALIDACION', disponible: '5' });
        expect((await a.consumos.listarConsumos()).total).toBe(0);
        expect(await a.inventario.verificarConsistencia()).toMatchObject({ consistente: true, movimientosRevisados: 1 });
      });

      it('idempotencia: la misma clave con el mismo costo repite; con otro costo se rechaza', async () => {
        const { a, producto, ingresar, consumo } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 10);
        const k = clave('con');
        const primero = await consumo(papa, 2, { claveIdempotencia: k, costoImporte: '1000' });
        const segundo = await consumo(papa, 2, { claveIdempotencia: k, costoImporte: '1000' });
        expect(segundo.repetido).toBe(true);
        expect(segundo.consumo).toEqual(primero.consumo);
        await expect(consumo(papa, 2, { claveIdempotencia: k, costoImporte: '2000' })).rejects.toMatchObject({ codigo: 'OPERACION_DUPLICADA' });
        await expect(consumo(papa, 2, { claveIdempotencia: k })).rejects.toMatchObject({ codigo: 'OPERACION_DUPLICADA' });
        expect((await a.consumos.listarConsumos()).total).toBe(1);
        expect((await a.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe('8');
      });

      it('una salida NO tiene costo: si llega costoImporte, se ignora', async () => {
        const { a, producto, ingresar, salida } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 10);
        const r = await salida(papa, 1, { costoImporte: '1000' });
        const guardada = await a.salidas.obtenerSalida(r.salida.id);
        for (const campo of ['costoImporte', 'costoOrigen', 'costoCambios']) {
          expect(campo in r.salida).toBe(false);
          expect(campo in guardada).toBe(false);
        }
      });

      it('editarCostoConsumo: pone, cambia y quita el costo, y cada cambio queda en el historial (el valor anterior no se pierde)', async () => {
        const { a, producto, ingresar, consumo } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 10);
        const c = (await consumo(papa, 2, { nota: 'Almuerzo' })).consumo;
        const editar = (costoImporte) => a.consumos.editarCostoConsumo(c.id, { costoImporte });

        const puesto = await editar('1200');
        expect(puesto.cambiado).toBe(true);
        expect(puesto.consumo).toMatchObject({ costoImporte: '1200.00', costoOrigen: 'manual' });
        expect(puesto.consumo.costoCambios).toHaveLength(1);
        expect(puesto.consumo.costoCambios[0]).toMatchObject({ importeAnterior: null, importeNuevo: '1200.00', cambiadoEn: expect.any(String) });

        const cambiado = await editar('1350,75');
        expect(cambiado.consumo.costoImporte).toBe('1350.75');
        expect(cambiado.consumo.costoCambios.map((x) => [x.importeAnterior, x.importeNuevo])).toEqual([['1200.00', '1350.75'], [null, '1200.00']]); // más reciente primero

        const quitado = await editar('');
        expect(quitado.consumo).toMatchObject({ costoImporte: null, costoOrigen: null, costoActualizadoEn: null });
        expect(quitado.consumo.costoCambios.map((x) => x.importeNuevo)).toEqual([null, '1350.75', '1200.00']);

        const vuelto = await a.consumos.obtenerConsumo(c.id);
        expect(vuelto).toEqual(quitado.consumo);
        expect((await a.consumos.listarConsumos()).items[0].costoImporte).toBeNull();
      });

      it('editar el costo con el mismo valor no hace nada ni agrega historial', async () => {
        const { a, producto, ingresar, consumo } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 10);
        const c = (await consumo(papa, 2, { costoImporte: '1000' })).consumo;
        const igual = await a.consumos.editarCostoConsumo(c.id, { costoImporte: '1000,00' });
        expect(igual.cambiado).toBe(false);
        expect(igual.consumo.costoCambios).toEqual([]);
        const sinCosto = (await consumo(papa, 1)).consumo;
        expect((await a.consumos.editarCostoConsumo(sinCosto.id, { costoImporte: '' })).cambiado).toBe(false);
      });

      it('editar el costo no toca nada más: ni la cantidad, ni el movimiento, ni la existencia, ni la fecha, ni la nota', async () => {
        const { a, producto, ingresar, consumo } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 10);
        const original = (await consumo(papa, 2, { nota: 'Almuerzo' })).consumo;
        const antes = await a.inventario.verificarConsistencia();
        const { consumo: editado } = await a.consumos.editarCostoConsumo(original.id, { costoImporte: '999' });
        const { costoImporte, costoOrigen, costoActualizadoEn, costoCambios, ...resto } = editado; // eslint-disable-line no-unused-vars
        const { costoImporte: c1, costoOrigen: c2, costoActualizadoEn: c3, costoCambios: c4, ...restoOriginal } = original; // eslint-disable-line no-unused-vars
        expect(resto).toEqual(restoOriginal);
        expect(await a.inventario.verificarConsistencia()).toEqual(antes);
        expect((await a.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe('8');
      });

      it('editarCostoConsumo valida, y un id inexistente (o de una salida) lanza NO_ENCONTRADO', async () => {
        const { a, producto, ingresar, consumo, salida } = await preparar();
        const papa = await producto('Papa');
        await ingresar(papa, 10);
        const c = (await consumo(papa, 1)).consumo;
        for (const costoImporte of [0, '-1', 'abc', '10.123']) {
          await expect(a.consumos.editarCostoConsumo(c.id, { costoImporte })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { costoImporte: expect.any(String) } });
        }
        await expect(a.consumos.editarCostoConsumo(c.id, {})).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { costoImporte: expect.any(String) } });
        await expect(a.consumos.editarCostoConsumo(c.id)).rejects.toMatchObject({ codigo: 'VALIDACION' });
        await expect(a.consumos.editarCostoConsumo('no-existe', { costoImporte: '10' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        const s = (await salida(papa, 1)).salida;
        await expect(a.consumos.editarCostoConsumo(s.id, { costoImporte: '10' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        expect((await a.consumos.obtenerConsumo(c.id)).costoImporte).toBeNull();
      });

      it('no existe ninguna operación para editar el resto del consumo', async () => {
        const { a } = await preparar();
        for (const verbo of ['editar', 'modificar', 'actualizar', 'eliminar', 'borrar', 'anular']) expect(a.consumos[`${verbo}Consumo`]).toBeUndefined();
      });
    });

    // ---------------------------------------------------------------- COSTOS DE ADQUISICIÓN (RF-026, RNF-86)
    describe('costos de adquisición', () => {
      it('no existe ninguna operación de costo promedio (BLOQUEADO)', async () => {
        const { a } = await preparar();
        for (const operacion of ['calcularCostoPromedio', 'obtenerCostoPromedio', 'costoPromedio', 'consultarCostoPromedio', 'actualizarCostoPromedio']) {
          expect(a.costos[operacion]).toBeUndefined();
        }
      });

      it('el historial de un producto coincide EXACTAMENTE con las líneas de compra registradas', async () => {
        const { a, producto, compra, un } = await preparar();
        const papa = await producto('Papa');
        const arroz = await producto('Arroz');
        const huevos = await producto('Huevos', 'u');
        const caja = await a.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: un.u.id, cantidadContenida: '12' });
        const c1 = await compra([
          { productoId: papa.id, unidadId: un.kg.id, cantidad: '10', costoUnitario: '800' },
          { productoId: arroz.id, unidadId: un.kg.id, cantidad: '4', costoTotal: '3000' },
        ], { fechaCompra: dia(-10) });
        const c2 = await compra([{ productoId: papa.id, unidadId: un.g.id, cantidad: '500', costoUnitario: '0,9' }], { fechaCompra: dia(-3) });
        const c3 = await compra([
          { productoId: huevos.id, presentacionId: caja.id, cantidad: '3', costoUnitario: '2400' },
          { productoId: papa.id, unidadId: un.kg.id, cantidad: '2', costoTotal: '1900.55' },
        ], { fechaCompra: dia(-1) });

        // lo que registraron las compras, producto por producto
        const detalle = async (c) => (await a.compras.obtenerCompra(c.compra.id)).lineas;
        const lineasDe = async (productoId) => {
          const esperado = [];
          for (const c of [c1, c2, c3]) {
            const compraCompleta = await a.compras.obtenerCompra(c.compra.id);
            for (const l of await detalle(c)) if (l.productoId === productoId) esperado.push({ l, fecha: compraCompleta.fechaCompra, compraId: compraCompleta.id });
          }
          return esperado.sort((x, y) => y.fecha.localeCompare(x.fecha));
        };
        const forma = (x) => ({
          lineaId: x.l.id, compraId: x.compraId, fechaCompra: x.fecha, cantidad: x.l.cantidad,
          unidad: x.l.unidad, presentacion: x.l.presentacion, costoUnitario: x.l.costoUnitario, costoTotal: x.l.costoTotal,
        });

        for (const p of [papa, arroz, huevos]) {
          const historial = await a.costos.historialCostosAdquisicion(p.id);
          expect(historial.items).toEqual((await lineasDe(p.id)).map(forma));
          expect(historial.total).toBe(historial.items.length);
          expect(historial.producto).toMatchObject({ id: p.id, nombre: p.nombre });
        }
        const hp = (await a.costos.historialCostosAdquisicion(papa.id)).items;
        expect(hp.map((i) => [i.fechaCompra, i.cantidad, i.costoUnitario, i.costoTotal])).toEqual([
          [dia(-1), '2', '950.28', '1900.55'], [dia(-3), '500', '0.90', '450.00'], [dia(-10), '10', '800.00', '8000.00'],
        ]);
        const hh = (await a.costos.historialCostosAdquisicion(huevos.id)).items[0];
        expect(hh).toMatchObject({ cantidad: '3', presentacion: { nombre: 'Caja' }, costoUnitario: '2400.00', costoTotal: '7200.00' });
      });

      it('el historial es información real: no se rotula ni se calcula como promedio, ni como costo por unidad base', async () => {
        const { a, producto, compra, un } = await preparar();
        const papa = await producto('Papa');
        await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '10', costoUnitario: '800' }]);
        await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '10', costoUnitario: '1000' }]);
        const historial = await a.costos.historialCostosAdquisicion(papa.id);
        expect(JSON.stringify(historial)).not.toMatch(/promedio|ultimo|último|porUnidadBase|unitarioBase/i);
        const claves = (o) => Object.keys(o);
        expect(claves(historial.items[0]).sort()).toEqual(['cantidad', 'compraId', 'costoTotal', 'costoUnitario', 'fechaCompra', 'lineaId', 'presentacion', 'unidad']);
        expect(historial.items.map((i) => i.costoUnitario).sort()).toEqual(['1000.00', '800.00']); // ambos, sin promediar
      });

      it('un producto sin compras tiene un historial vacío (faltante, no ceros inventados)', async () => {
        const { a, producto } = await preparar();
        const papa = await producto('Papa');
        const h = await a.costos.historialCostosAdquisicion(papa.id);
        expect(h).toMatchObject({ items: [], total: 0, pagina: 1, totalPaginas: 1, producto: { id: papa.id } });
      });

      it('el historial filtra por fecha de compra, pagina, valida y rechaza un producto inexistente', async () => {
        const { a, producto, compra, un } = await preparar();
        const papa = await producto('Papa');
        for (const [d, c] of [[-9, '1'], [-6, '2'], [-3, '3'], [-1, '4']]) {
          await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: c, costoUnitario: '100' }], { fechaCompra: dia(d) });
        }
        const cantidades = (r) => r.items.map((i) => i.cantidad);
        const h = (q) => a.costos.historialCostosAdquisicion(papa.id, q);
        expect(cantidades(await h())).toEqual(['4', '3', '2', '1']);
        expect(cantidades(await h({ desde: dia(-6), hasta: dia(-3) }))).toEqual(['3', '2']);
        expect(cantidades(await h({ pagina: 2, tamanoPagina: 3 }))).toEqual(['1']);
        await expect(h({ desde: dia(0), hasta: dia(-5) })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { hasta: expect.any(String) } });
        await expect(a.costos.historialCostosAdquisicion('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('un gasto o un consumo con costo no cambian el historial de costos de adquisición', async () => {
        const { a, producto, compra, gasto, ingresar, consumo, un } = await preparar();
        const papa = await producto('Papa');
        await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '10', costoUnitario: '800' }]);
        const antes = await a.costos.historialCostosAdquisicion(papa.id);
        await gasto({ productoId: papa.id, importe: '5000' });
        await ingresar(papa, 1);
        await consumo(papa, 2, { costoImporte: '1700' });
        expect(await a.costos.historialCostosAdquisicion(papa.id)).toEqual(antes);
      });

      it('listarCostosPorProducto: por nombre, con la cantidad de líneas de compra, filtro de estado, búsqueda y paginación', async () => {
        const { a, producto, compra, un } = await preparar();
        const papa = await producto('Papa');
        const arroz = await producto('Arroz');
        const sal = await producto('Sal');
        await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '1', costoUnitario: '100' }, { productoId: arroz.id, unidadId: un.kg.id, cantidad: '1', costoUnitario: '100' }]);
        await compra([{ productoId: papa.id, unidadId: un.kg.id, cantidad: '2', costoUnitario: '110' }]);
        const lista = await a.costos.listarCostosPorProducto();
        expect(lista.items.map((i) => [i.nombre, i.lineasDeCompra])).toEqual([['Arroz', 1], ['Papa', 2], ['Sal', 0]]);
        expect(lista.items[0]).toMatchObject({ productoId: arroz.id, activo: true, unidadBase: { abreviatura: 'kg' } });
        expect(JSON.stringify(lista)).not.toMatch(/promedio/i);
        expect((await a.costos.listarCostosPorProducto({ busqueda: 'PAPÁ' })).items.map((i) => i.nombre)).toEqual(['Papa']);
        await a.productos.cambiarEstadoProducto(sal.id, false);
        expect((await a.costos.listarCostosPorProducto()).items.map((i) => i.nombre)).toEqual(['Arroz', 'Papa']);
        expect((await a.costos.listarCostosPorProducto({ estado: 'inactivos' })).items.map((i) => i.nombre)).toEqual(['Sal']);
        expect((await a.costos.listarCostosPorProducto({ estado: 'todos', pagina: 2, tamanoPagina: 2 })).items.map((i) => i.nombre)).toEqual(['Sal']);
      });
    });
  });
}
