// PRUEBAS DE CONTRATO REUTILIZABLES
// Cualquier adaptador (demo o de la base real) debe pasar estas pruebas.
// Uso: ejecutarPruebasDeContrato('mi adaptador', () => crearAdaptador(), { correo, clave });
import { describe, it, expect } from 'vitest';
import { validarAdaptador } from './contrato.js';
import { ErrorDatos } from './errores.js';

export function ejecutarPruebasDeContrato(nombre, crearAdaptador, credenciales) {
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
        return { a, p: a.productos, usuario };
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
        const { p } = await conSesion();
        expect(p.eliminarProducto).toBeUndefined();
        expect(p.borrarProducto).toBeUndefined();
      });

      it('crea un producto activo con id, fechas, creador y unidad base nula, y se puede consultar', async () => {
        const { p, usuario } = await conSesion();
        const creado = await p.crearProducto({ nombre: 'Papa' });
        expect(creado).toMatchObject({
          id: expect.any(String), nombre: 'Papa', nombreNormalizado: 'papa', activo: true,
          unidadBaseId: null, creadoPor: usuario.id,
        });
        expect(Number.isNaN(Date.parse(creado.creadoEn))).toBe(false);
        expect(Number.isNaN(Date.parse(creado.actualizadoEn))).toBe(false);
        expect(await p.obtenerProducto(creado.id)).toEqual(creado);
        expect(nombres(await p.listarProductos())).toEqual(['Papa']);
      });

      it('guarda el nombre sin espacios sobrantes', async () => {
        const { p } = await conSesion();
        const creado = await p.crearProducto({ nombre: '   Arroz   blanco  ' });
        expect(creado.nombre).toBe('Arroz blanco');
      });

      it('rechaza nombres vacíos, demasiado cortos o demasiado largos (VALIDACION con mensaje del campo)', async () => {
        const { p } = await conSesion();
        for (const nombre of ['', '   ', 'a', ' a ', 'x'.repeat(121), undefined, null, 42]) {
          await expect(p.crearProducto({ nombre })).rejects.toMatchObject({
            codigo: 'VALIDACION', campos: { nombre: expect.any(String) },
          });
        }
        expect((await p.crearProducto({ nombre: 'ab' })).nombre).toBe('ab');
        expect((await p.crearProducto({ nombre: 'x'.repeat(120) })).nombre).toHaveLength(120);
        expect((await p.listarProductos({ estado: 'todos' })).total).toBe(2);
      });

      it('rechaza nombres duplicados comparando sin mayúsculas, tildes ni espacios sobrantes', async () => {
        const { p } = await conSesion();
        await p.crearProducto({ nombre: 'Papa' });
        await p.crearProducto({ nombre: 'Azúcar' });
        for (const repetido of [' papa ', 'PAPA', 'Pápa', 'azucar', ' AZÚCAR']) {
          await expect(p.crearProducto({ nombre: repetido })).rejects.toMatchObject({
            codigo: 'NOMBRE_DUPLICADO', campos: { nombre: expect.any(String) },
          });
        }
        expect((await p.listarProductos({ estado: 'todos' })).total).toBe(2);
      });

      it('un nombre repetido de un producto inactivo también se rechaza, y el mensaje lo indica', async () => {
        const { p } = await conSesion();
        const papa = await p.crearProducto({ nombre: 'Papa' });
        await p.cambiarEstadoProducto(papa.id, false);
        await expect(p.crearProducto({ nombre: 'papa' })).rejects.toMatchObject({
          codigo: 'NOMBRE_DUPLICADO', campos: { nombre: expect.stringMatching(/inactivo/i) },
        });
      });

      it('editar el nombre conserva el id y actualiza la fecha de modificación', async () => {
        const { p } = await conSesion();
        const original = await p.crearProducto({ nombre: 'Papa' });
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
        const { p } = await conSesion();
        const papa = await p.crearProducto({ nombre: 'papa' });
        await p.crearProducto({ nombre: 'Yuca' });
        expect((await p.editarProducto(papa.id, { nombre: 'Papa' })).nombre).toBe('Papa');
        await expect(p.editarProducto(papa.id, { nombre: ' yuca ' })).rejects.toMatchObject({ codigo: 'NOMBRE_DUPLICADO' });
        await expect(p.editarProducto(papa.id, { nombre: '' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
        expect((await p.obtenerProducto(papa.id)).nombre).toBe('Papa');
      });

      it('consultar, editar o cambiar el estado de un id inexistente lanza NO_ENCONTRADO', async () => {
        const { p } = await conSesion();
        await expect(p.obtenerProducto('no-existe')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(p.editarProducto('no-existe', { nombre: 'Papa' })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
        await expect(p.cambiarEstadoProducto('no-existe', false)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      });

      it('desactivar saca el producto de Activos pero sigue en Inactivos y Todos; se puede reactivar', async () => {
        const { p } = await conSesion();
        const papa = await p.crearProducto({ nombre: 'Papa' });
        await p.crearProducto({ nombre: 'Yuca' });
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
        const { p } = await conSesion();
        const papa = await p.crearProducto({ nombre: 'Papa' });
        await expect(p.cambiarEstadoProducto(papa.id, 'no')).rejects.toMatchObject({ codigo: 'VALIDACION' });
      });

      it('busca sin importar mayúsculas ni tildes (azucar encuentra Azúcar) y por varias palabras', async () => {
        const { p } = await conSesion();
        for (const n of ['Azúcar', 'Arroz blanco', 'Arroz integral', 'Piña']) await p.crearProducto({ nombre: n });
        expect(nombres(await p.listarProductos({ busqueda: 'azucar' }))).toEqual(['Azúcar']);
        expect(nombres(await p.listarProductos({ busqueda: 'AZÚCAR' }))).toEqual(['Azúcar']);
        expect(nombres(await p.listarProductos({ busqueda: 'arroz' }))).toEqual(['Arroz blanco', 'Arroz integral']);
        expect(nombres(await p.listarProductos({ busqueda: 'blanco arroz' }))).toEqual(['Arroz blanco']);
        expect(nombres(await p.listarProductos({ busqueda: 'pina' }))).toEqual(['Piña']);
        expect((await p.listarProductos({ busqueda: 'zzz' })).total).toBe(0);
      });

      it('ordena por nombre y pagina con totales correctos', async () => {
        const { p } = await conSesion();
        for (const n of ['Yuca', 'Ajo', 'Zanahoria', 'Cebolla', 'Banano']) await p.crearProducto({ nombre: n });
        const primera = await p.listarProductos({ pagina: 1, tamanoPagina: 2 });
        expect(nombres(primera)).toEqual(['Ajo', 'Banano']);
        expect(primera).toMatchObject({ total: 5, pagina: 1, tamanoPagina: 2, totalPaginas: 3 });
        expect(nombres(await p.listarProductos({ pagina: 3, tamanoPagina: 2 }))).toEqual(['Zanahoria']);
        // una página fuera de rango se acota a la última
        expect((await p.listarProductos({ pagina: 99, tamanoPagina: 2 })).pagina).toBe(3);
      });

      it('una lista vacía devuelve una página válida', async () => {
        const { p } = await conSesion();
        expect(await p.listarProductos()).toMatchObject({ items: [], total: 0, pagina: 1, totalPaginas: 1 });
      });
    });
  });
}
