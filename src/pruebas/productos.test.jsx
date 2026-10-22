import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import SelectorDeProducto from '../compartido/componentes/SelectorDeProducto.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';

// render dentro de act: deja que se asiente la lectura de la sesión antes de seguir.
async function renderizar(ui) {
  await act(async () => { render(ui); });
}

function UbicacionActual() {
  const u = useLocation();
  return <output data-testid="ubicacion">{u.pathname}</output>;
}

// Monta la aplicación con sesión ya iniciada y un adaptador demo sin retardo.
async function montar(ruta = '/productos', { conSesion = true, contenido } = {}) {
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  if (conSesion) await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  await renderizar(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorNotificaciones>
        <ProveedorAutenticacion datos={datos}>
          {contenido ?? <App />}
          <UbicacionActual />
        </ProveedorAutenticacion>
      </ProveedorNotificaciones>
    </MemoryRouter>,
  );
  return datos;
}

// Desde la V3 todo producto exige unidad base: se siembra con la primera unidad sugerida.
const sembrar = async (datos, nombres) => {
  const [unidad] = await datos.unidades.listarUnidades();
  const creados = [];
  for (const nombre of nombres) creados.push(await datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id }));
  return creados;
};
const ubicacion = () => screen.getByTestId('ubicacion').textContent;

describe('acceso', () => {
  it('sin sesión, /productos redirige al inicio de sesión', async () => {
    await montar('/productos', { conSesion: false });
    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
  });

  it('el menú y el inicio llevan al módulo de productos', async () => {
    const u = userEvent.setup();
    await montar('/');
    await screen.findByRole('heading', { name: 'Inicio' });
    await u.click(screen.getByRole('link', { name: 'Productos' }));
    expect(await screen.findByRole('heading', { name: 'Productos', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/productos');
  });
});

describe('lista de productos', () => {
  it('sin productos muestra un estado vacío con acceso a crear', async () => {
    await montar('/productos');
    expect(await screen.findByText('No hay productos activos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear producto' })).toHaveAttribute('href', '/productos/nuevo');
  });

  it('buscar azucar encuentra Azúcar mientras se escribe, y avisa cuando no hay resultados', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    await sembrar(datos, ['Azúcar', 'Arroz', 'Sal']);
    await renderizar(
      <MemoryRouter initialEntries={['/productos']}>
        <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Arroz' })).toBeInTheDocument();
    const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((f) => within(f).getAllByRole('link')[0].textContent);
    expect(filas()).toEqual(['Arroz', 'Azúcar', 'Sal']);

    await u.type(screen.getByLabelText('Buscar producto'), 'azucar');
    await waitFor(() => expect(filas()).toEqual(['Azúcar']));

    await u.clear(screen.getByLabelText('Buscar producto'));
    await u.type(screen.getByLabelText('Buscar producto'), 'zzz');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByText(/no hay productos que coincidan con «zzz»/i)).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(await screen.findByRole('link', { name: 'Sal' })).toBeInTheDocument();
  });

  it('pagina de a 20 y permite avanzar y retroceder', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    await sembrar(datos, Array.from({ length: 25 }, (_, i) => `Producto ${String(i + 1).padStart(2, '0')}`));
    await renderizar(
      <MemoryRouter initialEntries={['/productos']}>
        <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Mostrando 1–20 de 25 productos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 21–25 de 25 productos')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Mostrando 1–20 de 25 productos')).toBeInTheDocument();
  });
});

describe('crear producto', () => {
  it('crea un producto y se ve en su detalle y en la lista', async () => {
    const u = userEvent.setup();
    const datos = await montar('/productos/nuevo');
    await u.type(await screen.findByLabelText('Nombre del producto'), '  Papa ');
    await u.selectOptions(screen.getByLabelText('Unidad base'), 'Kilogramo (kg)');
    await u.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByRole('heading', { name: 'Papa', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Producto creado.')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Kilogramo (kg)')).toBeInTheDocument();
    await u.click(screen.getByRole('link', { name: 'Volver a la lista' }));
    expect(await screen.findByRole('link', { name: 'Papa' })).toBeInTheDocument();
    expect((await datos.productos.listarProductos({ estado: 'todos' })).total).toBe(1);
  });

  it('rechaza «Papa» y luego « papa » con un mensaje claro, sin crear el segundo', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    await sembrar(datos, ['Papa']);
    await renderizar(
      <MemoryRouter initialEntries={['/productos/nuevo']}>
        <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /><UbicacionActual /></ProveedorAutenticacion></ProveedorNotificaciones>
      </MemoryRouter>,
    );
    const campo = await screen.findByLabelText('Nombre del producto');
    await u.type(campo, ' papa ');
    await u.selectOptions(screen.getByLabelText('Unidad base'), 'Kilogramo (kg)');
    await u.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un producto con ese nombre.');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(ubicacion()).toBe('/productos/nuevo');
    expect((await datos.productos.listarProductos({ estado: 'todos' })).total).toBe(1);
  });

  it('muestra los mensajes de validación junto al campo', async () => {
    const u = userEvent.setup();
    await montar('/productos/nuevo');
    await u.click(await screen.findByRole('button', { name: 'Crear producto' }));
    // el nombre y la unidad base se validan juntos: los dos mensajes aparecen a la vez
    const alertas = await screen.findAllByRole('alert');
    expect(alertas.map((a) => a.textContent)).toEqual(['El nombre es obligatorio.', 'Elegí la unidad base del producto.']);
    await u.type(screen.getByLabelText('Nombre del producto'), 'a');
    await u.selectOptions(screen.getByLabelText('Unidad base'), 'Kilogramo (kg)');
    await u.click(screen.getByRole('button', { name: 'Crear producto' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/al menos 2 caracteres/i));
  });
});

