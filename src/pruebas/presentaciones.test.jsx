import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { leerDecimal, decimalesDe } from '../compartido/utilidades/decimales.js';

// Monta la app en el detalle de un producto («Huevos», base: Unidad) con sesión iniciada.
async function montar(pestana = 'presentaciones') {
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const unidades = await datos.unidades.listarUnidades();
  const porAbrev = Object.fromEntries(unidades.map((x) => [x.abreviatura, x]));
  const huevos = await datos.productos.crearProducto({ nombre: 'Huevos', unidadBaseId: porAbrev.u.id });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/productos/${huevos.id}${pestana ? `?pestana=${pestana}` : ''}`]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return { datos, huevos, porAbrev };
}
const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('leerDecimal', () => {
  it('acepta punto o coma y rechaza lo que no es un número simple', () => {
    expect(leerDecimal('12,5').toString()).toBe('12.5');
    expect(leerDecimal(' 12.5 ').toString()).toBe('12.5');
    expect(leerDecimal('0.1234').toString()).toBe('0.1234');
    for (const malo of ['', 'doce', '-3', '1e3', '1,2,3', '1.250,5', '+4', null, undefined, NaN]) {
      expect(leerDecimal(malo)).toBeNull();
    }
    expect(decimalesDe('1.5000')).toBe(1);
  });
});

describe('pestañas del detalle de producto', () => {
  it('muestra Datos por defecto y cambia a Presentaciones con ratón y con teclado', async () => {
    const u = userEvent.setup();
    await montar(null);
    expect(await screen.findByRole('tab', { name: 'Datos', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Unidad base')).toBeInTheDocument();
    await u.click(screen.getByRole('tab', { name: 'Presentaciones' }));
    expect(await screen.findByRole('heading', { name: 'Presentaciones de Huevos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Presentaciones', selected: true })).toBeInTheDocument();
    await u.keyboard('{ArrowLeft}');
    expect(await screen.findByRole('tab', { name: 'Datos', selected: true })).toHaveFocus();
  });
});

describe('presentaciones de un producto', () => {
  it('sin presentaciones muestra un estado vacío con un ejemplo', async () => {
    await montar();
    expect(await screen.findByText('Este producto todavía no tiene presentaciones')).toBeInTheDocument();
    expect(screen.getByText(/Caja = 12 unidades/)).toBeInTheDocument();
  });

  it('crea «Caja de 12 unidades»: ofrece la unidad base por defecto y la muestra en la tabla', async () => {
    const u = userEvent.setup();
    const { datos, huevos } = await montar();
    await u.click(await screen.findByRole('button', { name: 'Nueva presentación' }));
    expect(screen.getByLabelText('Unidad del contenido')).toHaveDisplayValue('Unidad (u)');
    await u.type(screen.getByLabelText('Nombre de la presentación'), ' Caja ');
    await u.type(screen.getByLabelText('Cantidad que contiene'), '12');
    await u.click(screen.getByRole('button', { name: 'Crear presentación' }));
    expect(await screen.findByText('Presentación creada.')).toBeInTheDocument();
    await waitFor(() => expect(filas()).toHaveLength(1));
    expect(within(filas()[0]).getByText('Caja')).toBeInTheDocument();
    expect(within(filas()[0]).getAllByRole('cell')[1]).toHaveTextContent('12 u');
    expect(within(filas()[0]).getAllByRole('cell')[2]).toHaveTextContent('12 u'); // equivale a 12 u de la unidad base
    expect((await datos.presentaciones.listarPresentaciones(huevos.id))[0]).toMatchObject({ nombre: 'Caja', cantidadContenida: '12' });
  });

  it('acepta una fracción con coma (0,5 l) y la guarda exacta', async () => {
    const u = userEvent.setup();
    const { datos, huevos } = await montar();
    await u.click(await screen.findByRole('button', { name: 'Nueva presentación' }));
    await u.type(screen.getByLabelText('Nombre de la presentación'), 'Frasco');
    await u.type(screen.getByLabelText('Cantidad que contiene'), '0,5');
    await u.selectOptions(screen.getByLabelText('Unidad del contenido'), 'Litro (l)');
    await u.click(screen.getByRole('button', { name: 'Crear presentación' }));
    await waitFor(() => expect(filas()).toHaveLength(1));
    expect(within(filas()[0]).getAllByRole('cell')[1]).toHaveTextContent('0,5 l');
    expect(within(filas()[0]).getByText('Falta equivalencia')).toBeInTheDocument(); // litros no equivalen a unidades
    expect((await datos.presentaciones.listarPresentaciones(huevos.id))[0].cantidadContenida).toBe('0.5');
  });

  it('muestra los mensajes de validación junto a cada campo y no guarda', async () => {
    const u = userEvent.setup();
    const { datos, huevos } = await montar();
    await u.click(await screen.findByRole('button', { name: 'Nueva presentación' }));
    await u.selectOptions(screen.getByLabelText('Unidad del contenido'), '');
    await u.click(screen.getByRole('button', { name: 'Crear presentación' }));
    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText(/Escribí la cantidad con números/)).toBeInTheDocument();
    expect(screen.getByText('Elegí la unidad en la que se mide el contenido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad que contiene')).toHaveAttribute('aria-invalid', 'true');
    expect(await datos.presentaciones.listarPresentaciones(huevos.id, { estado: 'todas' })).toHaveLength(0);
  });

  it('rechaza una cantidad en cero con mensaje junto al campo', async () => {
    const u = userEvent.setup();
    const { datos, huevos } = await montar();
    await u.click(await screen.findByRole('button', { name: 'Nueva presentación' }));
    await u.type(screen.getByLabelText('Nombre de la presentación'), 'Caja');
    await u.type(screen.getByLabelText('Cantidad que contiene'), '0');
    await u.click(screen.getByRole('button', { name: 'Crear presentación' }));
    expect(await screen.findByText('La cantidad debe ser mayor que cero.')).toBeInTheDocument();
    expect(await datos.presentaciones.listarPresentaciones(huevos.id, { estado: 'todas' })).toHaveLength(0);
  });

  it('rechaza un nombre repetido dentro del mismo producto', async () => {
    const u = userEvent.setup();
    const { datos, huevos, porAbrev } = await montar();
    await datos.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' });
    await u.click(await screen.findByRole('button', { name: 'Nueva presentación' }));
    await u.type(screen.getByLabelText('Nombre de la presentación'), ' caja ');
    await u.type(screen.getByLabelText('Cantidad que contiene'), '30');
    await u.click(screen.getByRole('button', { name: 'Crear presentación' }));
    expect(await screen.findByText('Este producto ya tiene una presentación con ese nombre.')).toBeInTheDocument();
    expect(await datos.presentaciones.listarPresentaciones(huevos.id, { estado: 'todas' })).toHaveLength(1);
  });

  it('edita una presentación conservando su id', async () => {
    const u = userEvent.setup();
    const { datos, huevos, porAbrev } = await montar();
    const caja = await datos.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' });
    await u.click(await screen.findByRole('button', { name: 'Editar presentación Caja' }));
    const cantidad = screen.getByLabelText('Cantidad que contiene');
    expect(cantidad).toHaveValue('12');
    await u.clear(cantidad);
    await u.type(cantidad, '18');
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect((await datos.presentaciones.obtenerPresentacion(caja.id)).cantidadContenida).toBe('18');
    await waitFor(() => expect(within(filas()[0]).getAllByRole('cell')[1]).toHaveTextContent('18 u'));
  });

  it('desactivar pide confirmación; pasa a Inactivas y se puede reactivar', async () => {
    const u = userEvent.setup();
    const { datos, huevos, porAbrev } = await montar();
    const caja = await datos.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: porAbrev.u.id, cantidadContenida: '12' });
    await u.click(await screen.findByRole('button', { name: 'Desactivar presentación Caja' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect((await datos.presentaciones.obtenerPresentacion(caja.id)).activo).toBe(true);
    await u.click(screen.getByRole('button', { name: 'Desactivar presentación Caja' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText('Presentación desactivada.')).toBeInTheDocument();
    expect(await screen.findByText('Este producto todavía no tiene presentaciones')).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Mostrar'), 'inactivas');
    await u.click(await screen.findByRole('button', { name: 'Activar presentación Caja' }));
    expect(await screen.findByText('Presentación activada.')).toBeInTheDocument();
    expect((await datos.presentaciones.obtenerPresentacion(caja.id)).activo).toBe(true);
  });
});
