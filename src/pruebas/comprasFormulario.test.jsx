import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { ErrorDatos, CODIGOS } from '../nucleo/datos/errores.js';
import { hoyEnCostaRica } from '../compartido/utilidades/formato.js';
import { armarEntrada } from '../modulos/compras/PaginaNuevaCompra.jsx';
import { costosDeLinea } from '../modulos/compras/LineaDeCompra.jsx';

async function montar(ruta = '/compras/nueva', preparar) {
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const por = Object.fromEntries((await datos.unidades.listarUnidades()).map((u) => [u.abreviatura, u]));
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  const contexto = { datos, por, crear };
  if (preparar) await preparar(contexto);
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return contexto;
}
const sinEspacios = (t) => t.replace(/\s/g, '');
const grupo = (n) => within(screen.getByRole('group', { name: `Línea ${n}` }));
const existencia = async (datos, producto) => (await datos.inventario.obtenerExistencia(producto.id)).cantidadBase;

// Llena una línea del formulario como lo haría una persona.
async function llenarLinea(u, n, { producto, medida, cantidad, unitario, total }) {
  const g = grupo(n);
  if (producto) {
    await u.click(g.getByRole('combobox', { name: 'Producto' }));
    await u.click(await g.findByRole('option', { name: producto }));
    await waitFor(() => expect(grupo(n).getByLabelText('Comprado en')).toBeEnabled());
  }
  if (medida) {
    await waitFor(() => expect(within(grupo(n).getByLabelText('Comprado en')).getByRole('option', { name: medida })).toBeInTheDocument());
    await u.selectOptions(grupo(n).getByLabelText('Comprado en'), medida);
  }
  if (cantidad !== undefined) await u.type(grupo(n).getByLabelText('Cantidad'), cantidad);
  if (unitario !== undefined) await u.type(grupo(n).getByLabelText('Costo unitario'), unitario);
  if (total !== undefined) await u.type(grupo(n).getByLabelText('Costo total'), total);
}
const registrar = async (u) => {
  await u.click(screen.getByRole('button', { name: 'Registrar compra' }));
  await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar compra' }));
};

describe('armarEntrada y costosDeLinea (puras)', () => {
  it('arma la entrada de registrarCompra: unidad o presentación, y solo el costo que se escribió', () => {
    const entrada = armarEntrada({
      fechaCompra: '2026-10-20', nota: 'n',
      lineas: [
        { producto: { id: 'p1' }, medida: 'u:kg', cantidad: '2', costoUnitario: '10', costoTotal: '', editado: 'unitario' },
        { producto: { id: 'p2' }, medida: 'p:caja', cantidad: '3', costoUnitario: '', costoTotal: '90', editado: 'total' },
        { producto: null, medida: '', cantidad: '', costoUnitario: '', costoTotal: '', editado: null },
      ],
    }, 'k');
    expect(entrada.lineas[0]).toEqual({ productoId: 'p1', unidadId: 'kg', cantidad: '2', costoUnitario: '10' });
    expect(entrada.lineas[1]).toEqual({ productoId: 'p2', presentacionId: 'caja', cantidad: '3', costoTotal: '90' });
    expect(entrada.lineas[2]).toEqual({ productoId: undefined, unidadId: undefined, cantidad: '' });
    expect(entrada.claveIdempotencia).toBe('k');
  });
  it('costosDeLinea calcula el costo que falta y es null si todavía no se puede', () => {
    expect(costosDeLinea({ cantidad: '3,5', editado: 'unitario', costoUnitario: '1250,75', costoTotal: '' })).toEqual({ costoUnitario: '1250.75', costoTotal: '4377.63' });
    expect(costosDeLinea({ cantidad: '3', editado: 'total', costoUnitario: '', costoTotal: '100' })).toEqual({ costoUnitario: '33.33', costoTotal: '100.00' });
    expect(costosDeLinea({ cantidad: '', editado: 'total', costoUnitario: '', costoTotal: '100' })).toBeNull();
    expect(costosDeLinea({ cantidad: '2', editado: null, costoUnitario: '', costoTotal: '' })).toBeNull();
  });
});