describe('detalle, edición y estado', () => {
  it('editar el nombre conserva el mismo id', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const [papa] = await sembrar(datos, ['Papa']);
    await renderizar(
      <MemoryRouter initialEntries={[`/productos/${papa.id}/editar`]}>
        <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /><UbicacionActual /></ProveedorAutenticacion></ProveedorNotificaciones>
      </MemoryRouter>,
    );
    const campo = await screen.findByLabelText('Nombre del producto');
    await waitFor(() => expect(campo).toHaveValue('Papa'));
    await u.clear(campo);
    await u.type(campo, 'Papa criolla');
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('heading', { name: 'Papa criolla', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe(`/productos/${papa.id}`);
    const lista = await datos.productos.listarProductos({ estado: 'todos' });
    expect(lista.total).toBe(1);
    expect(lista.items[0].id).toBe(papa.id);
  });

  it('un producto inexistente muestra un mensaje claro', async () => {
    await montar('/productos/no-existe');
    expect(await screen.findByText('No se encontró el producto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a productos' })).toBeInTheDocument();
  });

  it('desactivar pide confirmación; el producto sale de Activos pero se ve en Inactivos y se puede reactivar', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const [papa] = await sembrar(datos, ['Papa']);
    await renderizar(
      <MemoryRouter initialEntries={[`/productos/${papa.id}`]}>
        <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
      </MemoryRouter>,
    );
    await u.click(await screen.findByRole('button', { name: 'Desactivar' }));
    const dialogo = screen.getByRole('dialog');
    // cancelar no cambia nada
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect((await datos.productos.obtenerProducto(papa.id)).activo).toBe(true);
    // confirmar desactiva
    await u.click(screen.getByRole('button', { name: 'Desactivar' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText('Producto desactivado.')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect((await datos.productos.listarProductos()).total).toBe(0);

    // en la lista: fuera de Activos, presente en Inactivos
    await u.click(screen.getByRole('link', { name: 'Volver a la lista' }));
    expect(await screen.findByText('No hay productos activos')).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Mostrar'), 'inactivos');
    await u.click(await screen.findByRole('link', { name: 'Papa' }));

    // reactivar
    await u.click(await screen.findByRole('button', { name: 'Activar' }));
    expect(await screen.findByText('Producto activado.')).toBeInTheDocument();
    expect((await datos.productos.obtenerProducto(papa.id)).activo).toBe(true);
  });
});

describe('SelectorDeProducto', () => {
  function Arnes() {
    const [valor, setValor] = useState(null);
    return (
      <>
        <SelectorDeProducto valor={valor} onChange={setValor} etiqueta="Producto a consultar" />
        <output data-testid="elegido">{valor?.nombre ?? 'ninguno'}</output>
      </>
    );
  }
  async function montarSelector() {
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const [, , yuca] = await sembrar(datos, ['Azúcar', 'Arroz', 'Yuca']);
    await datos.productos.cambiarEstadoProducto(yuca.id, false);
    await renderizar(
      <MemoryRouter>
        <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><Arnes /></ProveedorAutenticacion></ProveedorNotificaciones>
      </MemoryRouter>,
    );
    return datos;
  }
  const opciones = () => screen.queryAllByRole('option').map((o) => o.textContent);

  it('ofrece solo productos activos, busca sin tildes y permite elegir y cambiar', async () => {
    const u = userEvent.setup();
    await montarSelector();
    await u.click(await screen.findByRole('combobox', { name: 'Producto a consultar' }));
    await waitFor(() => expect(opciones()).toEqual(['Arroz', 'Azúcar'])); // Yuca está inactivo
    await u.type(screen.getByRole('combobox'), 'azucar');
    await waitFor(() => expect(opciones()).toEqual(['Azúcar']));
    await u.click(screen.getByRole('option', { name: 'Azúcar' }));
    expect(screen.getByTestId('elegido')).toHaveTextContent('Azúcar');
    expect(screen.queryByRole('combobox')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(screen.getByTestId('elegido')).toHaveTextContent('ninguno');
    expect(await screen.findByRole('combobox')).toHaveFocus();
  });

  it('se maneja con el teclado y avisa si no hay coincidencias', async () => {
    const u = userEvent.setup();
    await montarSelector();
    await u.click(await screen.findByRole('combobox'));
    await waitFor(() => expect(opciones()).toEqual(['Arroz', 'Azúcar']));
    await u.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getByTestId('elegido')).toHaveTextContent('Azúcar');
    await u.click(screen.getByRole('button', { name: 'Cambiar' }));
    await u.type(await screen.findByRole('combobox'), 'zzz');
    expect(await screen.findByText('No hay productos activos que coincidan.')).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
