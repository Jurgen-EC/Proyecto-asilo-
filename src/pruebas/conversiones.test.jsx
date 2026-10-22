import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { convertirCantidad } from '../nucleo/datos/conversiones.js';
import { ConversionNoConfigurada, ErrorDatos } from '../nucleo/datos/errores.js';

async function montar(ruta) {
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const un = Object.fromEntries((await datos.unidades.listarUnidades()).map((x) => [x.abreviatura, x]));
  const aceite = await datos.productos.crearProducto({ nombre: 'Aceite', unidadBaseId: un.l.id });
  const huevos = await datos.productos.crearProducto({ nombre: 'Huevos', unidadBaseId: un.u.id });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[typeof ruta === 'function' ? ruta({ aceite, huevos }) : ruta]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return { datos, un, aceite, huevos };
}
const items = () => within(screen.getByRole('list', { busy: false })).getAllByRole('listitem').map((li) => li.textContent);

describe('convertirCantidad (función pura)', () => {
  const unidades = [
    { id: 'kg', dimension: 'masa', activo: true }, { id: 'g', dimension: 'masa', activo: true },
    { id: 'l', dimension: 'volumen', activo: true }, { id: 'u', dimension: 'conteo', activo: true },
  ];
  const conversiones = [{ id: 'c1', productoId: null, unidadOrigenId: 'kg', unidadDestinoId: 'g', factor: '1000', vigente: true }];
  const base = { productoId: 'p', unidades, presentaciones: [], conversiones };

  it('no usa flotantes: 0,1 kg = 100 g y 3 × 0,1 no deriva', () => {
    expect(convertirCantidad({ ...base, cantidad: '0.1', origen: 'kg', destino: 'g' }).cantidad).toBe('100');
    expect(convertirCantidad({ ...base, cantidad: '0.3', origen: 'kg', destino: 'g' }).cantidad).toBe('300');
  });
  it('ignora equivalencias no vigentes', () => {
    const viejas = [{ ...conversiones[0], vigente: false }];
    expect(() => convertirCantidad({ ...base, conversiones: viejas, cantidad: '1', origen: 'kg', destino: 'g' })).toThrow(ConversionNoConfigurada);
  });
  it('sin equivalencia: ConversionNoConfigurada (misma dimensión) o UNIDAD_INCOMPATIBLE (distinta)', () => {
    const sinNada = { ...base, conversiones: [] };
    expect(() => convertirCantidad({ ...sinNada, cantidad: '1', origen: 'kg', destino: 'g' })).toThrow(ConversionNoConfigurada);
    try { convertirCantidad({ ...sinNada, cantidad: '1', origen: 'l', destino: 'kg' }); } catch (e) {
      expect(e).toBeInstanceOf(ErrorDatos);
      expect(e.codigo).toBe('UNIDAD_INCOMPATIBLE');
    }
  });
});

