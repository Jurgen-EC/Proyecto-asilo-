import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { ErrorDatos } from '../nucleo/datos/errores.js';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { hoyEnCostaRica } from '../compartido/utilidades/formato.js';
import { rangoDelMes } from '../modulos/movimientos/periodos.js';

function UbicacionActual() {
  const u = useLocation();
  return <output data-testid="ubicacion">{u.pathname}{u.search}</output>;
}

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  const mover = (p, extra) => datos.inventario.registrarMovimiento({ productoId: p.id, unidadId: p.unidadBaseId, claveIdempotencia: `mov-${++n}`, ...extra });
  return {
    por, crear,
    ingresar: (p, cantidad, extra = {}) => mover(p, { tipo: 'ingreso', subtipo: 'compra', cantidad, ...extra }),
    ajustar: (p, sentido, cantidad) => mover(p, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido, cantidad }),
    salir: (p, cantidad) => datos.salidas.registrarSalida({ productoId: p.id, cantidad, unidadId: p.unidadBaseId, motivo: 'Donación', claveIdempotencia: `sal-${++n}` }),
    consumir: (p, cantidad) => datos.consumos.registrarConsumo({ productoId: p.id, cantidad, unidadId: p.unidadBaseId, claveIdempotencia: `con-${++n}` }),
    comprar: (p, cantidad) => datos.compras.registrarCompra({
      fechaCompra: hoyEnCostaRica(), claveIdempotencia: `compra-${++n}`,
      lineas: [{ productoId: p.id, unidadId: p.unidadBaseId, cantidad, costoUnitario: '100' }],
    }),
  };
}

async function montar(ruta, { datos, preparar } = {}) {
  const adaptador = datos ?? crearAdaptadorDemo({ retardoMs: 0 });
  await adaptador.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const contexto = await prepararDatos(adaptador);
  const sembrado = preparar ? await preparar(adaptador, contexto) : undefined;
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion datos={adaptador}><App /><UbicacionActual /></ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return { datos: adaptador, ...contexto, sembrado };
}

const ubicacion = () => screen.getByTestId('ubicacion').textContent;
const resumen = () => document.querySelector('.resumen-lista');
const filasDeTabla = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const celdas = (fila) => within(fila).getAllByRole('cell');
const filaDe = (nombre) => filasDeTabla().find((f) => celdas(f)[0].textContent === nombre);
async function elegirProducto(u, nombre) {
  await u.click(screen.getByRole('combobox', { name: 'Producto' }));
  await u.click(await screen.findByRole('option', { name: nombre }));
}
// Papa: compra 10, salida 2, consumo 1, ajuste -1.  Arroz: ingreso 7.
async function sembrar(_datos, { crear, comprar, ingresar, salir, consumir, ajustar }) {
  const papa = await crear('Papa'); const arroz = await crear('Arroz');
  await comprar(papa, '10'); await salir(papa, '2'); await consumir(papa, '1'); await ajustar(papa, -1, '1');
  await ingresar(arroz, '7');
  return { papa, arroz };
}
const efectos = () => filasDeTabla().map((f) => celdas(f)[4].textContent);

