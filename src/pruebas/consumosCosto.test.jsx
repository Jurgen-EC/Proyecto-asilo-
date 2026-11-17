import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { formatearDinero } from '../compartido/utilidades/formato.js';

const dinero = (v) => formatearDinero(v).replace(/\s+/g, ' ');

function UbicacionActual() {
  const u = useLocation();
  return <output data-testid="ubicacion">{u.pathname}</output>;
}

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  const ingresar = (producto, cantidad) => datos.inventario.registrarMovimiento({
    productoId: producto.id, tipo: 'ingreso', subtipo: 'compra', cantidad, unidadId: producto.unidadBaseId, claveIdempotencia: `ing-${++n}`,
  });
  const consumir = (producto, cantidad, extra = {}) => datos.consumos.registrarConsumo({
    productoId: producto.id, cantidad, unidadId: producto.unidadBaseId, claveIdempotencia: `con-${++n}`, ...extra,
  });
  return { por, crear, ingresar, consumir };
}

async function montar(ruta, { datos, preparar } = {}) {
  const adaptador = datos ?? crearAdaptadorDemo({ retardoMs: 0 });
  await adaptador.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const contexto = await prepararDatos(adaptador);
  if (preparar) await preparar(adaptador, contexto);
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={adaptador}><App /><UbicacionActual /></ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return { datos: adaptador, ...contexto };
}

// Siembra con su propio adaptador y abre la pantalla con el id real del consumo.
async function abrirDetalle(sembrar) {
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const ctx = await prepararDatos(datos);
  const papa = await ctx.crear('Papa');
  await ctx.ingresar(papa, 10);
  const consumo = (await sembrar(ctx, papa)).consumo;
  await montar(`/consumos/${consumo.id}`, { datos });
  return { datos, papa, consumo, ...ctx };
}

const ubicacion = () => screen.getByTestId('ubicacion').textContent;
const ficha = (rotulo) => screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling;
const filasDeTabla = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const celdas = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent.replace(/\s+/g, ' ').trim());
async function elegirProducto(u, nombre) {
  await u.click(screen.getByRole('combobox', { name: 'Producto' }));
  await u.click(await screen.findByRole('option', { name: nombre }));
}

describe('formulario de consumo: costo opcional', () => {
  it('el campo de costo está solo en el consumo, no en la salida', async () => {
    await montar('/consumos/nuevo');
    expect(await screen.findByLabelText('Costo del consumo (₡, opcional)')).toBeInTheDocument();
    cleanup();
    await montar('/salidas/nueva');
    await screen.findByRole('heading', { name: 'Nueva salida' });
    expect(screen.queryByLabelText(/Costo del consumo/)).toBeNull();
  });

  it('registrar un consumo con costo manual y ver el importe asociado', async () => {
    const u = userEvent.setup();
    let papa;
    const { datos } = await montar('/consumos/nuevo', { preparar: async (_d, { crear, ingresar }) => { papa = await crear('Papa'); await ingresar(papa, 5); } });
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad consumida'), '2');
    await u.type(screen.getByLabelText('Costo del consumo (₡, opcional)'), '1250,5');
    await u.click(screen.getByRole('button', { name: 'Registrar consumo' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.textContent.replace(/\s+/g, ' ')).toContain(`con un costo de ${dinero('1250.50')}`);
    await u.click(within(dialogo).getByRole('button', { name: 'Registrar consumo' }));

    expect(await screen.findByText(/Consumo registrado\./)).toBeInTheDocument();
    await waitFor(() => expect(ubicacion()).toBe('/consumos'));
    const fila = (await screen.findByRole('link', { name: 'Papa' })).closest('tr');
    expect(celdas(fila)).toContain(dinero('1250.50'));
    const guardado = (await datos.consumos.listarConsumos({ productoId: papa.id })).items[0];
    expect(guardado).toMatchObject({ costoImporte: '1250.50', costoOrigen: 'manual' });
    expect((await datos.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe('3');
  });

  it('un consumo sin costo se muestra como «Sin costo registrado», no como cero', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/consumos/nuevo', { preparar: async (_d, { crear, ingresar }) => { await ingresar(await crear('Papa'), 5); } });
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad consumida'), '1');
    await u.click(screen.getByRole('button', { name: 'Registrar consumo' }));
    expect((await screen.findByRole('dialog')).textContent).not.toMatch(/costo de/);
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar consumo' }));
    await waitFor(() => expect(ubicacion()).toBe('/consumos'));
    const fila = (await screen.findByRole('link', { name: 'Papa' })).closest('tr');
    expect(within(fila).getByText('Sin costo registrado')).toBeInTheDocument();
    expect(screen.queryByText(dinero('0'))).toBeNull();
    expect((await datos.consumos.listarConsumos()).items[0].costoImporte).toBeNull();
  });

  it('un costo inválido se avisa junto al campo y no registra nada', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/consumos/nuevo', { preparar: async (_d, { crear, ingresar }) => { await ingresar(await crear('Papa'), 5); } });
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad consumida'), '1');
    await u.type(screen.getByLabelText('Costo del consumo (₡, opcional)'), 'abc');
    await u.click(screen.getByRole('button', { name: 'Registrar consumo' }));
    const campo = screen.getByLabelText('Costo del consumo (₡, opcional)');
    expect((await screen.findAllByText('Escribí el costo del consumo con números (por ejemplo 1250,75).')).length).toBeGreaterThan(0);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await datos.consumos.listarConsumos()).total).toBe(0);
  });
});