describe('equivalencias generales en /unidades', () => {
  it('muestra kg ↔ g y l ↔ ml como sugeridas', async () => {
    await montar('/unidades');
    await waitFor(() => expect(items().sort()).toEqual(expect.arrayContaining([expect.stringContaining('1 kg = 1000 g'), expect.stringContaining('1 l = 1000 ml')])));
    expect(items().every((t) => t.includes('Sugerida'))).toBe(true);
  });

  it('rechaza una equivalencia general entre masa y volumen con un mensaje claro', async () => {
    const u = userEvent.setup();
    await montar('/unidades');
    await u.click(await screen.findByRole('button', { name: 'Nueva equivalencia' }));
    await u.selectOptions(screen.getByLabelText('Unidad de origen'), 'Litro (l)');
    await u.type(screen.getByLabelText('Cuánto vale 1 unidad de origen'), '0,92');
    await u.selectOptions(screen.getByLabelText('Unidad de destino'), 'Kilogramo (kg)');
    await u.click(screen.getByRole('button', { name: 'Crear equivalencia' }));
    expect(await screen.findByText(/solo puede ser entre unidades que miden lo mismo/)).toBeInTheDocument();
  });

  it('muestra los errores de cada campo y rechaza un duplicado', async () => {
    const u = userEvent.setup();
    await montar('/unidades');
    await u.click(await screen.findByRole('button', { name: 'Nueva equivalencia' }));
    await u.click(screen.getByRole('button', { name: 'Crear equivalencia' }));
    expect(await screen.findByText('Elegí la unidad de origen.')).toBeInTheDocument();
    expect(screen.getByText('Elegí la unidad de destino.')).toBeInTheDocument();
    expect(screen.getByText(/Escribí el factor con números/)).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Unidad de origen'), 'Gramo (g)');
    await u.selectOptions(screen.getByLabelText('Unidad de destino'), 'Kilogramo (kg)');
    await u.type(screen.getByLabelText('Cuánto vale 1 unidad de origen'), '0,001');
    await u.click(screen.getByRole('button', { name: 'Crear equivalencia' }));
    expect(await screen.findByText(/Ya existe una equivalencia vigente/)).toBeInTheDocument();
  });

  it('cambiar el factor crea una versión nueva y la anterior queda en el historial', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/unidades');
    await u.click(await screen.findByRole('button', { name: 'Cambiar factor de 1 l = 1000 ml' }));
    const campo = screen.getByLabelText('Nuevo factor');
    await u.clear(campo);
    await u.type(campo, '1001');
    await u.click(screen.getByRole('button', { name: 'Guardar nuevo factor' }));
    expect(await screen.findByText(/Factor cambiado/)).toBeInTheDocument();
    await waitFor(() => expect(items().join('|')).toContain('1 l = 1001 ml'));
    expect(items().join('|')).not.toContain('1 l = 1000 ml');
    await u.click(screen.getByLabelText('Ver versiones anteriores y retiradas'));
    await waitFor(() => expect(items().join('|')).toContain('Reemplazada'));
    expect((await datos.conversiones.listarConversiones({ vigentes: false })).length).toBe(3);
  });

  it('retirar pide confirmación y la equivalencia sale de las vigentes', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/unidades');
    await u.click(await screen.findByRole('button', { name: 'Retirar 1 l = 1000 ml' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(await datos.conversiones.listarConversiones()).toHaveLength(2);
    await u.click(screen.getByRole('button', { name: 'Retirar 1 l = 1000 ml' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retirar' }));
    expect(await screen.findByText('Equivalencia retirada.')).toBeInTheDocument();
    expect(await datos.conversiones.listarConversiones()).toHaveLength(1);
  });
});

describe('pestaña Conversiones de un producto', () => {
  it('prueba una conversión con presentaciones: 3 cajas de 12 unidades = 36 unidades', async () => {
    const u = userEvent.setup();
    const { datos, un, huevos } = await montar(({ huevos: h }) => `/productos/${h.id}?pestana=conversiones`);
    await datos.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: un.u.id, cantidadContenida: '12' });
    await u.click(await screen.findByRole('tab', { name: 'Datos' })); // forzar recarga de opciones
    await u.click(screen.getByRole('tab', { name: 'Conversiones' }));
    const cantidad = await screen.findByLabelText('Cantidad');
    await u.clear(cantidad);
    await u.type(cantidad, '3');
    await waitFor(() => expect(within(screen.getByLabelText('Desde')).getByRole('option', { name: 'Caja' })).toBeInTheDocument());
    await u.selectOptions(screen.getByLabelText('Desde'), 'Caja');
    await u.selectOptions(screen.getByLabelText('Hasta'), 'Unidad (u)');
    await u.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(await screen.findByRole('status')).toHaveTextContent('3 Caja = 36 u');
  });

  it('litros a kilogramos sin equivalencia del producto se rechaza; al configurarla, convierte', async () => {
    const u = userEvent.setup();
    await montar(({ aceite }) => `/productos/${aceite.id}?pestana=conversiones`);
    await waitFor(() => expect(within(screen.getByLabelText('Desde')).getByRole('option', { name: 'Litro (l)' })).toBeInTheDocument());
    await u.selectOptions(screen.getByLabelText('Desde'), 'Litro (l)');
    await u.selectOptions(screen.getByLabelText('Hasta'), 'Kilogramo (kg)');
    await u.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/miden cosas distintas/);

    // equivalencia propia del producto (cruza dimensiones: permitido solo dentro del producto)
    await u.click(screen.getByRole('button', { name: 'Nueva equivalencia' }));
    const formulario = within(screen.getByRole('form', { name: 'Nueva equivalencia' }));
    await u.selectOptions(formulario.getByLabelText('Unidad de origen'), 'Litro (l)');
    await u.type(formulario.getByLabelText('Cuánto vale 1 unidad de origen'), '0,92');
    await u.selectOptions(formulario.getByLabelText('Unidad de destino'), 'Kilogramo (kg)');
    await u.click(formulario.getByRole('button', { name: 'Crear equivalencia' }));
    expect(await screen.findByText('Equivalencia creada.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Calcular' }));
    const prueba = within(screen.getByRole('form', { name: 'Probar una conversión' }));
    await waitFor(() => expect(prueba.getByRole('status')).toHaveTextContent('1 l = 0,92 kg'));
  });

  it('la lista de presentaciones avisa «Falta equivalencia» hasta que se configura', async () => {
    const u = userEvent.setup();
    const { datos, un, aceite } = await montar(({ aceite: a }) => `/productos/${a.id}?pestana=presentaciones`);
    await screen.findByRole('tab', { name: 'Presentaciones', selected: true });
    await datos.presentaciones.crearPresentacion(aceite.id, { nombre: 'Caja', unidadId: un.u.id, cantidadContenida: '12' });
    await u.click(screen.getByRole('tab', { name: 'Datos' }));
    await u.click(screen.getByRole('tab', { name: 'Presentaciones' }));
    expect(await screen.findByText('Falta equivalencia')).toBeInTheDocument();
    await datos.conversiones.crearConversion({ productoId: aceite.id, unidadOrigenId: un.u.id, unidadDestinoId: un.l.id, factor: '1' });
    await u.click(screen.getByRole('tab', { name: 'Datos' }));
    await u.click(screen.getByRole('tab', { name: 'Presentaciones' }));
    await waitFor(() => expect(screen.queryByText('Falta equivalencia')).toBeNull());
    expect(within(screen.getByRole('table')).getAllByRole('cell')[2]).toHaveTextContent('12 l');
  });
});