describe('consolidado: acceso y contenido', () => {
  it('se llega desde la navegación del módulo de movimientos', async () => {
    const u = userEvent.setup();
    await montar('/movimientos');
    await screen.findByRole('heading', { name: 'Historial de movimientos' });
    await u.click(within(screen.getByRole('navigation', { name: 'Vistas de movimientos' })).getByRole('link', { name: 'Consolidado' }));
    expect(await screen.findByRole('heading', { name: 'Consolidado de movimientos', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/movimientos/consolidado');
  });

  it('sin movimientos muestra el estado vacío', async () => {
    await montar('/movimientos/consolidado');
    expect(await screen.findByText('Todavía no hay movimientos')).toBeInTheDocument();
  });

  it('muestra por producto las entradas, las salidas (con consumo aparte), la diferencia y los ajustes', async () => {
    await montar('/movimientos/consolidado', { preparar: sembrar });
    await screen.findByRole('table');
    expect(filasDeTabla().map((f) => celdas(f)[0].textContent)).toEqual(['Arroz', 'Papa']); // por nombre
    const papa = celdas(filaDe('Papa')).map((c) => c.textContent);
    expect(papa[1]).toBe('10 kg');
    expect(papa[2]).toBe('3 kgSalida general: 2 kg · Consumo: 1 kg');
    expect(papa[3]).toBe('+7 kg');
    expect(papa[4]).toBe('−1 kg');
    const arroz = celdas(filaDe('Arroz')).map((c) => c.textContent);
    expect(arroz.slice(1)).toEqual(['7 kg', '0 kgSalida general: 0 kg · Consumo: 0 kg', '+7 kg', '0 kg']);
    expect(resumen()).toHaveTextContent('5 movimientos en 2 productos · Todo el historial');
    expect(screen.getByText(/no se suman entre productos/)).toBeInTheDocument();
  });

  it('los totales en cero no son enlaces: no hay movimientos que abrir', async () => {
    await montar('/movimientos/consolidado', { preparar: sembrar });
    await screen.findByRole('table');
    expect(within(filaDe('Arroz')).queryByRole('link', { name: /salida/i })).toBeNull();
    expect(within(filaDe('Arroz')).queryByRole('link', { name: /ajuste/i })).toBeNull();
    expect(within(filaDe('Arroz')).getByRole('link', { name: 'Ver el ingreso de Arroz' })).toBeInTheDocument();
  });

  it('un ajuste no cuenta como entrada ni como salida', async () => {
    await montar('/movimientos/consolidado', {
      preparar: async (_d, { crear, ingresar, ajustar }) => { const p = await crear('Papa'); await ingresar(p, '10'); await ajustar(p, 1, '5'); },
    });
    await screen.findByRole('table');
    const f = celdas(filaDe('Papa')).map((c) => c.textContent);
    expect([f[1], f[3], f[4]]).toEqual(['10 kg', '+10 kg', '+5 kg']);
  });
});

describe('consolidado: cada total se puede verificar abriendo los movimientos que lo componen', () => {
  it('Entradas abre los ingresos del producto', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/movimientos/consolidado', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(within(filaDe('Papa')).getByRole('link', { name: 'Ver el ingreso de Papa' }));
    expect(await screen.findByRole('heading', { name: 'Ingresos', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe(`/movimientos/ingresos?producto=${sembrado.papa.id}`);
    await waitFor(() => expect(efectos()).toEqual(['+10 kg']));
  });

  it('Salidas abre las salidas y los consumos del producto, y su suma es el total; el desglose abre cada clase', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/movimientos/consolidado', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(within(filaDe('Papa')).getByRole('link', { name: 'Ver las 2 salidas de Papa' }));
    expect(await screen.findByRole('heading', { name: 'Salidas', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe(`/movimientos/salidas?producto=${sembrado.papa.id}`);
    await waitFor(() => expect(efectos()).toEqual(['−1 kg', '−2 kg'])); // 1 + 2 = los 3 kg del consolidado
    await u.click(screen.getByRole('link', { name: 'Consolidado' }));
    await screen.findByRole('table');
    await u.click(within(filaDe('Papa')).getByRole('link', { name: 'Ver los consumos de Papa' }));
    await waitFor(() => expect(efectos()).toEqual(['−1 kg']));
    expect(ubicacion()).toBe(`/movimientos/salidas?producto=${sembrado.papa.id}&clase=consumo`);
  });

  it('Ajustes abre los ajustes del producto en el historial completo', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/movimientos/consolidado', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(within(filaDe('Papa')).getByRole('link', { name: 'Ver el ajuste de Papa' }));
    expect(await screen.findByRole('heading', { name: 'Historial de movimientos' })).toBeInTheDocument();
    expect(ubicacion()).toBe(`/movimientos?producto=${sembrado.papa.id}&tipo=ajuste`);
    await waitFor(() => expect(efectos()).toEqual(['−1 kg']));
  });

  it('con un período elegido, los enlaces conservan el producto y el período', async () => {
    const hoy = hoyEnCostaRica();
    const { sembrado } = await montar(`/movimientos/consolidado?desde=${hoy}&hasta=${hoy}`, { preparar: sembrar });
    await screen.findByRole('table');
    const enlace = within(filaDe('Papa')).getByRole('link', { name: 'Ver el ingreso de Papa' });
    expect(enlace.getAttribute('href')).toBe(`/movimientos/ingresos?producto=${sembrado.papa.id}&desde=${hoy}&hasta=${hoy}`);
    expect(resumen()).toHaveTextContent(/^5 movimientos en 2 productos · Del \d{2}\/\d{2}\/\d{4} al \d{2}\/\d{2}\/\d{4}$/);
  });
});

describe('consolidado: período y producto', () => {
  it('«Este mes» incluye lo de hoy y «Mes anterior» deja el período sin movimientos', async () => {
    const u = userEvent.setup();
    await montar('/movimientos/consolidado', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(screen.getByRole('button', { name: 'Este mes' }));
    const mes = rangoDelMes(0);
    await waitFor(() => expect(ubicacion()).toBe(`/movimientos/consolidado?desde=${mes.desde}&hasta=${mes.hasta}`));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(filasDeTabla()).toHaveLength(2);
    await u.click(screen.getByRole('button', { name: 'Mes anterior' }));
    const anterior = rangoDelMes(-1);
    await waitFor(() => expect(ubicacion()).toBe(`/movimientos/consolidado?desde=${anterior.desde}&hasta=${anterior.hasta}`));
    expect(await screen.findByText('No hay movimientos en este período')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Ver todo el historial' }));
    await waitFor(() => expect(filasDeTabla()).toHaveLength(2));
    expect(ubicacion()).toBe('/movimientos/consolidado');
  });

  it('las fechas se pueden escribir a mano; un rango de mañana no trae movimientos', async () => {
    await montar('/movimientos/consolidado', { preparar: sembrar });
    await screen.findByRole('table');
    const manana = new Date(`${hoyEnCostaRica()}T12:00:00Z`);
    manana.setUTCDate(manana.getUTCDate() + 1);
    const dia = manana.toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: dia } });
    expect(await screen.findByText('No hay movimientos en este período')).toBeInTheDocument();
    expect(ubicacion()).toBe(`/movimientos/consolidado?desde=${dia}`);
  });

  it('se limita a un producto', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/movimientos/consolidado', { preparar: sembrar });
    await screen.findByRole('table');
    await elegirProducto(u, 'Arroz');
    await waitFor(() => expect(filasDeTabla()).toHaveLength(1));
    expect(celdas(filasDeTabla()[0])[0].textContent).toBe('Arroz');
    expect(ubicacion()).toBe(`/movimientos/consolidado?producto=${sembrado.arroz.id}`);
    expect(resumen()).toHaveTextContent('1 movimiento en 1 producto');
  });

  it('avisa de unas fechas invertidas junto al campo', async () => {
    await montar('/movimientos/consolidado?desde=2026-03-10&hasta=2026-03-01');
    expect(await screen.findByText('La fecha «hasta» no puede ser anterior a «desde».')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
  });

  it('si falla el cálculo muestra el error con «Reintentar», y al reintentar aparece el consolidado', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const { crear, ingresar } = await prepararDatos(datos);
    await ingresar(await crear('Papa'), '5');
    const original = datos.movimientos.consolidarMovimientos;
    datos.movimientos.consolidarMovimientos = vi.fn().mockRejectedValueOnce(new ErrorDatos('CONEXION')).mockImplementation(original);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/movimientos/consolidado']}>
          <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
        </MemoryRouter>,
      );
    });
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo calcular el consolidado');
    await u.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(filasDeTabla()).toHaveLength(1);
  });
});

describe('historial de un producto desde Inventario y desde su detalle', () => {
  it('cada fila del inventario tiene «Ver movimientos» que abre el historial de ese producto', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/inventario', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(screen.getByRole('link', { name: 'Ver movimientos de Papa' }));
    expect(await screen.findByRole('heading', { name: 'Historial de movimientos' })).toBeInTheDocument();
    expect(ubicacion()).toBe(`/movimientos?producto=${sembrado.papa.id}`);
    await waitFor(() => expect(filasDeTabla()).toHaveLength(4));
    expect(filasDeTabla().every((f) => celdas(f)[1].textContent === 'Papa')).toBe(true);
  });

  it('el detalle de un producto tiene «Ver movimientos del producto»', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/', { preparar: sembrar });
    await screen.findByRole('heading', { name: 'Inicio' });
    window.history.pushState({}, '', '/');
    await u.click(screen.getByRole('link', { name: 'Productos' }));
    await u.click(await screen.findByRole('link', { name: 'Papa' }));
    await u.click(await screen.findByRole('link', { name: 'Ver movimientos del producto' }));
    expect(await screen.findByRole('heading', { name: 'Historial de movimientos' })).toBeInTheDocument();
    expect(ubicacion()).toBe(`/movimientos?producto=${sembrado.papa.id}`);
    await waitFor(() => expect(filasDeTabla()).toHaveLength(4));
  });
});
