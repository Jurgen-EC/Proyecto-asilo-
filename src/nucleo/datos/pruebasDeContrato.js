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
  });
}
