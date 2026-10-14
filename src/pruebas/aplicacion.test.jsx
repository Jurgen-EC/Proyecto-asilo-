import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import DialogoConfirmacion from '../compartido/componentes/DialogoConfirmacion.jsx';
import { crearAdaptadorDemo } from '../nucleo/datos/adaptadorDemo.js';

function montar(ruta = '/') {
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorNotificaciones>
        <ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion>
      </ProveedorNotificaciones>
    </MemoryRouter>,
  );
  return datos;
}

describe('rutas protegidas', () => {
  it('sin sesión redirige al inicio de sesión', async () => {
    montar('/');
    expect(await screen.findByRole('heading', { name: /inventario de cocina/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toBeInTheDocument();
  });

  it('una ruta inexistente muestra la página 404', async () => {
    montar('/algo-que-no-existe');
    expect(await screen.findByText(/página no encontrada/i)).toBeInTheDocument();
  });
});

describe('inicio y cierre de sesión', () => {
  it('muestra error claro con credenciales incorrectas', async () => {
    const u = userEvent.setup();
    montar('/iniciar-sesion');
    await u.type(await screen.findByLabelText('Correo'), 'demo@hogar.local');
    await u.type(screen.getByLabelText('Contraseña'), 'mala');
    await u.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no son correctos/i);
  });

  it('valida campos vacíos sin llamar a la base', async () => {
    const u = userEvent.setup();
    montar('/iniciar-sesion');
    await u.click(await screen.findByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/escribí tu correo/i);
  });

  it('con credenciales correctas entra al panel y puede cerrar sesión', async () => {
    const u = userEvent.setup();
    montar('/iniciar-sesion');
    await u.type(await screen.findByLabelText('Correo'), 'demo@hogar.local');
    await u.type(screen.getByLabelText('Contraseña'), 'demo1234');
    await u.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByText(/modo demostración/i)).toBeInTheDocument();
    expect(screen.getAllByText(/próximamente/i).length).toBeGreaterThan(0);
    await u.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    await waitFor(() => expect(screen.getByLabelText('Correo')).toBeInTheDocument());
  });
});

describe('diálogo de confirmación', () => {
  it('llama a confirmar y a cancelar', async () => {
    const u = userEvent.setup();
    const ok = vi.fn(); const no = vi.fn();
    render(<DialogoConfirmacion abierto titulo="¿Seguro?" mensaje="Se guardará" onConfirmar={ok} onCancelar={no} />);
    await u.click(screen.getByRole('button', { name: 'Confirmar' }));
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(ok).toHaveBeenCalledTimes(1);
    expect(no).toHaveBeenCalledTimes(1);
  });
  it('no se muestra cerrado', () => {
    render(<DialogoConfirmacion abierto={false} titulo="x" onConfirmar={() => {}} onCancelar={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
