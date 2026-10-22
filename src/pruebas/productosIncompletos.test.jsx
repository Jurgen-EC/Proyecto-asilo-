import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import SelectorDeProducto from '../compartido/componentes/SelectorDeProducto.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';

const heredado = {
  id: 'v2-1', nombre: 'Frijoles', nombreNormalizado: 'frijoles', activo: true, unidadBaseId: null,
  creadoEn: '2026-10-01T12:00:00.000Z', actualizadoEn: '2026-10-01T12:00:00.000Z', creadoPor: 'demo-1',
};

// Monta con un producto de la V2 (sin unidad base) ya guardado y un producto completo (Arroz).
async function montar(ruta, contenido) {
  window.sessionStorage.setItem('inventario.demo.productos', JSON.stringify([heredado]));
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const [, , , , unidad] = await datos.unidades.listarUnidades(); // 'Unidad'
  await datos.productos.crearProducto({ nombre: 'Arroz', unidadBaseId: unidad.id });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={datos}>{contenido ?? <App />}</ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return datos;
}

describe('productos incompletos (sin unidad base)', () => {
  it('la lista los marca como Incompleto y muestra la unidad base de los demás', async () => {
    await montar('/productos');
    const filaFrijoles = (await screen.findByRole('link', { name: 'Frijoles' })).closest('tr');
    expect(within(filaFrijoles).getByText('Incompleto')).toBeInTheDocument();
    const filaArroz = screen.getByRole('link', { name: 'Arroz' }).closest('tr');
    expect(within(filaArroz).getByText('u')).toBeInTheDocument();
  });

  it('el detalle avisa que está incompleto y se completa desde Editar', async () => {
    const u = userEvent.setup();
    const datos = await montar('/productos/v2-1');
    expect(await screen.findByText(/Incompleto · sin unidad base/)).toBeInTheDocument();
    expect(screen.getByText(/no se puede usar en operaciones/i)).toBeInTheDocument();
    await u.click(screen.getByRole('link', { name: 'Editar' }));
    await waitFor(() => expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Frijoles'));
    // sin elegir unidad no se guarda
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí la unidad base del producto.');
    await u.selectOptions(screen.getByLabelText('Unidad base'), 'Kilogramo (kg)');
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Kilogramo (kg)')).toBeInTheDocument();
    expect(screen.queryByText(/Incompleto/)).toBeNull();
    expect((await datos.productos.obtenerProducto('v2-1')).unidadBaseId).toEqual(expect.any(String));
  });

  it('SelectorDeProducto no ofrece productos incompletos', async () => {
    const u = userEvent.setup();
    function Arnes() {
      const [valor, setValor] = useState(null);
      return <SelectorDeProducto valor={valor} onChange={setValor} etiqueta="Producto" />;
    }
    await montar('/', <Arnes />);
    await u.click(await screen.findByRole('combobox', { name: 'Producto' }));
    await waitFor(() => expect(screen.queryAllByRole('option').map((o) => o.textContent)).toEqual(['Arroz']));
  });
});
