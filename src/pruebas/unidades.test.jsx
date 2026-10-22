import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { validarUnidad, filtrarUnidades } from '../nucleo/datos/unidades.js';

async function montar(ruta = '/unidades', { conSesion = true } = {}) {
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  if (conSesion) await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return datos;
}
const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const nombresEnTabla = () => filas().map((f) => within(f).getAllByRole('cell')[0].textContent.replace('Sugerida', '').trim());

describe('reglas puras de unidades', () => {
  it('validarUnidad limpia espacios y normaliza', () => {
    expect(validarUnidad({ nombre: '  Tazón  grande ', abreviatura: ' TZ ', dimension: 'volumen' })).toMatchObject({
      nombre: 'Tazón grande', abreviatura: 'TZ', nombreNormalizado: 'tazon grande', abreviaturaNormalizada: 'tz',
    });
  });
  it('filtrarUnidades ordena por nombre y filtra por estado', () => {
    const lista = [
      { nombreNormalizado: 'b', activo: true }, { nombreNormalizado: 'a', activo: false }, { nombreNormalizado: 'c', activo: true },
    ];
    expect(filtrarUnidades(lista, 'activas').map((u) => u.nombreNormalizado)).toEqual(['b', 'c']);
    expect(filtrarUnidades(lista, 'inactivas').map((u) => u.nombreNormalizado)).toEqual(['a']);
    expect(filtrarUnidades(lista, 'todas').map((u) => u.nombreNormalizado)).toEqual(['a', 'b', 'c']);
  });
});

describe('pantalla de unidades', () => {
  it('sin sesión redirige al inicio de sesión', async () => {
    await montar('/unidades', { conSesion: false });
    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
  });

  it('el menú lleva a Unidades y conversiones y muestra las unidades sugeridas', async () => {
    const u = userEvent.setup();
    await montar('/');
    await u.click(await screen.findByRole('link', { name: 'Unidades y conversiones' }));
    expect(await screen.findByRole('heading', { name: 'Unidades de medida', level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(nombresEnTabla()).toEqual(['Gramo', 'Kilogramo', 'Litro', 'Mililitro', 'Unidad']));
    expect(within(screen.getByRole('table')).getAllByText('Sugerida')).toHaveLength(5);
  });

  it('crea una unidad nueva y aparece en la tabla', async () => {
    const u = userEvent.setup();
    const datos = await montar();
    await u.click(await screen.findByRole('button', { name: 'Nueva unidad' }));
    await u.type(screen.getByLabelText('Nombre de la unidad'), '  Libra ');
    await u.type(screen.getByLabelText('Abreviatura'), 'lb');
    await u.selectOptions(screen.getByLabelText('¿Qué mide?'), 'masa');
    await u.click(screen.getByRole('button', { name: 'Crear unidad' }));
    expect(await screen.findByText('Unidad creada.')).toBeInTheDocument();
    await waitFor(() => expect(nombresEnTabla()).toContain('Libra'));
    expect(screen.queryByRole('form', { name: 'Nueva unidad' })).toBeNull();
    expect((await datos.unidades.listarUnidades({ estado: 'todas' })).length).toBe(6);
  });

  it('muestra los mensajes de validación junto a cada campo y no guarda', async () => {
    const u = userEvent.setup();
    const datos = await montar();
    await u.click(await screen.findByRole('button', { name: 'Nueva unidad' }));
    await u.click(screen.getByRole('button', { name: 'Crear unidad' }));
    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('La abreviatura es obligatoria.')).toBeInTheDocument();
    expect(screen.getByText(/Elegí si la unidad mide/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la unidad')).toHaveAttribute('aria-invalid', 'true');
    expect((await datos.unidades.listarUnidades({ estado: 'todas' })).length).toBe(5);
  });

  it('rechaza un nombre repetido con mensaje claro', async () => {
    const u = userEvent.setup();
    await montar();
    await u.click(await screen.findByRole('button', { name: 'Nueva unidad' }));
    await u.type(screen.getByLabelText('Nombre de la unidad'), ' kilogramo ');
    await u.type(screen.getByLabelText('Abreviatura'), 'kilo');
    await u.selectOptions(screen.getByLabelText('¿Qué mide?'), 'masa');
    await u.click(screen.getByRole('button', { name: 'Crear unidad' }));
    expect(await screen.findByText('Ya existe una unidad con ese nombre.')).toBeInTheDocument();
  });

  it('edita una unidad conservando su id', async () => {
    const u = userEvent.setup();
    const datos = await montar();
    const antes = (await datos.unidades.listarUnidades()).find((x) => x.abreviatura === 'u');
    await u.click(await screen.findByRole('button', { name: 'Editar Unidad' }));
    const campo = screen.getByLabelText('Nombre de la unidad');
    await waitFor(() => expect(campo).toHaveValue('Unidad'));
    await u.clear(campo);
    await u.type(campo, 'Unidad suelta');
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    const despues = await datos.unidades.obtenerUnidad(antes.id);
    expect(despues.nombre).toBe('Unidad suelta');
    await waitFor(() => expect(nombresEnTabla()).toContain('Unidad suelta'));
  });

  it('desactivar pide confirmación; la unidad pasa a Inactivas y se puede reactivar', async () => {
    const u = userEvent.setup();
    const datos = await montar();
    await u.click(await screen.findByRole('button', { name: 'Desactivar Litro' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect((await datos.unidades.listarUnidades()).map((x) => x.nombre)).toContain('Litro');
    await u.click(screen.getByRole('button', { name: 'Desactivar Litro' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText('Unidad desactivada.')).toBeInTheDocument();
    await waitFor(() => expect(nombresEnTabla()).not.toContain('Litro'));
    await u.selectOptions(screen.getByLabelText('Mostrar'), 'inactivas');
    await waitFor(() => expect(nombresEnTabla()).toEqual(['Litro']));
    await u.click(screen.getByRole('button', { name: 'Activar Litro' }));
    expect(await screen.findByText('Unidad activada.')).toBeInTheDocument();
    expect((await datos.unidades.listarUnidades()).map((x) => x.nombre)).toContain('Litro');
  });
});
