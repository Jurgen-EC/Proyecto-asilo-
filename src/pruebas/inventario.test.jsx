import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';

// Monta la aplicación con sesión iniciada. `datos` permite sembrar productos y movimientos antes de abrir la pantalla.
async function montar(ruta = '/inventario', { datos, preparar } = {}) {
  const adaptador = datos ?? crearAdaptadorDemo({ retardoMs: 0 });
  await adaptador.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const contexto = await prepararDatos(adaptador);
  if (preparar) await preparar(adaptador, contexto);
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={adaptador}><App /></ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return { datos: adaptador, ...contexto };
}

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  const mover = (productoId, tipo, cantidad, extra = {}) => datos.inventario.registrarMovimiento({
    productoId, tipo, subtipo: tipo === 'ingreso' ? 'compra' : 'salida_general', cantidad, unidadId: por.kg.id,
    claveIdempotencia: `ui-${++n}`, ...extra,
  });
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  return { por, mover, crear };
}

const fila = (nombre) => screen.getByRole('link', { name: nombre }).closest('tr');

describe('inventario: lista de existencias', () => {
  it('desde el inicio y el menú se llega a Inventario', async () => {
    const u = userEvent.setup();
    await montar('/');
    await screen.findByRole('heading', { name: 'Inicio' });
    await u.click(screen.getByRole('link', { name: 'Inventario' }));
    expect(await screen.findByRole('heading', { name: 'Inventario', level: 1 })).toBeInTheDocument();
  });

  it('sin productos muestra un estado vacío con acceso al catálogo', async () => {
    await montar('/inventario');
    expect(await screen.findByText('No hay productos para mostrar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Productos' })).toHaveAttribute('href', '/productos');
  });

  it('muestra cada producto con su existencia y unidad base, y marca «Sin existencia» a los que están en cero', async () => {
    await montar('/inventario', {
      preparar: async (_d, { crear, mover, por }) => {
        const papa = await crear('Papa');
        await crear('Arroz');
        const aceite = await crear('Aceite', por.l);
        await mover(papa.id, 'ingreso', '4');
        await mover(aceite.id, 'ingreso', '2.5', { unidadId: por.l.id });
      },
    });
    expect(await screen.findByRole('link', { name: 'Papa' })).toBeInTheDocument();
    const nombres = within(screen.getByRole('table')).getAllByRole('row').slice(1).map((f) => within(f).getAllByRole('link')[0].textContent);
    expect(nombres).toEqual(['Aceite', 'Arroz', 'Papa']);
    expect(within(fila('Papa')).getByText('4 kg')).toBeInTheDocument();
    expect(within(fila('Aceite')).getByText('2,5 l')).toBeInTheDocument();
    expect(within(fila('Arroz')).getByText('0 kg')).toBeInTheDocument();
    expect(within(fila('Arroz')).getByText('Sin existencia')).toBeInTheDocument();
    expect(within(fila('Papa')).queryByText('Sin existencia')).toBeNull();
    expect(screen.getAllByText('Sin existencia')).toHaveLength(1);
  });

  it('se actualiza sola cuando se registra un movimiento (tiempo real), incluso si es rechazado el siguiente', async () => {
    let papaId;
    const { datos, mover } = await montar('/inventario', {
      preparar: async (_d, { crear }) => { papaId = (await crear('Papa')).id; },
    });
    expect(await within(await screen.findByRole('table')).findByText('Sin existencia')).toBeInTheDocument();

    await act(async () => { await mover(papaId, 'ingreso', 10); });
    expect(await screen.findByText('10 kg')).toBeInTheDocument();
    expect(screen.queryByText('Sin existencia')).toBeNull();

    await act(async () => { await mover(papaId, 'salida', 6); });
    expect(await screen.findByText('4 kg')).toBeInTheDocument();

    await act(async () => { await mover(papaId, 'salida', 5).catch(() => {}); });
    expect(await screen.findByText('4 kg')).toBeInTheDocument();
    expect((await datos.inventario.verificarConsistencia()).consistente).toBe(true);
  });

  it('el botón Actualizar ahora vuelve a pedir las existencias', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/inventario', { preparar: async (_d, { crear }) => { await crear('Papa'); } });
    await screen.findByRole('link', { name: 'Papa' });
    const original = datos.inventario.listarExistencias;
    let llamadas = 0;
    datos.inventario.listarExistencias = (...a) => { llamadas += 1; return original(...a); };
    await u.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    await waitFor(() => expect(llamadas).toBe(1));
  });

  it('el buscador ignora mayúsculas y tildes, y avisa si no hay resultados', async () => {
    const u = userEvent.setup();
    await montar('/inventario', {
      preparar: async (_d, { crear }) => { await crear('Azúcar'); await crear('Arroz'); },
    });
    await screen.findByRole('link', { name: 'Azúcar' });
    await u.type(screen.getByLabelText('Buscar producto'), 'azucar');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Arroz' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Azúcar' })).toBeInTheDocument();
    await u.clear(screen.getByLabelText('Buscar producto'));
    await u.type(screen.getByLabelText('Buscar producto'), 'zzz');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(await screen.findByRole('link', { name: 'Arroz' })).toBeInTheDocument();
  });

  it('un producto inactivo con existencia no se pierde: aparece con el filtro Inactivos o Todos', async () => {
    const u = userEvent.setup();
    await montar('/inventario', {
      preparar: async (d, { crear, mover }) => {
        const papa = await crear('Papa');
        await mover(papa.id, 'ingreso', 3);
        await d.productos.cambiarEstadoProducto(papa.id, false);
      },
    });
    expect(await screen.findByText('No hay productos para mostrar')).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Mostrar'), 'inactivos');
    const f = fila(await screen.findByRole('link', { name: 'Papa' }).then((l) => l.textContent));
    expect(within(f).getByText('3 kg')).toBeInTheDocument();
    expect(within(f).getByText('Inactivo')).toBeInTheDocument();
  });

  it('avisa cuántos productos no aparecen por no tener unidad base (heredados de la V2)', async () => {
    const heredado = {
      id: 'v2-1', nombre: 'Frijoles', nombreNormalizado: 'frijoles', activo: true, unidadBaseId: null,
      creadoEn: '2026-10-01T12:00:00.000Z', actualizadoEn: '2026-10-01T12:00:00.000Z', creadoPor: 'demo-1',
    };
    window.sessionStorage.setItem('inventario.demo.productos', JSON.stringify([heredado]));
    await montar('/inventario', { preparar: async (_d, { crear }) => { await crear('Papa'); } });
    expect(await screen.findByRole('link', { name: 'Papa' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Frijoles' })).toBeNull();
    const aviso = screen.getByText(/1 producto no aparece aquí porque no tiene unidad base\./).closest('p');
    expect(within(aviso).getByRole('link', { name: 'Completalos en Productos' })).toHaveAttribute('href', '/productos');
  });

  it('pagina de a 20', async () => {
    const u = userEvent.setup();
    await montar('/inventario', {
      preparar: async (_d, { crear }) => {
        for (let i = 1; i <= 25; i += 1) await crear(`Producto ${String(i).padStart(2, '0')}`);
      },
    });
    expect(await screen.findByText('Mostrando 1–20 de 25 productos')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 21–25 de 25 productos')).toBeInTheDocument();
  });
});

describe('inventario: panel de DATOS DE DEMOSTRACIÓN', () => {
  async function elegirProducto(u, nombre) {
    await u.click(screen.getByRole('combobox', { name: 'Producto' }));
    await u.click(await screen.findByRole('option', { name: nombre }));
  }
  async function registrar(u, { tipo, cantidad }) {
    await u.selectOptions(screen.getByLabelText('Movimiento'), tipo);
    const campo = screen.getByLabelText('Cantidad');
    await u.clear(campo);
    await u.type(campo, cantidad);
    await u.click(screen.getByRole('button', { name: 'Registrar movimiento de prueba' }));
  }

  it('está claramente rotulado y permite probar ingreso, salida y el rechazo de una salida excesiva', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/inventario', { preparar: async (_d, { crear }) => { await crear('Papa'); } });
    await screen.findByRole('link', { name: 'Papa' });
    await u.click(screen.getByText(/DATOS DE DEMOSTRACIÓN · Registrar un movimiento de prueba/));
    expect(screen.getByText(/solo para desarrollo/i)).toBeInTheDocument();

    await elegirProducto(u, 'Papa');
    await registrar(u, { tipo: 'ingreso', cantidad: '10' });
    expect(await screen.findByText(/Ingreso de demostración registrado\. Existencia: 10 kg\./)).toBeInTheDocument();
    await waitFor(() => expect(within(fila('Papa')).getByText('10 kg')).toBeInTheDocument());

    await registrar(u, { tipo: 'salida', cantidad: '6' });
    await waitFor(() => expect(within(fila('Papa')).getByText('4 kg')).toBeInTheDocument());

    await registrar(u, { tipo: 'salida', cantidad: '5' });
    expect(await screen.findByText(/No hay cantidad suficiente de «Papa»\. Disponible: 4 kg\./)).toBeInTheDocument();
    expect(within(fila('Papa')).getByText('4 kg')).toBeInTheDocument();
    expect((await datos.inventario.verificarConsistencia())).toMatchObject({ consistente: true, movimientosRevisados: 2 });
  });

  it('todo lo registrado desde el panel queda marcado como datos de demostración', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/inventario', { preparar: async (_d, { crear }) => { await crear('Papa'); } });
    await screen.findByRole('link', { name: 'Papa' });
    await u.click(screen.getByText(/DATOS DE DEMOSTRACIÓN · Registrar/));
    await elegirProducto(u, 'Papa');
    await registrar(u, { tipo: 'ingreso', cantidad: '2' });
    await screen.findByText(/Ingreso de demostración registrado/);
    const guardado = JSON.parse(window.sessionStorage.getItem('inventario.demo.inventario'));
    expect(guardado.movimientos).toHaveLength(1);
    expect(guardado.movimientos[0].nota).toBe('DATOS DE DEMOSTRACIÓN');
    expect(datos.esDemo).toBe(true);
  });

  it('muestra los errores junto a cada campo (sin producto, cantidad vacía, unidad sin equivalencia)', async () => {
    const u = userEvent.setup();
    await montar('/inventario', { preparar: async (_d, { crear }) => { await crear('Papa'); } });
    await screen.findByRole('link', { name: 'Papa' });
    await u.click(screen.getByText(/DATOS DE DEMOSTRACIÓN · Registrar/));
    await u.click(screen.getByRole('button', { name: 'Registrar movimiento de prueba' }));
    expect(await screen.findByText('Elegí el producto.')).toBeInTheDocument();
    expect(screen.getByText('Escribí la cantidad.')).toBeInTheDocument();

    await elegirProducto(u, 'Papa');
    await u.selectOptions(screen.getByLabelText('Unidad'), screen.getByRole('option', { name: 'Litro (l)' }));
    await registrar(u, { tipo: 'ingreso', cantidad: '1' });
    expect(await screen.findByText(/Esas unidades miden cosas distintas/)).toBeInTheDocument();
  });

  it('NO aparece cuando el adaptador no es de demostración', async () => {
    const real = { ...crearAdaptadorDemo({ retardoMs: 0 }), esDemo: false };
    await montar('/inventario', { datos: real, preparar: async (_d, { crear }) => { await crear('Papa'); } });
    expect(await screen.findByRole('link', { name: 'Papa' })).toBeInTheDocument();
    expect(screen.queryByText(/DATOS DE DEMOSTRACIÓN/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar movimiento de prueba' })).toBeNull();
  });
});

describe('unidad base de un producto con movimientos', () => {
  it('el formulario muestra el bloqueo junto al campo y no cambia nada', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const { crear, mover, por } = await prepararDatos(datos);
    const papa = await crear('Papa');
    await mover(papa.id, 'ingreso', 2);
    await montar(`/productos/${papa.id}/editar`, { datos });

    const unidad = await screen.findByLabelText('Unidad base');
    await waitFor(() => expect(unidad).toHaveValue(por.kg.id));
    await u.selectOptions(unidad, por.g.id);
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/No se puede cambiar la unidad base: el producto ya tiene movimientos\./)).toBeInTheDocument();
    expect((await datos.productos.obtenerProducto(papa.id)).unidadBaseId).toBe(por.kg.id);
  });
});
