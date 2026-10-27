// PRUEBAS DE CONTRATO REUTILIZABLES
// Cualquier adaptador (demo o de la base real) debe pasar estas pruebas.
// Uso: ejecutarPruebasDeContrato('mi adaptador', () => crearAdaptador(), { correo, clave }, extras);
//   extras (opcional): { crearConFalloSimulado: () => ({ adaptador, provocarFallo(), restaurar() }) }
//   Permite probar la ATOMICIDAD de registrarMovimiento: provocarFallo() hace que la próxima operación falle
//   a mitad de camino (después de insertar el movimiento, antes de confirmar). Cada adaptador sabe cómo simularlo.
import { describe, it, expect } from 'vitest';
import { validarAdaptador } from './contrato.js';
import { ErrorDatos } from './errores.js';

export function ejecutarPruebasDeContrato(nombre, crearAdaptador, credenciales, extras = {}) {
  describe(`Contrato de datos: ${nombre}`, () => {
    it('cumple la forma del contrato', () => {
      expect(() => validarAdaptador(crearAdaptador())).not.toThrow();
    });

    it('sin sesión iniciada, obtenerSesion devuelve null', async () => {
      const a = crearAdaptador();
      expect(await a.autenticacion.obtenerSesion()).toBeNull();
    });

    it('iniciarSesion con credenciales correctas devuelve el usuario y deja sesión', async () => {
      const a = crearAdaptador();
      const usuario = await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
      expect(usuario).toMatchObject({ id: expect.any(String), correo: expect.any(String), nombre: expect.any(String) });
      expect(await a.autenticacion.obtenerSesion()).toMatchObject({ id: usuario.id });
    });

    it('iniciarSesion con credenciales incorrectas lanza CREDENCIALES_INVALIDAS', async () => {
      const a = crearAdaptador();
      await expect(a.autenticacion.iniciarSesion(credenciales.correo, 'incorrecta')).rejects.toMatchObject({
        codigo: 'CREDENCIALES_INVALIDAS',
      });
      await expect(a.autenticacion.iniciarSesion(credenciales.correo, 'incorrecta')).rejects.toBeInstanceOf(ErrorDatos);
    });

    it('cerrarSesion elimina la sesión', async () => {
      const a = crearAdaptador();
      await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
      await a.autenticacion.cerrarSesion();
      expect(await a.autenticacion.obtenerSesion()).toBeNull();
    });

    it('alCambiarSesion avisa al iniciar y cerrar sesión y permite desuscribirse', async () => {
      const a = crearAdaptador();
      const eventos = [];
      const salir = a.autenticacion.alCambiarSesion((u) => eventos.push(u?.id ?? null));
      await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
      await a.autenticacion.cerrarSesion();
      expect(eventos.length).toBe(2);
      expect(eventos[1]).toBeNull();
      salir();
      await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
      expect(eventos.length).toBe(2);
    });
    describe('productos (Versión 2)', () => {
      async function conSesion() {
        const a = crearAdaptador();
        const usuario = await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
        // Desde la V3 todo producto exige unidad base: se usa la primera unidad sugerida.
        const [unidadBase] = await a.unidades.listarUnidades();
        const crear = (nombre) => a.productos.crearProducto({ nombre, unidadBaseId: unidadBase.id });
        return { a, p: a.productos, usuario, crear, unidadBase };
      }
      const nombres = (r) => r.items.map((x) => x.nombre);

      it('exige sesión en todas las operaciones', async () => {
        const a = crearAdaptador();
        const llamadas = [
          () => a.productos.crearProducto({ nombre: 'Papa' }),
          () => a.productos.editarProducto('x', { nombre: 'Papa' }),
          () => a.productos.obtenerProducto('x'),
          () => a.productos.listarProductos(),
          () => a.productos.cambiarEstadoProducto('x', false),
        ];
        for (const llamar of llamadas) {
          await expect(llamar()).rejects.toMatchObject({ codigo: 'SIN_SESION' });
        }
      });

      it('no ofrece borrado físico de productos', async () => {
        const { p, crear } = await conSesion();
        expect(p.eliminarProducto).toBeUndefined();
        expect(p.borrarProducto).toBeUndefined();
      });

      it('crea un producto activo con id, fechas, creador y su unidad base, y se puede consultar', async () => {
        const { p, usuario, crear, unidadBase } = await conSesion();
        const creado = await crear('Papa');
        expect(creado).toMatchObject({
          id: expect.any(String), nombre: 'Papa', nombreNormalizado: 'papa', activo: true,
          unidadBaseId: unidadBase.id, creadoPor: usuario.id,
        });
        expect(Number.isNaN(Date.parse(creado.creadoEn))).toBe(false);
        expect(Number.isNaN(Date.parse(creado.actualizadoEn))).toBe(false);
        expect(await p.obtenerProducto(creado.id)).toEqual(creado);
        expect(nombres(await p.listarProductos())).toEqual(['Papa']);
      });

      it('guarda el nombre sin espacios sobrantes', async () => {
        const { p, crear } = await conSesion();
        const creado = await crear('   Arroz   blanco  ');
        expect(creado.nombre).toBe('Arroz blanco');
      });

      it('rechaza nombres vacíos, demasiado cortos o demasiado largos (VALIDACION con mensaje del campo)', async () => {
        const { p, crear } = await conSesion();
        for (const nombre of ['', '   ', 'a', ' a ', 'x'.repeat(121), undefined, null, 42]) {
          await expect(crear(nombre)).rejects.toMatchObject({
            codigo: 'VALIDACION', campos: { nombre: expect.any(String) },
          });
        }
        expect((await crear('ab')).nombre).toBe('ab');
        expect((await crear('x'.repeat(120))).nombre).toHaveLength(120);
        expect((await p.listarProductos({ estado: 'todos' })).total).toBe(2);
      });

      it('rechaza nombres duplicados comparando sin mayúsculas, tildes ni espacios sobrantes', async () => {
        const { p, crear } = await conSesion();
        await crear('Papa');
        await crear('Azúcar');
        for (const repetido of [' papa ', 'PAPA', 'Pápa', 'azucar', ' AZÚCAR']) {
          await expect(crear(repetido)).rejects.toMatchObject({
            codigo: 'NOMBRE_DUPLICADO', campos: { nombre: expect.any(String) },
          });
        }
        expect((await p.listarProductos({ estado: 'todos' })).total).toBe(2);
      });

      it('un nombre repetido de un producto inactivo también se rechaza, y el mensaje lo indica', async () => {
        const { p, crear } = await conSesion();
        const papa = await crear('Papa');
        await p.cambiarEstadoProducto(papa.id, false);
        await expect(crear('papa')).rejects.toMatchObject({
          codigo: 'NOMBRE_DUPLICADO', campos: { nombre: expect.stringMatching(/inactivo/i) },
        });
      });

      it('editar el nombre conserva el id y actualiza la fecha de modificación', async () => {
        const { p, crear } = await conSesion();
        const original = await crear('Papa');
        await new Promise((r) => setTimeout(r, 5));
        const editado = await p.editarProducto(original.id, { nombre: '  Papa criolla ' });
        expect(editado.id).toBe(original.id);
        expect(editado.nombre).toBe('Papa criolla');
        expect(editado.creadoEn).toBe(original.creadoEn);
        expect(editado.actualizadoEn >= original.actualizadoEn).toBe(true);
        expect((await p.obtenerProducto(original.id)).nombre).toBe('Papa criolla');
        expect((await p.listarProductos({ estado: 'todos' })).total).toBe(1);
      });

      it('editar puede cambiar solo mayúsculas del mismo producto, pero no tomar el nombre de otro', async () => {
        const { p, crear } = await conSesion();
        const papa = await crear('papa');
        await crear('Yuca');
        expect((await p.editarProducto(papa.id, { nombre: 'Papa' })).nombre).toBe('Papa');
        await expect(p.editarProducto(papa.id, { nombre: ' yuca ' })).rejects.toMatchObject({ codigo: 'NOMBRE_DUPLICADO' });
        await expect(p.editarProducto(papa.id, { nombre: '' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
        expect((await p.obtenerProducto(papa.id)).nombre).toBe('Papa');
      });

      it('consultar, editar o cambiar el estado de un id inexistente lanza NO_ENCONTRADO', async () => {
        const { p, crear } = await conSesion();
        await expect(p.obtenerProducto('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(p.editarProducto('no-existe', { nombre: 'Papa' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(p.cambiarEstadoProducto('no-existe', false)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('desactivar saca el producto de Activos pero sigue en Inactivos y Todos; se puede reactivar', async () => {
        const { p, crear } = await conSesion();
        const papa = await crear('Papa');
        await crear('Yuca');
        const inactivo = await p.cambiarEstadoProducto(papa.id, false);
        expect(inactivo).toMatchObject({ id: papa.id, activo: false });
        expect(nombres(await p.listarProductos())).toEqual(['Yuca']);
        expect(nombres(await p.listarProductos({ estado: 'activos' }))).toEqual(['Yuca']);
        expect(nombres(await p.listarProductos({ estado: 'inactivos' }))).toEqual(['Papa']);
        expect(nombres(await p.listarProductos({ estado: 'todos' }))).toEqual(['Papa', 'Yuca']);
        expect((await p.obtenerProducto(papa.id)).activo).toBe(false); // sigue consultable
        expect((await p.cambiarEstadoProducto(papa.id, true)).activo).toBe(true);
        expect(nombres(await p.listarProductos())).toEqual(['Papa', 'Yuca']);
      });

      it('cambiarEstadoProducto exige un valor verdadero o falso', async () => {
        const { p, crear } = await conSesion();
        const papa = await crear('Papa');
        await expect(p.cambiarEstadoProducto(papa.id, 'no')).rejects.toMatchObject({ codigo: 'VALIDACION' });
      });

      it('busca sin importar mayúsculas ni tildes (azucar encuentra Azúcar) y por varias palabras', async () => {
        const { p, crear } = await conSesion();
        for (const n of ['Azúcar', 'Arroz blanco', 'Arroz integral', 'Piña']) await crear(n);
        expect(nombres(await p.listarProductos({ busqueda: 'azucar' }))).toEqual(['Azúcar']);
        expect(nombres(await p.listarProductos({ busqueda: 'AZÚCAR' }))).toEqual(['Azúcar']);
        expect(nombres(await p.listarProductos({ busqueda: 'arroz' }))).toEqual(['Arroz blanco', 'Arroz integral']);
        expect(nombres(await p.listarProductos({ busqueda: 'blanco arroz' }))).toEqual(['Arroz blanco']);
        expect(nombres(await p.listarProductos({ busqueda: 'pina' }))).toEqual(['Piña']);
        expect((await p.listarProductos({ busqueda: 'zzz' })).total).toBe(0);
      });

      it('ordena por nombre y pagina con totales correctos', async () => {
        const { p, crear } = await conSesion();
        for (const n of ['Yuca', 'Ajo', 'Zanahoria', 'Cebolla', 'Banano']) await crear(n);
        const primera = await p.listarProductos({ pagina: 1, tamanoPagina: 2 });
        expect(nombres(primera)).toEqual(['Ajo', 'Banano']);
        expect(primera).toMatchObject({ total: 5, pagina: 1, tamanoPagina: 2, totalPaginas: 3 });
        expect(nombres(await p.listarProductos({ pagina: 3, tamanoPagina: 2 }))).toEqual(['Zanahoria']);
        // una página fuera de rango se acota a la última
        expect((await p.listarProductos({ pagina: 99, tamanoPagina: 2 })).pagina).toBe(3);
      });

      it('una lista vacía devuelve una página válida', async () => {
        const { p, crear } = await conSesion();
        expect(await p.listarProductos()).toMatchObject({ items: [], total: 0, pagina: 1, totalPaginas: 1 });
      });
    });

    describe('unidades de medida (Versión 3)', () => {
      async function conSesion() {
        const a = crearAdaptador();
        const usuario = await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
        return { a, u: a.unidades, usuario };
      }
      const nombres = (lista) => lista.map((x) => x.nombre);

      it('exige sesión en todas las operaciones', async () => {
        const a = crearAdaptador();
        const llamadas = [
          () => a.unidades.crearUnidad({ nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' }),
          () => a.unidades.editarUnidad('x', { nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' }),
          () => a.unidades.obtenerUnidad('x'),
          () => a.unidades.listarUnidades(),
          () => a.unidades.cambiarEstadoUnidad('x', false),
        ];
        for (const llamar of llamadas) {
          await expect(llamar()).rejects.toMatchObject({ codigo: 'SIN_SESION' });
        }
      });

      it('no ofrece borrado físico de unidades', async () => {
        const { u } = await conSesion();
        expect(u.eliminarUnidad).toBeUndefined();
        expect(u.borrarUnidad).toBeUndefined();
      });

      it('trae las unidades sugeridas (kilogramo, gramo, litro, mililitro, unidad) marcadas como sugeridas', async () => {
        const { u } = await conSesion();
        const lista = await u.listarUnidades();
        expect(nombres(lista)).toEqual(['Gramo', 'Kilogramo', 'Litro', 'Mililitro', 'Unidad']);
        expect(lista.every((x) => x.sugerida === true && x.activo === true)).toBe(true);
        const dimensiones = Object.fromEntries(lista.map((x) => [x.abreviatura, x.dimension]));
        expect(dimensiones).toEqual({ kg: 'masa', g: 'masa', l: 'volumen', ml: 'volumen', u: 'conteo' });
      });

      it('crea una unidad activa con id, fechas y creador, y se puede consultar', async () => {
        const { u, usuario } = await conSesion();
        const creada = await u.crearUnidad({ nombre: '  Libra ', abreviatura: ' lb ', dimension: 'masa' });
        expect(creada).toMatchObject({
          id: expect.any(String), nombre: 'Libra', abreviatura: 'lb', dimension: 'masa',
          activo: true, sugerida: false, creadoPor: usuario.id,
        });
        expect(Number.isNaN(Date.parse(creada.creadoEn))).toBe(false);
        expect(await u.obtenerUnidad(creada.id)).toEqual(creada);
        expect(nombres(await u.listarUnidades())).toContain('Libra');
      });

      it('rechaza datos inválidos con el mensaje en el campo que corresponde', async () => {
        const { u } = await conSesion();
        const casos = [
          [{ nombre: '', abreviatura: 'x', dimension: 'masa' }, 'nombre'],
          [{ nombre: 'a', abreviatura: 'x', dimension: 'masa' }, 'nombre'],
          [{ nombre: 'x'.repeat(41), abreviatura: 'x', dimension: 'masa' }, 'nombre'],
          [{ nombre: 'Libra', abreviatura: '', dimension: 'masa' }, 'abreviatura'],
          [{ nombre: 'Libra', abreviatura: 'x'.repeat(11), dimension: 'masa' }, 'abreviatura'],
          [{ nombre: 'Libra', abreviatura: 'lb', dimension: 'peso' }, 'dimension'],
          [{ nombre: 'Libra', abreviatura: 'lb' }, 'dimension'],
          [{}, 'nombre'],
        ];
        for (const [entrada, campo] of casos) {
          await expect(u.crearUnidad(entrada)).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { [campo]: expect.any(String) } });
        }
        expect((await u.listarUnidades({ estado: 'todas' })).length).toBe(5); // solo las sugeridas
      });

      it('rechaza nombres o abreviaturas repetidos sin importar mayúsculas, tildes ni espacios', async () => {
        const { u } = await conSesion();
        await expect(u.crearUnidad({ nombre: ' KILOGRAMO ', abreviatura: 'kilo', dimension: 'masa' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { nombre: expect.any(String) } });
        await expect(u.crearUnidad({ nombre: 'Kilo', abreviatura: 'KG', dimension: 'masa' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { abreviatura: expect.any(String) } });
        await u.crearUnidad({ nombre: 'Tazón', abreviatura: 'tz', dimension: 'volumen' });
        await expect(u.crearUnidad({ nombre: 'tazon', abreviatura: 'tzz', dimension: 'volumen' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { nombre: expect.any(String) } });
        expect((await u.listarUnidades({ estado: 'todas' })).length).toBe(6);
      });

      it('un nombre repetido de una unidad inactiva también se rechaza, y el mensaje lo indica', async () => {
        const { u } = await conSesion();
        const gramo = (await u.listarUnidades()).find((x) => x.abreviatura === 'g');
        await u.cambiarEstadoUnidad(gramo.id, false);
        await expect(u.crearUnidad({ nombre: 'gramo', abreviatura: 'gr', dimension: 'masa' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { nombre: expect.stringMatching(/inactiva/i) } });
      });

      it('editar conserva el id, permite cambiar solo mayúsculas y no toma el nombre de otra unidad', async () => {
        const { u } = await conSesion();
        const original = await u.crearUnidad({ nombre: 'libra', abreviatura: 'lb', dimension: 'masa' });
        await new Promise((r) => setTimeout(r, 5));
        const editada = await u.editarUnidad(original.id, { nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' });
        expect(editada).toMatchObject({ id: original.id, nombre: 'Libra', creadoEn: original.creadoEn });
        expect(editada.actualizadoEn >= original.actualizadoEn).toBe(true);
        await expect(u.editarUnidad(original.id, { nombre: 'gramo', abreviatura: 'lb', dimension: 'masa' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { nombre: expect.any(String) } });
        await expect(u.editarUnidad(original.id, { nombre: 'Libra', abreviatura: 'KG', dimension: 'masa' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { abreviatura: expect.any(String) } });
        expect((await u.obtenerUnidad(original.id)).abreviatura).toBe('lb');
      });

      it('las unidades sugeridas se pueden editar (el hogar puede modificarlas) y conservan la marca de sugerida', async () => {
        const { u } = await conSesion();
        const unidad = (await u.listarUnidades()).find((x) => x.abreviatura === 'u');
        const editada = await u.editarUnidad(unidad.id, { nombre: 'Unidad suelta', abreviatura: 'u', dimension: 'conteo' });
        expect(editada).toMatchObject({ id: unidad.id, nombre: 'Unidad suelta', sugerida: true });
      });

      it('consultar, editar o cambiar el estado de un id inexistente lanza NO_ENCONTRADO', async () => {
        const { u } = await conSesion();
        await expect(u.obtenerUnidad('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(u.editarUnidad('no-existe', { nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(u.cambiarEstadoUnidad('no-existe', false)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('desactivar saca la unidad de Activas pero sigue en Inactivas y Todas; se puede reactivar', async () => {
        const { u } = await conSesion();
        const litro = (await u.listarUnidades()).find((x) => x.abreviatura === 'l');
        expect(await u.cambiarEstadoUnidad(litro.id, false)).toMatchObject({ id: litro.id, activo: false });
        expect(nombres(await u.listarUnidades())).not.toContain('Litro');
        expect(nombres(await u.listarUnidades({ estado: 'inactivas' }))).toEqual(['Litro']);
        expect(nombres(await u.listarUnidades({ estado: 'todas' }))).toContain('Litro');
        expect((await u.obtenerUnidad(litro.id)).activo).toBe(false); // sigue consultable
        expect((await u.cambiarEstadoUnidad(litro.id, true)).activo).toBe(true);
        expect(nombres(await u.listarUnidades())).toContain('Litro');
        await expect(u.cambiarEstadoUnidad(litro.id, 'no')).rejects.toMatchObject({ codigo: 'VALIDACION' });
      });
    });

    describe('unidad base del producto (Versión 3)', () => {
      async function conSesion() {
        const a = crearAdaptador();
        await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
        const unidades = await a.unidades.listarUnidades();
        const porAbrev = Object.fromEntries(unidades.map((x) => [x.abreviatura, x]));
        return { a, p: a.productos, u: a.unidades, porAbrev };
      }

      it('crear un producto exige una unidad base existente y activa', async () => {
        const { p, u, porAbrev } = await conSesion();
        await expect(p.crearProducto({ nombre: 'Papa' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadBaseId: expect.any(String) } });
        await expect(p.crearProducto({ nombre: 'Papa', unidadBaseId: '' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadBaseId: expect.any(String) } });
        await expect(p.crearProducto({ nombre: 'Papa', unidadBaseId: 'no-existe' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadBaseId: expect.stringMatching(/no existe/i) } });
        await u.cambiarEstadoUnidad(porAbrev.g.id, false);
        await expect(p.crearProducto({ nombre: 'Papa', unidadBaseId: porAbrev.g.id })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadBaseId: expect.stringMatching(/inactiva/i) } });
        expect((await p.listarProductos({ estado: 'todos' })).total).toBe(0);
      });

      it('informa a la vez los errores del nombre y de la unidad base', async () => {
        const { p } = await conSesion();
        await expect(p.crearProducto({ nombre: '', unidadBaseId: undefined })).rejects.toMatchObject({
          codigo: 'VALIDACION', campos: { nombre: expect.any(String), unidadBaseId: expect.any(String) },
        });
      });

      it('guarda la unidad base elegida', async () => {
        const { p, porAbrev } = await conSesion();
        const papa = await p.crearProducto({ nombre: 'Papa', unidadBaseId: porAbrev.kg.id });
        expect(papa.unidadBaseId).toBe(porAbrev.kg.id);
        expect((await p.obtenerProducto(papa.id)).unidadBaseId).toBe(porAbrev.kg.id);
      });

      it('editar sin enviar unidadBaseId la conserva; enviándola se valida y se cambia', async () => {
        const { p, porAbrev } = await conSesion();
        const papa = await p.crearProducto({ nombre: 'Papa', unidadBaseId: porAbrev.kg.id });
        expect((await p.editarProducto(papa.id, { nombre: 'Papa criolla' })).unidadBaseId).toBe(porAbrev.kg.id);
        expect((await p.editarProducto(papa.id, { nombre: 'Papa criolla', unidadBaseId: porAbrev.g.id })).unidadBaseId).toBe(porAbrev.g.id);
        await expect(p.editarProducto(papa.id, { nombre: 'Papa criolla', unidadBaseId: '' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadBaseId: expect.any(String) } });
        await expect(p.editarProducto(papa.id, { nombre: 'Papa criolla', unidadBaseId: 'no-existe' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
        expect((await p.obtenerProducto(papa.id)).unidadBaseId).toBe(porAbrev.g.id);
      });

      it('un producto puede conservar su unidad base aunque la unidad se desactive, pero no elegir otra inactiva', async () => {
        const { p, u, porAbrev } = await conSesion();
        const papa = await p.crearProducto({ nombre: 'Papa', unidadBaseId: porAbrev.kg.id });
        await u.cambiarEstadoUnidad(porAbrev.kg.id, false);
        expect((await p.editarProducto(papa.id, { nombre: 'Papa', unidadBaseId: porAbrev.kg.id })).unidadBaseId).toBe(porAbrev.kg.id);
        await u.cambiarEstadoUnidad(porAbrev.g.id, false);
        await expect(p.editarProducto(papa.id, { nombre: 'Papa', unidadBaseId: porAbrev.g.id })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadBaseId: expect.stringMatching(/inactiva/i) } });
      });

      it('una unidad usada como base de un producto ya no puede cambiar de dimensión', async () => {
        const { p, u, porAbrev } = await conSesion();
        const libre = await u.crearUnidad({ nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' });
        // sin uso: se puede cambiar
        expect((await u.editarUnidad(libre.id, { nombre: 'Libra', abreviatura: 'lb', dimension: 'volumen' })).dimension).toBe('volumen');
        await p.crearProducto({ nombre: 'Aceite', unidadBaseId: libre.id });
        await expect(u.editarUnidad(libre.id, { nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { dimension: expect.stringMatching(/ya se usa/i) } });
        // cambiar el nombre sí se puede
        expect((await u.editarUnidad(libre.id, { nombre: 'Libra inglesa', abreviatura: 'lb', dimension: 'volumen' })).nombre).toBe('Libra inglesa');
        expect(porAbrev.kg).toBeDefined();
      });

      it('listarProductos con soloCompletos deja fuera a los productos sin unidad base', async () => {
        const { p, porAbrev } = await conSesion();
        await p.crearProducto({ nombre: 'Papa', unidadBaseId: porAbrev.kg.id });
        const lista = await p.listarProductos({ soloCompletos: true });
        expect(lista.items.map((x) => x.nombre)).toEqual(['Papa']);
      });
    });

    describe('presentaciones de un producto (Versión 3)', () => {
      async function conSesion() {
        const a = crearAdaptador();
        const usuario = await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
        const unidades = await a.unidades.listarUnidades();
        const porAbrev = Object.fromEntries(unidades.map((x) => [x.abreviatura, x]));
        const leche = await a.productos.crearProducto({ nombre: 'Leche', unidadBaseId: porAbrev.l.id });
        const huevos = await a.productos.crearProducto({ nombre: 'Huevos', unidadBaseId: porAbrev.u.id });
        return { a, pr: a.presentaciones, usuario, porAbrev, leche, huevos };
      }
      const nombres = (lista) => lista.map((x) => x.nombre);

      it('exige sesión en todas las operaciones', async () => {
        const a = crearAdaptador();
        const entrada = { nombre: 'Caja', unidadId: 'x', cantidadContenida: '12' };
        const llamadas = [
          () => a.presentaciones.crearPresentacion('p', entrada),
          () => a.presentaciones.editarPresentacion('x', entrada),
          () => a.presentaciones.obtenerPresentacion('x'),
          () => a.presentaciones.listarPresentaciones('p'),
          () => a.presentaciones.cambiarEstadoPresentacion('x', false),
        ];
        for (const llamar of llamadas) await expect(llamar()).rejects.toMatchObject({ codigo: 'SIN_SESION' });
      });

      it('no ofrece borrado físico de presentaciones', async () => {
        const { pr } = await conSesion();
        expect(pr.eliminarPresentacion).toBeUndefined();
        expect(pr.borrarPresentacion).toBeUndefined();
      });

      it('crea una presentación activa (Caja de 12 unidades) con id, fechas y creador, y se puede consultar', async () => {
        const { pr, usuario, huevos, porAbrev } = await conSesion();
        const caja = await pr.crearPresentacion(huevos.id, { nombre: '  Caja ', unidadId: porAbrev.u.id, cantidadContenida: '12' });
        expect(caja).toMatchObject({
          id: expect.any(String), productoId: huevos.id, nombre: 'Caja', unidadId: porAbrev.u.id,
          cantidadContenida: '12', activo: true, creadoPor: usuario.id,
        });
        expect(Number.isNaN(Date.parse(caja.creadoEn))).toBe(false);
        expect(await pr.obtenerPresentacion(caja.id)).toEqual(caja);
        expect(nombres(await pr.listarPresentaciones(huevos.id))).toEqual(['Caja']);
      });

      it('cada producto tiene sus propias presentaciones: dos cajas del mismo nombre pueden contener distinto', async () => {
        const { pr, huevos, leche, porAbrev } = await conSesion();
        await pr.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' });
        const cajaLeche = await pr.crearPresentacion(leche.id, { nombre: 'Caja', unidadId: porAbrev.l.id, cantidadContenida: '12' });
        expect(cajaLeche.productoId).toBe(leche.id);
        expect(await pr.listarPresentaciones(leche.id)).toHaveLength(1);
        expect(await pr.listarPresentaciones(huevos.id)).toHaveLength(1);
      });

      it('acepta fracciones con coma o punto (hasta 4 decimales) y las guarda exactas', async () => {
        const { pr, leche, porAbrev } = await conSesion();
        const bolsa = await pr.crearPresentacion(leche.id, { nombre: 'Bolsa', unidadId: porAbrev.ml.id, cantidadContenida: '900,5' });
        expect(bolsa.cantidadContenida).toBe('900.5');
        const caja = await pr.crearPresentacion(leche.id, { nombre: 'Caja', unidadId: porAbrev.l.id, cantidadContenida: '0.1234' });
        expect(caja.cantidadContenida).toBe('0.1234');
      });

      it('rechaza datos inválidos con el mensaje en el campo que corresponde', async () => {
        const { pr, huevos, porAbrev } = await conSesion();
        const ok = { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' };
        const casos = [
          [{ ...ok, nombre: '' }, 'nombre'], [{ ...ok, nombre: 'a' }, 'nombre'], [{ ...ok, nombre: 'x'.repeat(61) }, 'nombre'],
          [{ ...ok, unidadId: '' }, 'unidadId'], [{ ...ok, unidadId: undefined }, 'unidadId'], [{ ...ok, unidadId: 'no-existe' }, 'unidadId'],
          [{ ...ok, cantidadContenida: '' }, 'cantidadContenida'], [{ ...ok, cantidadContenida: 'doce' }, 'cantidadContenida'],
          [{ ...ok, cantidadContenida: '0' }, 'cantidadContenida'], [{ ...ok, cantidadContenida: '-3' }, 'cantidadContenida'],
          [{ ...ok, cantidadContenida: '1.12345' }, 'cantidadContenida'], [{ ...ok, cantidadContenida: '1e3' }, 'cantidadContenida'],
          [{ ...ok, cantidadContenida: '99999999999' }, 'cantidadContenida'],
        ];
        for (const [entrada, campo] of casos) {
          await expect(pr.crearPresentacion(huevos.id, entrada)).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { [campo]: expect.any(String) } });
        }
        expect(await pr.listarPresentaciones(huevos.id, { estado: 'todas' })).toHaveLength(0);
      });

      it('informa a la vez todos los errores del formulario', async () => {
        const { pr, huevos } = await conSesion();
        await expect(pr.crearPresentacion(huevos.id, {})).rejects.toMatchObject({
          codigo: 'VALIDACION',
          campos: { nombre: expect.any(String), unidadId: expect.any(String), cantidadContenida: expect.any(String) },
        });
      });

      it('rechaza una unidad inactiva para una presentación nueva', async () => {
        const { a, pr, huevos, porAbrev } = await conSesion();
        await a.unidades.cambiarEstadoUnidad(porAbrev.g.id, false);
        await expect(pr.crearPresentacion(huevos.id, { nombre: 'Bolsa', unidadId: porAbrev.g.id, cantidadContenida: '500' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadId: expect.stringMatching(/inactiva/i) } });
      });

      it('rechaza nombres repetidos dentro del mismo producto (sin mayúsculas, tildes ni espacios), también inactivos', async () => {
        const { pr, huevos, porAbrev } = await conSesion();
        const caja = await pr.crearPresentacion(huevos.id, { nombre: 'Cajón', unidadId: porAbrev.u.id, cantidadContenida: '30' });
        for (const repetido of ['cajon', ' CAJÓN ']) {
          await expect(pr.crearPresentacion(huevos.id, { nombre: repetido, unidadId: porAbrev.u.id, cantidadContenida: '12' }))
            .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { nombre: expect.any(String) } });
        }
        await pr.cambiarEstadoPresentacion(caja.id, false);
        await expect(pr.crearPresentacion(huevos.id, { nombre: 'cajon', unidadId: porAbrev.u.id, cantidadContenida: '12' }))
          .rejects.toMatchObject({ campos: { nombre: expect.stringMatching(/inactiva/i) } });
        expect(await pr.listarPresentaciones(huevos.id, { estado: 'todas' })).toHaveLength(1);
      });

      it('crear en un producto inexistente lanza NO_ENCONTRADO', async () => {
        const { pr, porAbrev } = await conSesion();
        await expect(pr.crearPresentacion('no-existe', { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' }))
          .rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(pr.listarPresentaciones('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('editar conserva id y producto, valida igual que al crear y no toma el nombre de otra presentación', async () => {
        const { pr, huevos, porAbrev } = await conSesion();
        const caja = await pr.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' });
        await pr.crearPresentacion(huevos.id, { nombre: 'Cartón', unidadId: porAbrev.u.id, cantidadContenida: '30' });
        await new Promise((r) => setTimeout(r, 5));
        const editada = await pr.editarPresentacion(caja.id, { nombre: 'Caja grande', unidadId: porAbrev.u.id, cantidadContenida: '18' });
        expect(editada).toMatchObject({ id: caja.id, productoId: huevos.id, nombre: 'Caja grande', cantidadContenida: '18', creadoEn: caja.creadoEn });
        expect(editada.actualizadoEn >= caja.actualizadoEn).toBe(true);
        await expect(pr.editarPresentacion(caja.id, { nombre: 'carton', unidadId: porAbrev.u.id, cantidadContenida: '18' })).rejects.toMatchObject({ campos: { nombre: expect.any(String) } });
        await expect(pr.editarPresentacion(caja.id, { nombre: 'Caja grande', unidadId: porAbrev.u.id, cantidadContenida: '0' })).rejects.toMatchObject({ campos: { cantidadContenida: expect.any(String) } });
        expect((await pr.obtenerPresentacion(caja.id)).cantidadContenida).toBe('18');
        // se puede conservar una unidad que luego se desactivó
        await pr.editarPresentacion(caja.id, { nombre: 'Caja grande', unidadId: porAbrev.u.id, cantidadContenida: '20' });
      });

      it('conserva la unidad de la presentación aunque se desactive, pero no permite elegir otra inactiva', async () => {
        const { a, pr, huevos, porAbrev } = await conSesion();
        const caja = await pr.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' });
        await a.unidades.cambiarEstadoUnidad(porAbrev.u.id, false);
        expect((await pr.editarPresentacion(caja.id, { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '15' })).cantidadContenida).toBe('15');
        await a.unidades.cambiarEstadoUnidad(porAbrev.g.id, false);
        await expect(pr.editarPresentacion(caja.id, { nombre: 'Caja', unidadId: porAbrev.g.id, cantidadContenida: '15' }))
          .rejects.toMatchObject({ campos: { unidadId: expect.stringMatching(/inactiva/i) } });
      });

      it('consultar, editar o cambiar el estado de un id inexistente lanza NO_ENCONTRADO', async () => {
        const { pr, porAbrev } = await conSesion();
        await expect(pr.obtenerPresentacion('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(pr.editarPresentacion('no-existe', { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(pr.cambiarEstadoPresentacion('no-existe', false)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('desactivar la saca de Activas pero sigue en Inactivas y Todas; se puede reactivar', async () => {
        const { pr, huevos, porAbrev } = await conSesion();
        const caja = await pr.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' });
        await pr.crearPresentacion(huevos.id, { nombre: 'Cartón', unidadId: porAbrev.u.id, cantidadContenida: '30' });
        expect(await pr.cambiarEstadoPresentacion(caja.id, false)).toMatchObject({ id: caja.id, activo: false });
        expect(nombres(await pr.listarPresentaciones(huevos.id))).toEqual(['Cartón']);
        expect(nombres(await pr.listarPresentaciones(huevos.id, { estado: 'inactivas' }))).toEqual(['Caja']);
        expect(nombres(await pr.listarPresentaciones(huevos.id, { estado: 'todas' }))).toEqual(['Caja', 'Cartón']);
        expect((await pr.obtenerPresentacion(caja.id)).activo).toBe(false);
        expect((await pr.cambiarEstadoPresentacion(caja.id, true)).activo).toBe(true);
        await expect(pr.cambiarEstadoPresentacion(caja.id, 'no')).rejects.toMatchObject({ codigo: 'VALIDACION' });
      });

      it('una unidad usada por una presentación ya no puede cambiar de dimensión', async () => {
        const { a, pr, huevos } = await conSesion();
        const libre = await a.unidades.crearUnidad({ nombre: 'Docena', abreviatura: 'doc', dimension: 'conteo' });
        await pr.crearPresentacion(huevos.id, { nombre: 'Cartón', unidadId: libre.id, cantidadContenida: '2' });
        await expect(a.unidades.editarUnidad(libre.id, { nombre: 'Docena', abreviatura: 'doc', dimension: 'masa' }))
          .rejects.toMatchObject({ codigo: 'VALIDACION', campos: { dimension: expect.stringMatching(/ya se usa/i) } });
      });
    });

    describe('conversiones y convertir (Versión 3)', () => {
      async function conSesion() {
        const a = crearAdaptador();
        await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
        const unidades = await a.unidades.listarUnidades();
        const un = Object.fromEntries(unidades.map((x) => [x.abreviatura, x]));
        const papa = await a.productos.crearProducto({ nombre: 'Papa', unidadBaseId: un.kg.id });
        const huevos = await a.productos.crearProducto({ nombre: 'Huevos', unidadBaseId: un.u.id });
        const aceite = await a.productos.crearProducto({ nombre: 'Aceite', unidadBaseId: un.l.id });
        return { a, c: a.conversiones, un, papa, huevos, aceite };
      }

      it('exige sesión en todas las operaciones', async () => {
        const a = crearAdaptador();
        const llamadas = [
          () => a.conversiones.crearConversion({ unidadOrigenId: 'a', unidadDestinoId: 'b', factor: '2' }),
          () => a.conversiones.cambiarFactorConversion('x', '2'),
          () => a.conversiones.retirarConversion('x'),
          () => a.conversiones.obtenerConversion('x'),
          () => a.conversiones.listarConversiones(),
          () => a.conversiones.convertir('p', '1', 'a', 'b'),
        ];
        for (const llamar of llamadas) await expect(llamar()).rejects.toMatchObject({ codigo: 'SIN_SESION' });
      });

      it('trae las equivalencias generales sugeridas kg↔g y l↔ml como filas explícitas', async () => {
        const { c, un } = await conSesion();
        const generales = await c.listarConversiones();
        expect(generales).toHaveLength(2);
        expect(generales.every((x) => x.productoId === null && x.vigente && x.sugerida)).toBe(true);
        const par = (x) => `${x.unidadOrigenId === un.kg.id ? 'kg' : x.unidadOrigenId === un.l.id ? 'l' : '?'}→${x.factor}`;
        expect(generales.map(par).sort()).toEqual(['kg→1000', 'l→1000']);
      });

      it('convierte con la equivalencia general: 1,5 kg = 1500 g, y en sentido contrario 1500 g = 1,5 kg', async () => {
        const { c, un, papa } = await conSesion();
        const ida = await c.convertir(papa.id, '1,5', un.kg.id, un.g.id);
        expect(ida).toMatchObject({ cantidad: '1500', factor: '1000', redondeado: false, conversionId: expect.any(String) });
        const vuelta = await c.convertir(papa.id, '1500', un.g.id, un.kg.id);
        expect(vuelta).toMatchObject({ cantidad: '1.5', factor: '0.001', conversionId: ida.conversionId });
        expect((await c.convertir(papa.id, '2.5', un.l.id, un.ml.id)).cantidad).toBe('2500');
      });

      it('la misma unidad no necesita equivalencia (factor 1, sin conversión)', async () => {
        const { c, un, papa } = await conSesion();
        expect(await c.convertir(papa.id, '3', un.kg.id, un.kg.id)).toMatchObject({ cantidad: '3', factor: '1', conversionId: null });
      });

      it('una presentación convierte con su contenido: 3 cajas de 12 unidades = 36 unidades', async () => {
        const { a, c, un, huevos } = await conSesion();
        const caja = await a.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: un.u.id, cantidadContenida: '12' });
        const r = await c.convertir(huevos.id, '3', { presentacionId: caja.id }, un.u.id);
        expect(r).toMatchObject({ cantidad: '36', factor: '12', presentacionOrigenId: caja.id, presentacionDestinoId: null, conversionId: null });
        // y al revés: 36 unidades = 3 cajas
        expect((await c.convertir(huevos.id, '36', un.u.id, { presentacionId: caja.id })).cantidad).toBe('3');
      });

      it('una presentación en otra unidad combina contenido y equivalencia: 2 bolsas de 900 ml = 1,8 l', async () => {
        const { a, c, un, aceite } = await conSesion();
        const bolsa = await a.presentaciones.crearPresentacion(aceite.id, { nombre: 'Bolsa', unidadId: un.ml.id, cantidadContenida: '900' });
        const r = await c.convertir(aceite.id, '2', { presentacionId: bolsa.id }, un.l.id);
        expect(r).toMatchObject({ cantidad: '1.8', factor: '0.9', conversionId: expect.any(String) });
      });

      it('una presentación de otro producto o inactiva se rechaza', async () => {
        const { a, c, un, huevos, papa } = await conSesion();
        const caja = await a.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: un.u.id, cantidadContenida: '12' });
        await expect(c.convertir(papa.id, '1', { presentacionId: caja.id }, un.u.id)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await a.presentaciones.cambiarEstadoPresentacion(caja.id, false);
        await expect(c.convertir(huevos.id, '1', { presentacionId: caja.id }, un.u.id)).rejects.toMatchObject({ codigo: 'VALIDACION' });
      });

      it('sin equivalencia configurada lanza ConversionNoConfigurada (nunca asume una)', async () => {
        const { a, c, un, papa } = await conSesion();
        const libra = await a.unidades.crearUnidad({ nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' });
        const error = await c.convertir(papa.id, '1', un.kg.id, libra.id).catch((e) => e);
        expect(error).toMatchObject({ codigo: 'CONVERSION_NO_CONFIGURADA', name: 'ConversionNoConfigurada' });
        expect(error.mensajeUsuario).toMatch(/equivalencia/i);
      });

      it('convertir entre dimensiones distintas (litros a kilogramos) se rechaza sin equivalencia del producto', async () => {
        const { c, un, aceite } = await conSesion();
        await expect(c.convertir(aceite.id, '1', un.l.id, un.kg.id)).rejects.toMatchObject({ codigo: 'UNIDAD_INCOMPATIBLE' });
        await expect(c.convertir(aceite.id, '1', un.u.id, un.g.id)).rejects.toMatchObject({ codigo: 'UNIDAD_INCOMPATIBLE' });
      });

      it('una equivalencia del producto puede cruzar dimensiones y solo vale para ese producto', async () => {
        const { c, un, aceite, papa } = await conSesion();
        await c.crearConversion({ productoId: aceite.id, unidadOrigenId: un.l.id, unidadDestinoId: un.kg.id, factor: '0,92' });
        expect((await c.convertir(aceite.id, '2', un.l.id, un.kg.id)).cantidad).toBe('1.84');
        await expect(c.convertir(papa.id, '2', un.l.id, un.kg.id)).rejects.toMatchObject({ codigo: 'UNIDAD_INCOMPATIBLE' });
      });

      it('la equivalencia del producto tiene prioridad sobre la general', async () => {
        const { c, un, papa } = await conSesion();
        await c.crearConversion({ productoId: papa.id, unidadOrigenId: un.kg.id, unidadDestinoId: un.g.id, factor: '980' });
        expect((await c.convertir(papa.id, '1', un.kg.id, un.g.id)).cantidad).toBe('980');
      });

      it('redondea a 4 decimales e informa cuando lo hizo', async () => {
        const { c, un, papa } = await conSesion();
        const r = await c.convertir(papa.id, '1', un.g.id, un.kg.id);
        expect(r).toMatchObject({ cantidad: '0.001', redondeado: false });
        const tercio = await c.crearConversion({ productoId: papa.id, unidadOrigenId: un.u.id, unidadDestinoId: un.kg.id, factor: '0.333333' });
        const r2 = await c.convertir(papa.id, '1.5', un.u.id, un.kg.id);
        expect(r2).toMatchObject({ cantidad: '0.5', redondeado: true }); // 1,5 × 0,333333 = 0,4999995
        const r3 = await c.convertir(papa.id, '0.0001', un.u.id, un.kg.id);
        expect(r3).toMatchObject({ cantidad: '0', redondeado: true });
        expect(tercio.factor).toBe('0.333333');
      });

      it('rechaza cantidades inválidas, unidades o producto inexistentes', async () => {
        const { c, un, papa } = await conSesion();
        for (const mala of ['', 'tres', '0', '-1', '1e3']) {
          await expect(c.convertir(papa.id, mala, un.kg.id, un.g.id)).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { cantidad: expect.any(String) } });
        }
        await expect(c.convertir(papa.id, '1', 'no-existe', un.g.id)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(c.convertir('no-existe', '1', un.kg.id, un.g.id)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('crea una equivalencia general entre unidades que miden lo mismo y la deja vigente', async () => {
        const { c, a, un } = await conSesion();
        const libra = await a.unidades.crearUnidad({ nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' });
        const nueva = await c.crearConversion({ unidadOrigenId: libra.id, unidadDestinoId: un.g.id, factor: ' 453,592 ' });
        expect(nueva).toMatchObject({ id: expect.any(String), productoId: null, factor: '453.592', vigente: true, sugerida: false });
        expect(await c.obtenerConversion(nueva.id)).toEqual(nueva);
        expect((await c.convertir((await a.productos.crearProducto({ nombre: 'Harina', unidadBaseId: un.kg.id })).id, '2', libra.id, un.g.id)).cantidad).toBe('907.184');
      });

      it('rechaza equivalencias inválidas con el mensaje en el campo que corresponde', async () => {
        const { c, a, un } = await conSesion();
        const ok = { unidadOrigenId: un.u.id, unidadDestinoId: un.g.id, factor: '5' };
        const libra = await a.unidades.crearUnidad({ nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' });
        const casos = [
          [{ ...ok, unidadOrigenId: '' }, 'unidadOrigenId'], [{ ...ok, unidadDestinoId: undefined }, 'unidadDestinoId'],
          [{ ...ok, unidadOrigenId: 'no-existe' }, 'unidadOrigenId'], [{ ...ok, unidadDestinoId: un.u.id }, 'unidadDestinoId'],
          [{ ...ok }, 'unidadDestinoId'], // general entre conteo y masa: dimensiones distintas
          [{ unidadOrigenId: libra.id, unidadDestinoId: un.g.id, factor: '' }, 'factor'],
          [{ unidadOrigenId: libra.id, unidadDestinoId: un.g.id, factor: '0' }, 'factor'],
          [{ unidadOrigenId: libra.id, unidadDestinoId: un.g.id, factor: '-2' }, 'factor'],
          [{ unidadOrigenId: libra.id, unidadDestinoId: un.g.id, factor: 'mucho' }, 'factor'],
          [{ unidadOrigenId: libra.id, unidadDestinoId: un.g.id, factor: '1.1234567' }, 'factor'],
        ];
        for (const [entrada, campo] of casos) {
          await expect(c.crearConversion(entrada)).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { [campo]: expect.any(String) } });
        }
        await expect(c.crearConversion({ ...ok, productoId: 'no-existe' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        expect(await c.listarConversiones()).toHaveLength(2); // solo las sugeridas
      });

      it('rechaza equivalencias duplicadas o circulares (mismo par, cualquier sentido) del mismo alcance', async () => {
        const { c, un, papa } = await conSesion();
        await expect(c.crearConversion({ unidadOrigenId: un.kg.id, unidadDestinoId: un.g.id, factor: '1000' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadDestinoId: expect.stringMatching(/ya existe/i) } });
        await expect(c.crearConversion({ unidadOrigenId: un.g.id, unidadDestinoId: un.kg.id, factor: '0.001' })).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { unidadDestinoId: expect.stringMatching(/ya existe/i) } });
        // en otro alcance (producto) el mismo par sí se permite
        await expect(c.crearConversion({ productoId: papa.id, unidadOrigenId: un.g.id, unidadDestinoId: un.kg.id, factor: '0.00098' })).resolves.toMatchObject({ productoId: papa.id });
        await expect(c.crearConversion({ productoId: papa.id, unidadOrigenId: un.kg.id, unidadDestinoId: un.g.id, factor: '1' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      });

      it('cambiar el factor crea una versión nueva y deja la anterior no vigente (el historial conserva su sentido)', async () => {
        const { c, un, papa } = await conSesion();
        const original = await c.crearConversion({ productoId: papa.id, unidadOrigenId: un.kg.id, unidadDestinoId: un.g.id, factor: '990' });
        const nueva = await c.cambiarFactorConversion(original.id, '1000');
        expect(nueva.id).not.toBe(original.id);
        expect(nueva).toMatchObject({ productoId: papa.id, factor: '1000', vigente: true, reemplazaId: original.id });
        expect(await c.obtenerConversion(original.id)).toMatchObject({ factor: '990', vigente: false, reemplazadaPorId: nueva.id });
        expect((await c.listarConversiones({ productoId: papa.id })).map((x) => x.id)).toEqual([nueva.id]);
        expect((await c.listarConversiones({ productoId: papa.id, vigentes: false })).map((x) => x.id)).toEqual([original.id, nueva.id]);
        expect((await c.convertir(papa.id, '1', un.kg.id, un.g.id)).cantidad).toBe('1000');
        // la versión anterior ya no se cambia, y un factor igual o inválido se rechaza
        await expect(c.cambiarFactorConversion(original.id, '500')).rejects.toMatchObject({ codigo: 'VALIDACION' });
        await expect(c.cambiarFactorConversion(nueva.id, '1000')).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { factor: expect.any(String) } });
        await expect(c.cambiarFactorConversion(nueva.id, '0')).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { factor: expect.any(String) } });
        await expect(c.cambiarFactorConversion('no-existe', '2')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('retirar una equivalencia la deja no vigente (no se borra) y convertir vuelve a exigir una configurada', async () => {
        const { c, un, aceite } = await conSesion();
        const eq = await c.crearConversion({ productoId: aceite.id, unidadOrigenId: un.l.id, unidadDestinoId: un.kg.id, factor: '0.92' });
        expect((await c.retirarConversion(eq.id)).vigente).toBe(false);
        expect(await c.obtenerConversion(eq.id)).toMatchObject({ vigente: false });
        await expect(c.convertir(aceite.id, '1', un.l.id, un.kg.id)).rejects.toMatchObject({ codigo: 'UNIDAD_INCOMPATIBLE' });
        await expect(c.retirarConversion(eq.id)).rejects.toMatchObject({ codigo: 'VALIDACION' });
        await expect(c.retirarConversion('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        // tras retirarla se puede crear otra para el mismo par
        await expect(c.crearConversion({ productoId: aceite.id, unidadOrigenId: un.l.id, unidadDestinoId: un.kg.id, factor: '0.91' })).resolves.toMatchObject({ vigente: true });
      });

      it('no ofrece borrado físico de conversiones', async () => {
        const { c } = await conSesion();
        expect(c.eliminarConversion).toBeUndefined();
        expect(c.borrarConversion).toBeUndefined();
      });

      it('una unidad usada en una equivalencia ya no puede cambiar de dimensión', async () => {
        const { a, un } = await conSesion();
        await expect(a.unidades.editarUnidad(un.kg.id, { nombre: 'Kilogramo', abreviatura: 'kg', dimension: 'volumen' }))
          .rejects.toMatchObject({ campos: { dimension: expect.stringMatching(/ya se usa/i) } });
      });
    });
    describe('inventario: movimientos y existencias (Versión 4)', () => {
      async function preparar() {
        const a = crearAdaptador();
        const usuario = await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
        const unidades = await a.unidades.listarUnidades();
        const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
        const papa = await a.productos.crearProducto({ nombre: 'Papa', unidadBaseId: por.kg.id });
        let contador = 0;
        const clave = () => `clave-${++contador}-${Math.random().toString(36).slice(2, 10)}`;
        const mover = (productoId, tipo, cantidad, extra = {}) => a.inventario.registrarMovimiento({
          productoId, tipo, subtipo: tipo === 'ingreso' ? 'compra' : 'salida_general', cantidad, unidadId: por.kg.id,
          claveIdempotencia: clave(), ...extra,
        });
        const existencia = async (productoId = papa.id) => (await a.inventario.obtenerExistencia(productoId)).cantidadBase;
        return { a, i: a.inventario, usuario, por, papa, clave, mover, existencia };
      }

      it('exige sesión en todas las operaciones', async () => {
        const a = crearAdaptador();
        const llamadas = [
          () => a.inventario.registrarMovimiento({ productoId: 'x', tipo: 'ingreso', subtipo: 'compra', cantidad: 1, unidadId: 'u', claveIdempotencia: 'k' }),
          () => a.inventario.listarExistencias(),
          () => a.inventario.obtenerExistencia('x'),
          () => a.inventario.verificarConsistencia(),
        ];
        for (const llamar of llamadas) await expect(llamar()).rejects.toMatchObject({ codigo: 'SIN_SESION' });
      });

      it('los movimientos son inmutables: no hay operaciones para editarlos, borrarlos ni fijar existencias a mano', async () => {
        const { i } = await preparar();
        for (const nombreOperacion of [
          'editarMovimiento', 'modificarMovimiento', 'actualizarMovimiento', 'eliminarMovimiento', 'borrarMovimiento',
          'actualizarExistencia', 'establecerExistencia', 'modificarExistencia',
        ]) expect(i[nombreOperacion]).toBeUndefined();
      });

      it('ingreso de 10: existencia 10; salida de 6: existencia 4', async () => {
        const { i, papa, mover, existencia } = await preparar();
        expect(await existencia()).toBe('0'); // sin movimientos, la existencia es 0
        const ingreso = await mover(papa.id, 'ingreso', 10);
        expect(ingreso.existencia.cantidadBase).toBe('10');
        expect(await existencia()).toBe('10');
        const salida = await mover(papa.id, 'salida', 6);
        expect(salida.existencia.cantidadBase).toBe('4');
        expect(await existencia()).toBe('4');
        expect((await i.verificarConsistencia()).consistente).toBe(true);
      });

      it('el movimiento guarda tipo, subtipo, sentido, cantidades, unidades, usuario y la hora del SERVIDOR', async () => {
        const { papa, por, usuario, mover } = await preparar();
        const { movimiento: m, repetido } = await mover(papa.id, 'ingreso', '2,5', {
          nota: '  Compra del lunes  ', referenciaTipo: 'compra', referenciaId: 'c-1',
          fechaHora: '2000-01-01T00:00:00.000Z', usuarioId: 'otro-usuario', // la entrada NO puede fijar la hora ni el usuario
        });
        expect(repetido).toBe(false);
        expect(m).toMatchObject({
          id: expect.any(String), productoId: papa.id, tipo: 'ingreso', subtipo: 'compra', sentido: 1,
          cantidadOriginal: '2.5', unidadOriginalId: por.kg.id, presentacionOriginalId: null,
          factorAplicado: '1', conversionId: null, redondeado: false,
          cantidadBase: '2.5', unidadBaseId: por.kg.id, usuarioId: usuario.id,
          claveIdempotencia: expect.any(String), referenciaTipo: 'compra', referenciaId: 'c-1', nota: 'Compra del lunes',
        });
        expect(Math.abs(Date.now() - Date.parse(m.fechaHora))).toBeLessThan(60_000);
        const salida = await mover(papa.id, 'salida', 1);
        expect(salida.movimiento).toMatchObject({ tipo: 'salida', subtipo: 'salida_general', sentido: -1, cantidadBase: '1' });
      });

      it('una salida mayor a la existencia se rechaza, informa lo disponible y no cambia nada ni crea movimiento', async () => {
        const { i, papa, mover, existencia } = await preparar();
        await mover(papa.id, 'ingreso', 10);
        await mover(papa.id, 'salida', 6);
        const antes = await i.verificarConsistencia();
        const rechazo = await mover(papa.id, 'salida', 5).catch((e) => e);
        expect(rechazo).toMatchObject({ codigo: 'VALIDACION', campos: { cantidad: expect.stringMatching(/No hay cantidad suficiente.*Disponible: 4 kg/) }, disponible: '4' });
        expect(await existencia()).toBe('4');
        const despues = await i.verificarConsistencia();
        expect(despues.movimientosRevisados).toBe(antes.movimientosRevisados);
        expect(despues.consistente).toBe(true);
      });

      it('una salida rechazada nunca se convierte en ajuste, ingreso ni compra; sin existencia tampoco se puede sacar nada', async () => {
        const { i, papa, mover, existencia } = await preparar();
        await expect(mover(papa.id, 'salida', 1)).rejects.toMatchObject({ codigo: 'VALIDACION' });
        await expect(mover(papa.id, 'salida', 1, { subtipo: 'consumo' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
        expect(await existencia()).toBe('0');
        expect((await i.verificarConsistencia()).movimientosRevisados).toBe(0);
      });

      it('se puede sacar justo toda la existencia (queda 0) pero nunca una cantidad negativa', async () => {
        const { papa, mover, existencia } = await preparar();
        await mover(papa.id, 'ingreso', '2.5');
        await mover(papa.id, 'salida', '2.5');
        expect(await existencia()).toBe('0');
        await expect(mover(papa.id, 'salida', '0.0001')).rejects.toMatchObject({ codigo: 'VALIDACION' });
        expect(await existencia()).toBe('0');
      });

      it('idempotencia: la misma clave dos veces crea un solo movimiento y aplica la existencia una sola vez', async () => {
        const { i, papa, mover, existencia, clave } = await preparar();
        const k = clave();
        const primero = await mover(papa.id, 'ingreso', 10, { claveIdempotencia: k });
        const segundo = await mover(papa.id, 'ingreso', 10, { claveIdempotencia: k });
        expect(segundo.repetido).toBe(true);
        expect(segundo.movimiento).toEqual(primero.movimiento);
        expect(await existencia()).toBe('10');
        const c = await i.verificarConsistencia();
        expect(c.movimientosRevisados).toBe(1);
        expect(c.consistente).toBe(true);
      });

      it('idempotencia: un reintento devuelve el resultado original aunque ahora ya no alcance la existencia', async () => {
        const { papa, mover, existencia, clave } = await preparar();
        await mover(papa.id, 'ingreso', 10);
        const k = clave();
        const original = await mover(papa.id, 'salida', 6, { claveIdempotencia: k });
        const reintento = await mover(papa.id, 'salida', 6, { claveIdempotencia: k });
        expect(reintento.repetido).toBe(true);
        expect(reintento.movimiento.id).toBe(original.movimiento.id);
        expect(await existencia()).toBe('4'); // no se restó otra vez
      });

      it('la misma clave para una operación DISTINTA se rechaza (OPERACION_DUPLICADA) sin registrar nada', async () => {
        const { i, papa, mover, existencia, clave } = await preparar();
        const k = clave();
        await mover(papa.id, 'ingreso', 10, { claveIdempotencia: k });
        await expect(mover(papa.id, 'ingreso', 3, { claveIdempotencia: k })).rejects.toMatchObject({ codigo: 'OPERACION_DUPLICADA' });
        expect(await existencia()).toBe('10');
        expect((await i.verificarConsistencia()).movimientosRevisados).toBe(1);
      });

      it('dos salidas simultáneas de 3 con existencia 5: solo una se acepta', async () => {
        const { i, papa, mover, existencia } = await preparar();
        await mover(papa.id, 'ingreso', 5);
        const resultados = await Promise.allSettled([mover(papa.id, 'salida', 3), mover(papa.id, 'salida', 3)]);
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rechazada = resultados.find((r) => r.status === 'rejected');
        expect(rechazada.reason).toMatchObject({ codigo: 'VALIDACION', disponible: '2' });
        expect(await existencia()).toBe('2');
        expect((await i.verificarConsistencia()).consistente).toBe(true);
      });

      it('dos conexiones distintas con salidas simultáneas de 3 sobre existencia 5: solo una se acepta', async () => {
        const { a, papa, mover, existencia, por, clave } = await preparar();
        await mover(papa.id, 'ingreso', 5);
        const b = crearAdaptador(); // segunda conexión al mismo almacén de datos
        await b.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
        const salida = (adaptador) => adaptador.inventario.registrarMovimiento({
          productoId: papa.id, tipo: 'salida', subtipo: 'salida_general', cantidad: 3, unidadId: por.kg.id, claveIdempotencia: clave(),
        });
        const resultados = await Promise.allSettled([salida(a), salida(b)]);
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(await existencia()).toBe('2');
      });

      it('muchas salidas simultáneas nunca dejan la existencia negativa', async () => {
        const { i, papa, mover, existencia } = await preparar();
        await mover(papa.id, 'ingreso', 5);
        const resultados = await Promise.allSettled(Array.from({ length: 12 }, () => mover(papa.id, 'salida', 1)));
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
        expect(await existencia()).toBe('0');
        expect((await i.verificarConsistencia()).consistente).toBe(true);
      });

      it('convierte a la unidad base y guarda lo usado: 1500 g de un producto en kg son 1,5 kg', async () => {
        const { i, papa, por, mover, existencia } = await preparar();
        const { movimiento: m } = await mover(papa.id, 'ingreso', 1500, { unidadId: por.g.id });
        expect(m).toMatchObject({
          cantidadOriginal: '1500', unidadOriginalId: por.g.id, cantidadBase: '1.5', unidadBaseId: por.kg.id,
          factorAplicado: '0.001', conversionId: expect.any(String), redondeado: false,
        });
        expect(await existencia()).toBe('1.5');
        expect((await i.verificarConsistencia()).consistente).toBe(true);
      });

      it('con una presentación: 3 cajas de 12 unidades son 36 unidades', async () => {
        const { a, por } = await preparar();
        const galletas = await a.productos.crearProducto({ nombre: 'Galletas', unidadBaseId: por.u.id });
        const caja = await a.presentaciones.crearPresentacion(galletas.id, { nombre: 'Caja', unidadId: por.u.id, cantidadContenida: '12' });
        const r = await a.inventario.registrarMovimiento({
          productoId: galletas.id, tipo: 'ingreso', subtipo: 'compra', cantidad: 3, presentacionId: caja.id, claveIdempotencia: 'caja-1',
        });
        expect(r.movimiento).toMatchObject({
          cantidadOriginal: '3', presentacionOriginalId: caja.id, unidadOriginalId: por.u.id,
          factorAplicado: '12', cantidadBase: '36', unidadBaseId: por.u.id,
        });
        expect(r.existencia.cantidadBase).toBe('36');
      });

      it('sin equivalencia configurada nunca se asume una: se rechaza y no se registra nada', async () => {
        const { a, i, papa, por, mover } = await preparar();
        const libra = await a.unidades.crearUnidad({ nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' });
        await expect(mover(papa.id, 'ingreso', 2, { unidadId: libra.id })).rejects.toMatchObject({ codigo: 'CONVERSION_NO_CONFIGURADA' });
        await expect(mover(papa.id, 'ingreso', 2, { unidadId: por.l.id })).rejects.toMatchObject({ codigo: 'UNIDAD_INCOMPATIBLE' });
        expect((await i.verificarConsistencia()).movimientosRevisados).toBe(0);
        expect((await i.obtenerExistencia(papa.id)).cantidadBase).toBe('0');
      });

      it('cambiar después una equivalencia no reescribe lo ya registrado', async () => {
        const { a, papa, por, mover, existencia, clave } = await preparar();
        const k = clave();
        const antes = await mover(papa.id, 'ingreso', 1000, { unidadId: por.g.id, claveIdempotencia: k });
        const [general] = (await a.conversiones.listarConversiones()).filter((c) => c.unidadOrigenId === por.kg.id && c.unidadDestinoId === por.g.id);
        await a.conversiones.cambiarFactorConversion(general.id, '500'); // 1 kg = 500 g (versión nueva)
        const despues = await mover(papa.id, 'ingreso', 1000, { unidadId: por.g.id });
        expect(despues.movimiento.cantidadBase).toBe('2');
        expect(despues.movimiento.conversionId).not.toBe(antes.movimiento.conversionId);
        const original = await mover(papa.id, 'ingreso', 1000, { unidadId: por.g.id, claveIdempotencia: k });
        expect(original.movimiento).toMatchObject({ cantidadBase: '1', factorAplicado: '0.001', conversionId: antes.movimiento.conversionId });
        expect(await existencia()).toBe('3');
      });

      it('una cantidad que queda en cero al convertir se rechaza', async () => {
        const { i, papa, mover } = await preparar();
        await expect(mover(papa.id, 'ingreso', '0.00001')).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { cantidad: expect.any(String) } });
        expect((await i.verificarConsistencia()).movimientosRevisados).toBe(0);
      });

      it('un producto inexistente o inactivo no puede tener movimientos', async () => {
        const { a, i, papa, mover } = await preparar();
        await expect(mover('no-existe', 'ingreso', 1)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await a.productos.cambiarEstadoProducto(papa.id, false);
        await expect(mover(papa.id, 'ingreso', 1)).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { productoId: expect.any(String) } });
        expect((await i.verificarConsistencia()).movimientosRevisados).toBe(0);
      });

      it('valida la entrada y avisa todos los campos con problema a la vez, sin registrar nada', async () => {
        const { i, papa, por, mover } = await preparar();
        const casos = [
          [{ tipo: 'otro' }, 'tipo'],
          [{ tipo: 'ingreso', subtipo: 'consumo' }, 'subtipo'],
          [{ cantidad: '' }, 'cantidad'], [{ cantidad: 0 }, 'cantidad'], [{ cantidad: '-3' }, 'cantidad'], [{ cantidad: 'abc' }, 'cantidad'],
          [{ unidadId: undefined }, 'unidadId'], [{ unidadId: por.kg.id, presentacionId: 'p-1' }, 'unidadId'],
          [{ claveIdempotencia: '' }, 'claveIdempotencia'], [{ claveIdempotencia: 'x'.repeat(101) }, 'claveIdempotencia'],
          [{ nota: 'x'.repeat(501) }, 'nota'], [{ referenciaTipo: 'compra' }, 'referenciaId'],
        ];
        for (const [cambio, campo] of casos) {
          await expect(mover(papa.id, 'ingreso', 1, cambio)).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { [campo]: expect.any(String) } });
        }
        const varios = await i.registrarMovimiento({}).catch((e) => e);
        expect(Object.keys(varios.campos)).toEqual(expect.arrayContaining(['productoId', 'tipo', 'cantidad', 'unidadId', 'claveIdempotencia']));
        expect((await i.verificarConsistencia()).movimientosRevisados).toBe(0);
      });

      it('un ajuste debe indicar si suma o resta, y tampoco puede dejar la existencia en negativo', async () => {
        const { i, papa, mover, existencia } = await preparar();
        const ajuste = (cantidad, extra) => mover(papa.id, 'ajuste', cantidad, { subtipo: 'ajuste_conteo', ...extra });
        await expect(ajuste(1)).rejects.toMatchObject({ codigo: 'VALIDACION', campos: { sentido: expect.any(String) } });
        await ajuste(4, { sentido: 1 });
        expect(await existencia()).toBe('4');
        await ajuste(1, { sentido: -1 });
        expect(await existencia()).toBe('3');
        await expect(ajuste(9, { sentido: -1 })).rejects.toMatchObject({ codigo: 'VALIDACION', disponible: '3' });
        expect(await existencia()).toBe('3');
        expect((await i.verificarConsistencia()).consistente).toBe(true);
      });

      it('listarExistencias: solo productos completos, por nombre, con unidad base, "sin existencia", búsqueda y paginación', async () => {
        const { a, i, papa, por, mover } = await preparar();
        const arroz = await a.productos.crearProducto({ nombre: 'Arroz', unidadBaseId: por.kg.id });
        const aceite = await a.productos.crearProducto({ nombre: 'Aceite', unidadBaseId: por.l.id });
        await mover(papa.id, 'ingreso', 4);
        await mover(aceite.id, 'ingreso', '2.5', { unidadId: por.l.id });
        const lista = await i.listarExistencias();
        expect(lista.items.map((x) => x.nombre)).toEqual(['Aceite', 'Arroz', 'Papa']);
        expect(lista).toMatchObject({ total: 3, pagina: 1, totalPaginas: 1, incompletos: 0 });
        expect(lista.items[0]).toMatchObject({ productoId: aceite.id, cantidadBase: '2.5', sinExistencia: false, unidadBase: { abreviatura: 'l' }, actualizadoEn: expect.any(String) });
        expect(lista.items[1]).toMatchObject({ productoId: arroz.id, cantidadBase: '0', sinExistencia: true, actualizadoEn: null });
        expect((await i.listarExistencias({ busqueda: 'PAPÁ' })).items.map((x) => x.nombre)).toEqual(['Papa']);
        const pagina = await i.listarExistencias({ pagina: 2, tamanoPagina: 2 });
        expect(pagina).toMatchObject({ total: 3, pagina: 2, totalPaginas: 2 });
        expect(pagina.items.map((x) => x.nombre)).toEqual(['Papa']);
        await a.productos.cambiarEstadoProducto(arroz.id, false);
        expect((await i.listarExistencias()).items.map((x) => x.nombre)).toEqual(['Aceite', 'Papa']);
        expect((await i.listarExistencias({ estado: 'inactivos' })).items.map((x) => x.nombre)).toEqual(['Arroz']);
        expect((await i.listarExistencias({ estado: 'todos' })).total).toBe(3);
      });

      it('obtenerExistencia de un producto inexistente lanza NO_ENCONTRADO', async () => {
        const { i } = await preparar();
        await expect(i.obtenerExistencia('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('alCambiarInventario avisa tras cada movimiento ACEPTADO (no tras uno rechazado) y permite desuscribirse', async () => {
        const { i, papa, mover } = await preparar();
        const avisos = [];
        const salir = i.alCambiarInventario((cambio) => avisos.push(cambio));
        const ingreso = await mover(papa.id, 'ingreso', 5);
        await expect(mover(papa.id, 'salida', 9)).rejects.toBeDefined();
        expect(avisos).toEqual([{ productoId: papa.id, movimientoId: ingreso.movimiento.id }]);
        salir();
        await mover(papa.id, 'ingreso', 1);
        expect(avisos).toHaveLength(1);
      });

      it('verificarConsistencia devuelve consistente tras una secuencia de operaciones', async () => {
        const { i, papa, por, mover } = await preparar();
        expect(await i.verificarConsistencia()).toEqual({ consistente: true, productosRevisados: 0, movimientosRevisados: 0, discrepancias: [] });
        await mover(papa.id, 'ingreso', 10);
        await mover(papa.id, 'salida', 3, { unidadId: por.kg.id });
        await mover(papa.id, 'ingreso', 500, { unidadId: por.g.id });
        await expect(mover(papa.id, 'salida', 50)).rejects.toBeDefined();
        expect(await i.verificarConsistencia()).toEqual({ consistente: true, productosRevisados: 1, movimientosRevisados: 3, discrepancias: [] });
      });

      it('con movimientos registrados, la unidad base del producto ya no se puede cambiar', async () => {
        const { a, papa, por, mover } = await preparar();
        const sinMovimientos = await a.productos.crearProducto({ nombre: 'Yuca', unidadBaseId: por.kg.id });
        expect((await a.productos.editarProducto(sinMovimientos.id, { nombre: 'Yuca', unidadBaseId: por.g.id })).unidadBaseId).toBe(por.g.id);
        await mover(papa.id, 'ingreso', 2);
        await expect(a.productos.editarProducto(papa.id, { nombre: 'Papa', unidadBaseId: por.g.id })).rejects.toMatchObject({
          codigo: 'VALIDACION', campos: { unidadBaseId: expect.stringMatching(/ya tiene movimientos/) },
        });
        // la misma unidad, o editar solo el nombre, sí se puede
        expect((await a.productos.editarProducto(papa.id, { nombre: 'Papa criolla', unidadBaseId: por.kg.id })).nombre).toBe('Papa criolla');
        expect((await a.productos.editarProducto(papa.id, { nombre: 'Papa' })).unidadBaseId).toBe(por.kg.id);
      });

      it('lo que devuelve el adaptador son copias: modificarlas no altera lo guardado', async () => {
        const { i, papa, mover, existencia } = await preparar();
        const r = await mover(papa.id, 'ingreso', 10);
        r.movimiento.cantidadBase = '999';
        r.existencia.cantidadBase = '999';
        expect(await existencia()).toBe('10');
        expect((await i.verificarConsistencia()).consistente).toBe(true);
      });

      if (extras.crearConFalloSimulado) {
        it('atomicidad: un fallo a mitad de la operación no deja movimiento ni cambio de existencia', async () => {
          const { adaptador: a, provocarFallo, restaurar } = extras.crearConFalloSimulado();
          await a.autenticacion.iniciarSesion(credenciales.correo, credenciales.clave);
          const kg = (await a.unidades.listarUnidades()).find((u) => u.abreviatura === 'kg');
          const papa = await a.productos.crearProducto({ nombre: 'Papa', unidadBaseId: kg.id });
          const entrada = (tipo, cantidad, claveIdempotencia) => ({
            productoId: papa.id, tipo, subtipo: tipo === 'ingreso' ? 'compra' : 'salida_general', cantidad, unidadId: kg.id, claveIdempotencia,
          });
          await a.inventario.registrarMovimiento(entrada('ingreso', 10, 'a-1'));

          provocarFallo();
          await expect(a.inventario.registrarMovimiento(entrada('salida', 3, 'a-2'))).rejects.toBeInstanceOf(ErrorDatos);
          restaurar();

          expect((await a.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe('10');
          expect(await a.inventario.verificarConsistencia()).toMatchObject({ consistente: true, movimientosRevisados: 1 });
          // el intento fallido no cuenta como registrado: reintentar con la misma clave lo ejecuta de verdad
          const reintento = await a.inventario.registrarMovimiento(entrada('salida', 3, 'a-2'));
          expect(reintento.repetido).toBe(false);
          expect((await a.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe('7');
          expect(await a.inventario.verificarConsistencia()).toMatchObject({ consistente: true, movimientosRevisados: 2 });
        });
      }
    });
  });
}