describe('compras: formulario', () => {
  it('desde la lista se llega al formulario con una línea vacía, la fecha de hoy y el total en cero', async () => {
    const u = userEvent.setup();
    await montar('/compras');
    await u.click(await screen.findByRole('link', { name: 'Nueva compra' }));
    expect(await screen.findByRole('heading', { name: 'Nueva compra', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha de la compra')).toHaveValue(hoyEnCostaRica());
    expect(screen.getByRole('group', { name: 'Línea 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar la línea/ })).toBeNull(); // una sola línea: no se puede quitar
    expect(sinEspacios(screen.getAllByRole('status').map((x) => x.textContent).join(' '))).toMatch(/0,00/);
  });

  it('registra una compra de una línea: pide confirmación, aumenta el inventario y lleva al detalle', async () => {
    const u = userEvent.setup();
    const { datos, crear } = await (async () => { const c = {}; Object.assign(c, await montar('/compras/nueva', async (x) => { c.papa = await x.crear('Papa'); })); return c; })();
    await llenarLinea(u, 1, { producto: 'Papa', cantidad: '10', unitario: '800' });
    expect(sinEspacios(grupo(1).getByLabelText('Costo total').value)).toBe('8000,00'); // calculado
    expect(sinEspacios(screen.getAllByRole('status').map((x) => x.textContent).join(' '))).toMatch(/8\D?000,00/);
    await registrar(u);
    expect(await screen.findByRole('heading', { name: /^Compra del/, level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Compra registrada. El inventario ya se actualizó.')).toBeInTheDocument();
    const papa = (await datos.productos.listarProductos()).items[0];
    expect(await existencia(datos, papa)).toBe('10');
    expect(await datos.inventario.verificarConsistencia()).toMatchObject({ consistente: true, movimientosRevisados: 1 });
    expect(crear).toBeDefined();
  });

  it('cancelar en la confirmación no registra nada', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/compras/nueva', async ({ crear }) => { await crear('Papa'); });
    await llenarLinea(u, 1, { producto: 'Papa', cantidad: '10', unitario: '800' });
    await u.click(screen.getByRole('button', { name: 'Registrar compra' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/inventario aumentará automáticamente/)).toBeInTheDocument();
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await datos.compras.listarCompras()).total).toBe(0);
  });

  it('una compra de dos líneas suma los dos productos y el total es la suma de las líneas', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/compras/nueva', async ({ crear, por }) => { await crear('Papa'); await crear('Huevos', por.u); });
    await llenarLinea(u, 1, { producto: 'Papa', cantidad: '10', unitario: '800' });
    await u.click(screen.getByRole('button', { name: 'Agregar otra línea' }));
    await llenarLinea(u, 2, { producto: 'Huevos', cantidad: '30', total: '3600' });
    expect(grupo(2).getByLabelText('Costo unitario')).toHaveValue('120,00'); // calculado
    expect(sinEspacios(screen.getAllByRole('status').map((x) => x.textContent).join(' '))).toMatch(/11\D?600,00/);
    await registrar(u);
    await screen.findByRole('heading', { name: /^Compra del/, level: 1 });
    const { items } = await datos.compras.listarCompras();
    expect(items[0]).toMatchObject({ total: '11600.00', cantidadLineas: 2 });
    const detalle = await datos.compras.obtenerCompra(items[0].id);
    expect(detalle.lineas.map((l) => [l.producto.nombre, l.movimiento.cantidadBase])).toEqual([['Papa', '10'], ['Huevos', '30']]);
  });

  it('con presentación: 3 cajas de 12 unidades suman 36 unidades', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/compras/nueva', async ({ datos: d, crear, por }) => {
      const huevos = await crear('Huevos', por.u);
      await d.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: por.u.id, cantidadContenida: '12' });
    });
    await llenarLinea(u, 1, { producto: 'Huevos', medida: 'Caja', cantidad: '3', unitario: '2400' });
    expect(screen.getByText('Número de caja')).toBeInTheDocument();
    await registrar(u);
    expect(await screen.findByText('+36 u')).toBeInTheDocument();
    const huevos = (await datos.productos.listarProductos()).items[0];
    expect(await existencia(datos, huevos)).toBe('36');
  });

  it('comprar en otra unidad convertible (1500 g de papa) suma 1,5 kg', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/compras/nueva', async ({ crear }) => { await crear('Papa'); });
    await llenarLinea(u, 1, { producto: 'Papa', medida: 'Gramo (g)', cantidad: '1500', total: '900' });
    await registrar(u);
    await screen.findByRole('heading', { name: /^Compra del/, level: 1 });
    expect(await existencia(datos, (await datos.productos.listarProductos()).items[0])).toBe('1.5');
  });

  it('con campos vacíos muestra todos los errores a la vez, junto a cada campo, sin pedir confirmación ni guardar', async () => {
    const u = userEvent.setup();
    const { datos } = await montar();
    await u.click(await screen.findByRole('button', { name: 'Registrar compra' }));
    const resumen = await screen.findByText('Revisá la compra antes de registrarla:');
    expect(resumen.closest('[role="alert"]')).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(grupo(1).getByLabelText('Cantidad').closest('.campo')).getByText('Escribí la cantidad.')).toBeInTheDocument();
    expect(grupo(1).getByText('Elegí el producto.')).toBeInTheDocument();
    expect(grupo(1).getByText('Elegí la unidad o la presentación.')).toBeInTheDocument();
    expect(grupo(1).getByLabelText('Cantidad')).toHaveAttribute('aria-invalid', 'true');
    expect((await datos.compras.listarCompras()).total).toBe(0);
  });

  it('rechaza una fecha futura con un mensaje junto al campo', async () => {
    const u = userEvent.setup();
    await montar('/compras/nueva', async ({ crear }) => { await crear('Papa'); });
    await llenarLinea(u, 1, { producto: 'Papa', cantidad: '1', unitario: '10' });
    const futura = new Date(`${hoyEnCostaRica()}T12:00:00Z`);
    futura.setUTCDate(futura.getUTCDate() + 3);
    fireEvent.change(screen.getByLabelText('Fecha de la compra'), { target: { value: futura.toISOString().slice(0, 10) } });
    await u.click(screen.getByRole('button', { name: 'Registrar compra' }));
    expect(await screen.findAllByText('La fecha de la compra no puede ser futura.')).not.toHaveLength(0);
    expect(screen.getByLabelText('Fecha de la compra')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('una unidad sin equivalencia configurada se rechaza en esa línea y no se guarda NADA (ni las líneas anteriores)', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/compras/nueva', async ({ datos: d, crear }) => {
      await crear('Papa'); await crear('Arroz');
      await d.unidades.crearUnidad({ nombre: 'Libra', abreviatura: 'lb', dimension: 'masa' });
    });
    await llenarLinea(u, 1, { producto: 'Papa', cantidad: '10', unitario: '800' });
    await u.click(screen.getByRole('button', { name: 'Agregar otra línea' }));
    await llenarLinea(u, 2, { producto: 'Arroz', medida: 'Libra (lb)', cantidad: '5', unitario: '900' });
    await registrar(u);
    expect((await within(screen.getByRole('group', { name: 'Línea 2' })).findAllByText(/equivalencia/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(grupo(2).getByLabelText('Comprado en')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: 'Nueva compra', level: 1 })).toBeInTheDocument(); // se queda en el formulario
    expect((await datos.compras.listarCompras()).total).toBe(0);
    for (const p of (await datos.productos.listarProductos()).items) expect(await existencia(datos, p)).toBe('0');
  });

  it('pulsar «Registrar» dos veces seguidas registra la compra una sola vez', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/compras/nueva', async ({ crear }) => { await crear('Papa'); });
    await llenarLinea(u, 1, { producto: 'Papa', cantidad: '10', unitario: '800' });
    await u.click(screen.getByRole('button', { name: 'Registrar compra' }));
    const confirmar = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar compra' });
    await u.dblClick(confirmar);
    await screen.findByRole('heading', { name: /^Compra del/, level: 1 });
    expect((await datos.compras.listarCompras()).total).toBe(1);
    expect(await existencia(datos, (await datos.productos.listarProductos()).items[0])).toBe('10');
  });

  it('si falla la conexión, al reintentar se reutiliza la misma clave de idempotencia (no se duplica)', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/compras/nueva', async ({ crear }) => { await crear('Papa'); });
    const original = datos.compras.registrarCompra.bind(datos.compras);
    const claves = [];
    datos.compras.registrarCompra = async (entrada) => {
      claves.push(entrada.claveIdempotencia);
      if (claves.length === 1) throw new ErrorDatos(CODIGOS.CONEXION);
      return original(entrada);
    };
    await llenarLinea(u, 1, { producto: 'Papa', cantidad: '10', unitario: '800' });
    await registrar(u);
    expect(await screen.findByText(/No se pudo conectar|conexión/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await datos.compras.listarCompras()).total).toBe(0);
    await registrar(u);
    await screen.findByRole('heading', { name: /^Compra del/, level: 1 });
    expect(claves).toHaveLength(2);
    expect(claves[1]).toBe(claves[0]);
    expect((await datos.compras.listarCompras()).total).toBe(1);
  });

  it('se puede quitar una línea cuando hay más de una', async () => {
    const u = userEvent.setup();
    await montar('/compras/nueva');
    await u.click(await screen.findByRole('button', { name: 'Agregar otra línea' }));
    expect(screen.getByRole('group', { name: 'Línea 2' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Quitar la línea 1' }));
    expect(screen.queryByRole('group', { name: 'Línea 2' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Línea 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar la línea/ })).toBeNull();
  });

  it('solo ofrece productos activos y completos', async () => {
    const u = userEvent.setup();
    await montar('/compras/nueva', async ({ datos, crear }) => {
      await crear('Papa'); const viejo = await crear('Yuca'); await datos.productos.cambiarEstadoProducto(viejo.id, false);
    });
    await u.click(await screen.findByRole('combobox', { name: 'Producto' }));
    expect(await screen.findByRole('option', { name: 'Papa' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Yuca/ })).toBeNull();
  });
});