describe('detalle del consumo y edición de su costo', () => {
  it('muestra todo lo registrado, con el origen manual del costo y el enlace a su movimiento', async () => {
    const { consumo } = await abrirDetalle(async ({ consumir }, papa) => consumir(papa, 2, { costoImporte: '1500', nota: 'Almuerzo' }));
    expect(await screen.findByRole('heading', { name: 'Consumo de Papa', level: 1 })).toBeInTheDocument();
    expect(ficha('Cantidad')).toHaveTextContent('2 kg');
    expect(ficha('Descontado')).toHaveTextContent('2 kg');
    expect(ficha('Nota')).toHaveTextContent('Almuerzo');
    expect(ficha('Costo').textContent.replace(/\s+/g, ' ')).toBe(dinero('1500'));
    expect(ficha('Origen del costo')).toHaveTextContent('Manual');
    expect(within(ficha('Movimiento')).getByRole('link')).toHaveAttribute('href', `/movimientos/${consumo.movimientoId}`);
    expect(screen.getByText('El costo no ha cambiado desde que se registró el consumo.')).toBeInTheDocument();
  });

  it('desde el listado de consumos se llega al detalle', async () => {
    const u = userEvent.setup();
    await montar('/consumos', { preparar: async (_d, { crear, ingresar, consumir }) => { const p = await crear('Papa'); await ingresar(p, 5); await consumir(p, 1); } });
    await u.click(await screen.findByRole('link', { name: 'Ver el consumo de Papa' }));
    expect(await screen.findByRole('heading', { name: 'Consumo de Papa', level: 1 })).toBeInTheDocument();
  });

  it('un consumo sin costo muestra «Sin costo registrado» y permite ponerlo: queda en el historial de cambios', async () => {
    const u = userEvent.setup();
    const { datos, consumo } = await abrirDetalle(async ({ consumir }, papa) => consumir(papa, 2));
    await screen.findByRole('heading', { name: 'Consumo de Papa' });
    expect(ficha('Costo')).toHaveTextContent('Sin costo registrado');
    expect(ficha('Origen del costo')).toHaveTextContent('—');
    expect(screen.queryByRole('button', { name: 'Quitar costo' })).toBeNull();

    await u.type(screen.getByLabelText('Costo (₡)'), '1200');
    await u.click(screen.getByRole('button', { name: 'Guardar costo' }));
    expect(await screen.findByText('Costo guardado.')).toBeInTheDocument();
    await waitFor(() => expect(ficha('Costo').textContent.replace(/\s+/g, ' ')).toBe(dinero('1200')));
    expect(ficha('Origen del costo')).toHaveTextContent('Manual');
    expect(filasDeTabla().map(celdas)).toEqual([[expect.any(String), 'Sin costo registrado', dinero('1200')]]);
    expect((await datos.consumos.obtenerConsumo(consumo.id)).costoImporte).toBe('1200.00');
  });

  it('cambiar el costo conserva el valor anterior en el historial, y quitarlo lo deja como faltante', async () => {
    const u = userEvent.setup();
    const { datos, consumo } = await abrirDetalle(async ({ consumir }, papa) => consumir(papa, 2, { costoImporte: '1000' }));
    const campo = await screen.findByLabelText('Costo (₡)');
    await waitFor(() => expect(campo).toHaveValue('1000.00'));
    await u.clear(campo);
    await u.type(campo, '1350,75');
    await u.click(screen.getByRole('button', { name: 'Guardar costo' }));
    await waitFor(() => expect(filasDeTabla()).toHaveLength(1));
    expect(celdas(filasDeTabla()[0]).slice(1)).toEqual([dinero('1000'), dinero('1350.75')]);

    await u.click(screen.getByRole('button', { name: 'Quitar costo' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('¿Quitar el costo?');
    expect(dialogo).toHaveTextContent('El valor anterior se conserva en el historial de cambios.');
    await u.click(within(dialogo).getByRole('button', { name: 'Quitar costo' }));
    expect(await screen.findByText('Costo quitado.')).toBeInTheDocument();
    await waitFor(() => expect(ficha('Costo')).toHaveTextContent('Sin costo registrado'));
    expect(filasDeTabla().map((f) => celdas(f).slice(1))).toEqual([
      [dinero('1350.75'), 'Sin costo registrado'],
      [dinero('1000'), dinero('1350.75')],
    ]);
    expect((await datos.consumos.obtenerConsumo(consumo.id)).costoCambios).toHaveLength(2);
    expect(screen.getByLabelText('Costo (₡)')).toHaveValue('');
  });

  it('guardar el mismo costo no cambia nada y lo avisa', async () => {
    const u = userEvent.setup();
    const { datos, consumo } = await abrirDetalle(async ({ consumir }, papa) => consumir(papa, 2, { costoImporte: '1000' }));
    const campo = await screen.findByLabelText('Costo (₡)');
    await waitFor(() => expect(campo).toHaveValue('1000.00'));
    await u.click(screen.getByRole('button', { name: 'Guardar costo' }));
    expect(await screen.findByText('El costo ya tenía ese valor: no se cambió nada.')).toBeInTheDocument();
    expect((await datos.consumos.obtenerConsumo(consumo.id)).costoCambios).toEqual([]);
  });

  it('un costo inválido se avisa junto al campo y no cambia nada', async () => {
    const u = userEvent.setup();
    const { datos, consumo } = await abrirDetalle(async ({ consumir }, papa) => consumir(papa, 2, { costoImporte: '1000' }));
    const campo = await screen.findByLabelText('Costo (₡)');
    await waitFor(() => expect(campo).toHaveValue('1000.00'));
    await u.clear(campo);
    await u.type(campo, '0');
    await u.click(screen.getByRole('button', { name: 'Guardar costo' }));
    expect(await screen.findByText('El costo del consumo debe ser mayor que cero.')).toBeInTheDocument();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect((await datos.consumos.obtenerConsumo(consumo.id)).costoImporte).toBe('1000.00');
  });

  it('editar el costo no toca la cantidad ni la existencia', async () => {
    const u = userEvent.setup();
    const { datos, papa } = await abrirDetalle(async ({ consumir }, p) => consumir(p, 2));
    await u.type(await screen.findByLabelText('Costo (₡)'), '900');
    await u.click(screen.getByRole('button', { name: 'Guardar costo' }));
    await screen.findByText('Costo guardado.');
    expect(ficha('Cantidad')).toHaveTextContent('2 kg');
    expect((await datos.inventario.obtenerExistencia(papa.id)).cantidadBase).toBe('8');
    expect(await datos.inventario.verificarConsistencia()).toMatchObject({ consistente: true, movimientosRevisados: 2 });
  });

  it('un consumo inexistente muestra un mensaje claro', async () => {
    await montar('/consumos/no-existe');
    expect(await screen.findByText('No se encontró el consumo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a consumos' })).toHaveAttribute('href', '/consumos');
  });
});
