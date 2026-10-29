import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { hoyEnCostaRica, formatearFechaDia } from '../compartido/utilidades/formato.js';
import { resumirProductos } from '../modulos/compras/PaginaListaCompras.jsx';

const dia = (desplazamiento) => {
  const d = new Date(`${hoyEnCostaRica()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + desplazamiento);
  return d.toISOString().slice(0, 10);
};

function Ubicacion() {
  const u = useLocation();
  return <output data-testid="ubicacion">{u.pathname}{u.search}</output>;
}

// Monta la app con sesión iniciada; `preparar` siembra productos y compras ANTES de abrir la pantalla.
async function montar(ruta = '/compras', preparar) {
  const datos = crearAdaptadorDemo({ retardoMs: 0 });
  await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const por = Object.fromEntries((await datos.unidades.listarUnidades()).map((u) => [u.abreviatura, u]));
  let n = 0;
  const comprar = (lineas, extra = {}) => datos.compras.registrarCompra({ fechaCompra: dia(0), lineas, claveIdempotencia: `ui-${++n}`, ...extra });
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  const linea = (producto, cantidad, costoUnitario = '100', extra = {}) => ({ productoId: producto.id, unidadId: producto.unidadBaseId, cantidad, costoUnitario, ...extra });
  const contexto = { datos, por, comprar, crear, linea };
  if (preparar) await preparar(contexto);
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta(contexto)]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={datos}><App /><Ubicacion /></ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return contexto;
}
const rutaDe = (r) => () => r;
const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const celdas = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent);

describe('resumirProductos', () => {
  it('lista hasta 3 nombres y resume el resto', () => {
    expect(resumirProductos(['Papa'])).toBe('Papa');
    expect(resumirProductos(['Papa', 'Arroz', 'Sal'])).toBe('Papa, Arroz, Sal');
    expect(resumirProductos(['Papa', 'Arroz', 'Sal', 'Ajo', 'Yuca'])).toBe('Papa, Arroz, Sal y 2 más');
  });
});

describe('compras: lista', () => {
  it('sin sesión redirige al inicio de sesión', async () => {
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/compras']}>
          <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
        </MemoryRouter>,
      );
    });
    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
  });

  it('desde el inicio y el menú se llega a Compras (ya no es «Próximamente»)', async () => {
    const u = userEvent.setup();
    await montar(rutaDe('/'));
    await screen.findByRole('heading', { name: 'Inicio' });
    await u.click(screen.getByRole('link', { name: 'Compras' }));
    expect(await screen.findByRole('heading', { name: 'Compras', level: 1 })).toBeInTheDocument();
  });

  it('sin compras muestra un estado vacío claro', async () => {
    await montar(rutaDe('/compras'));
    expect(await screen.findByText('Todavía no hay compras registradas')).toBeInTheDocument();
  });

  it('lista las compras de la más reciente a la más antigua con productos, líneas y total en colones', async () => {
    await montar(rutaDe('/compras'), async ({ crear, comprar, linea }) => {
      const papa = await crear('Papa'); const arroz = await crear('Arroz');
      await comprar([linea(papa, '2', '1250,75')], { fechaCompra: dia(-8) });
      await comprar([linea(papa, '1', '100'), linea(arroz, '3', '200')], { fechaCompra: dia(-2) });
    });
    await waitFor(() => expect(filas()).toHaveLength(2));
    const [nueva, vieja] = filas().map(celdas);
    expect(nueva[0]).toBe(formatearFechaDia(dia(-2)));
    expect(nueva[1]).toMatch(/Papa, Arroz|Arroz, Papa/);
    expect(nueva[2]).toBe('2');
    expect(nueva[3].replace(/\s/g, '')).toMatch(/700,00/);
    expect(vieja[0]).toBe(formatearFechaDia(dia(-8)));
    expect(vieja[3].replace(/\s/g, '')).toMatch(/2\D?501,50/);
    expect(screen.getByText('Mostrando 1–2 de 2 compras')).toBeInTheDocument();
  });

  it('filtra por fechas y por producto, conserva el filtro en la dirección y permite limpiarlo', async () => {
    const u = userEvent.setup();
    const { papa } = await (async () => {
      const ctx = {};
      await montar(rutaDe('/compras'), async ({ crear, comprar, linea }) => {
        ctx.papa = await crear('Papa'); const arroz = await crear('Arroz');
        await comprar([linea(ctx.papa, '1')], { fechaCompra: dia(-10) });
        await comprar([linea(arroz, '1')], { fechaCompra: dia(-5) });
        await comprar([linea(ctx.papa, '1'), linea(arroz, '1')], { fechaCompra: dia(-1) });
      });
      return ctx;
    })();
    await waitFor(() => expect(filas()).toHaveLength(3));

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: dia(-5) } });
    await waitFor(() => expect(filas()).toHaveLength(2));
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(`desde=${dia(-5)}`);

    await u.click(screen.getByRole('combobox', { name: 'Producto' }));
    await u.click(await screen.findByRole('option', { name: 'Papa' }));
    await waitFor(() => expect(filas()).toHaveLength(1));
    expect(celdas(filas()[0])[0]).toBe(formatearFechaDia(dia(-1)));
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(`producto=${papa.id}`);

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: dia(-3) } });
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    await u.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]);
    await waitFor(() => expect(filas()).toHaveLength(3));
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(/^\/compras$/);
  });

  it('muestra un error junto al campo si el rango de fechas está al revés', async () => {
    await montar(rutaDe(`/compras?desde=${dia(0)}&hasta=${dia(-3)}`));
    expect(await screen.findByText(/no puede ser anterior a «desde»/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
  });

  it('el filtro por producto también encuentra productos que ya se desactivaron', async () => {
    const u = userEvent.setup();
    await montar(rutaDe('/compras'), async ({ datos, crear, comprar, linea }) => {
      const papa = await crear('Papa');
      await comprar([linea(papa, '1')]);
      await datos.productos.cambiarEstadoProducto(papa.id, false);
    });
    await waitFor(() => expect(filas()).toHaveLength(1));
    await u.click(screen.getByRole('combobox', { name: 'Producto' }));
    expect(await screen.findByRole('option', { name: 'Papa (inactivo)' })).toBeInTheDocument();
  });

  it('pagina de a 20 y permite avanzar y retroceder', async () => {
    const u = userEvent.setup();
    await montar(rutaDe('/compras'), async ({ crear, comprar, linea }) => {
      const papa = await crear('Papa');
      for (let i = 0; i < 25; i += 1) await comprar([linea(papa, '1')]);
    });
    expect(await screen.findByText('Mostrando 1–20 de 25 compras')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 21–25 de 25 compras')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Mostrando 1–20 de 25 compras')).toBeInTheDocument();
  });
});

describe('compras: detalle', () => {
  it('desde la lista se abre el detalle con las líneas, los costos y el ingreso generado', async () => {
    const u = userEvent.setup();
    await montar(rutaDe('/compras'), async ({ datos, por, crear, comprar, linea }) => {
      const huevos = await crear('Huevos', por.u);
      const caja = await datos.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: por.u.id, cantidadContenida: '12' });
      const papa = await crear('Papa');
      await comprar([{ productoId: huevos.id, presentacionId: caja.id, cantidad: '3', costoUnitario: '2400' }, linea(papa, '1500', undefined, { unidadId: por.g.id, costoUnitario: undefined, costoTotal: '900' })], { nota: 'Feria del agricultor' });
    });
    await u.click(await screen.findByRole('link', { name: formatearFechaDia(dia(0)) }));
    expect(await screen.findByRole('heading', { name: `Compra del ${formatearFechaDia(dia(0))}`, level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Feria del agricultor')).toBeInTheDocument();
    const [huevosFila, papaFila] = filas().map(celdas);
    expect(huevosFila[0]).toBe('Huevos');
    expect(huevosFila[1]).toBe('3 Caja');
    expect(huevosFila[2].replace(/\s/g, '')).toMatch(/2\D?400,00porCaja/);
    expect(huevosFila[3].replace(/\s/g, '')).toMatch(/7\D?200,00/);
    expect(huevosFila[4]).toBe('+36 u');
    expect(papaFila[1].replace(/\s/g, '')).toBe('1500g'); // el separador de miles depende de la configuración regional
    expect(papaFila[4]).toBe('+1,5 kg'); // convertido a la unidad base del producto
    expect(screen.getAllByText(/8\D?100,00/).length).toBeGreaterThan(0); // total de la compra: 7200 + 900
    expect(screen.getByRole('link', { name: 'Huevos' })).toHaveAttribute('href', expect.stringMatching(/^\/productos\//));
    expect(screen.getByRole('link', { name: 'existencias' })).toHaveAttribute('href', '/inventario');
    await u.click(screen.getByRole('link', { name: 'Volver a la lista' }));
    expect(await screen.findByRole('heading', { name: 'Compras', level: 1 })).toBeInTheDocument();
  });

  it('una compra inexistente muestra un mensaje claro', async () => {
    await montar(rutaDe('/compras/no-existe'));
    expect(await screen.findByText('No se encontró la compra')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a compras' })).toHaveAttribute('href', '/compras');
  });

  it('el detalle no ofrece editar ni borrar la compra', async () => {
    const { datos } = await montar(rutaDe('/compras'), async ({ crear, comprar, linea }) => { await comprar([linea(await crear('Papa'), '1')]); });
    const { items } = await datos.compras.listarCompras();
    await act(async () => {});
    const u = userEvent.setup();
    await u.click(await screen.findByRole('link', { name: formatearFechaDia(dia(0)) }));
    expect(await screen.findByText(/no se edita/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar|borrar|eliminar/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /editar/i })).toBeNull();
    expect(items).toHaveLength(1);
  });
});
