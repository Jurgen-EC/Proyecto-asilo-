import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { ErrorDatos } from '../nucleo/datos/errores.js';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { hoyEnCostaRica } from '../compartido/utilidades/formato.js';

function UbicacionActual() {
  const u = useLocation();
  return <output data-testid="ubicacion">{u.pathname}{u.search}</output>;
}

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  return {
    por,
    crear: (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id }),
    comprar: (p, cantidad, costoUnitario, extra = {}) => datos.compras.registrarCompra({
      fechaCompra: hoyEnCostaRica(), claveIdempotencia: `compra-${++n}`, lineas: [{ productoId: p.id, unidadId: p.unidadBaseId, cantidad, costoUnitario }], ...extra,
    }),
  };
}

// Compras de Papa y Arroz repartidas en febrero y marzo de 2026 (se «viaja» en el tiempo solo mientras se siembra).
async function sembrar(_d, { crear, comprar }) {
  const papa = await crear('Papa'); const arroz = await crear('Arroz');
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-02-10T18:00:00Z')); await comprar(papa, '10', '500');
    vi.setSystemTime(new Date('2026-03-05T18:00:00Z')); await comprar(papa, '5', '600'); await comprar(arroz, '8', '900');
    vi.setSystemTime(new Date('2026-03-12T18:00:00Z')); await comprar(papa, '2', '610');
  } finally {
    vi.useRealTimers();
  }
  return { papa, arroz };
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
const sinEspacios = (t) => t.replace(/[\s\u00a0\u202f]/g, '');
// Todas las filas de la tabla del reporte, como texto sin espacios (el formato de dinero usa espacios finos).
const filasDelReporte = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((f) => sinEspacios(f.textContent));
const filasDeLista = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const aNumero = (texto) => Number(texto.replace(/[^\d,]/g, '').replace(',', '.'));

describe('reporte de compras: acceso', () => {
  it('se llega desde la navegación de los reportes', async () => {
    const u = userEvent.setup();
    await montar('/reportes/inventario');
    await screen.findByRole('heading', { name: 'Reporte de inventario' });
    await u.click(within(screen.getByRole('navigation', { name: 'Reportes mensuales' })).getByRole('link', { name: 'Compras' }));
    expect(await screen.findByRole('heading', { name: 'Reporte de compras', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/reportes/compras');
  });

  it('sin compras en el mes lo explica y no deja imprimir', async () => {
    await montar('/reportes/compras?mes=2026-03');
    expect(await screen.findByText('No hay compras en marzo de 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Registrar una compra' })).toHaveAttribute('href', '/compras/nueva');
  });
});

describe('reporte de compras: contenido', () => {
  it('agrupa por producto, con las líneas, el subtotal de cada producto y el total general', async () => {
    await montar('/reportes/compras?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    expect(filasDelReporte()).toEqual([
      'Arroz',
      '05/03/2026Vercompra8kg₡900,00₡7200,00',
      'SubtotaldeArroz8kg₡7200,00',
      'Papa',
      '05/03/2026Vercompra5kg₡600,00₡3000,00',
      '12/03/2026Vercompra2kg₡610,00₡1220,00',
      'SubtotaldePapa7kg₡4220,00',
      'Totalgeneral₡11420,00',
    ]);
    expect(resumen()).toHaveTextContent('3 compras · 3 líneas · marzo de 2026');
    expect(screen.getByText(/sin promediar/)).toBeInTheDocument();
  });

  it('el total general es la suma de los subtotales, y cada subtotal la de sus líneas', async () => {
    await montar('/reportes/compras?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    const totalDe = (nombre) => aNumero(within(screen.getByRole('row', { name: new RegExp(`Subtotal de ${nombre}`) })).getByRole('link').textContent);
    const total = aNumero(within(screen.getByRole('row', { name: /Total general/ })).getByRole('link').textContent);
    expect(totalDe('Arroz') + totalDe('Papa')).toBe(total);
    expect(7200).toBe(totalDe('Arroz'));
    expect(3000 + 1220).toBe(totalDe('Papa'));
  });

  it('cada mes trae solo sus compras', async () => {
    const u = userEvent.setup();
    await montar('/reportes/compras?mes=2026-02', { preparar: sembrar });
    await screen.findByRole('table');
    expect(filasDelReporte()).toEqual(['Papa', '10/02/2026Vercompra10kg₡500,00₡5000,00', 'SubtotaldePapa10kg₡5000,00', 'Totalgeneral₡5000,00']);
    await u.selectOptions(screen.getByLabelText('Mes'), 'Abril');
    expect(await screen.findByText('No hay compras en abril de 2026')).toBeInTheDocument();
    expect(ubicacion()).toBe('/reportes/compras?mes=2026-04');
  });

  it('una compra por presentación muestra la cantidad tal como se registró y su equivalente en la unidad base', async () => {
    await montar('/reportes/compras?mes=2026-03', {
      preparar: async (d, { crear, por }) => {
        const huevos = await crear('Huevos', por.u);
        const caja = await d.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: por.u.id, cantidadContenida: '12' });
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
          vi.setSystemTime(new Date('2026-03-05T18:00:00Z'));
          await d.compras.registrarCompra({ fechaCompra: hoyEnCostaRica(), claveIdempotencia: 'k-cajas', lineas: [{ productoId: huevos.id, presentacionId: caja.id, cantidad: '3', costoUnitario: '2400' }] });
        } finally { vi.useRealTimers(); }
      },
    });
    await screen.findByRole('table');
    expect(filasDelReporte()).toEqual(['Huevos', '05/03/2026Vercompra3×Caja(36u)₡2400,00₡7200,00', 'SubtotaldeHuevos36u₡7200,00', 'Totalgeneral₡7200,00']);
  });

  it('muestra los decimales del costo sin perder precisión', async () => {
    await montar('/reportes/compras?mes=2026-03', {
      preparar: async (_d, { crear, comprar }) => {
        const harina = await crear('Harina');
        vi.useFakeTimers({ toFake: ['Date'] });
        try { vi.setSystemTime(new Date('2026-03-05T18:00:00Z')); await comprar(harina, '3.5', '1250.75'); } finally { vi.useRealTimers(); }
      },
    });
    await screen.findByRole('table');
    const [, linea] = filasDelReporte();
    expect(linea).toMatch(/3,5kg₡1250,75₡4377,6[23]$/);
  });

  it('el mes se cuenta por la fecha de la compra, no por el día en que se registró', async () => {
    await montar('/reportes/compras?mes=2026-03', {
      preparar: async (_d, { crear, comprar }) => {
        const papa = await crear('Papa');
        vi.useFakeTimers({ toFake: ['Date'] });
        try { vi.setSystemTime(new Date('2026-04-02T18:00:00Z')); await comprar(papa, '5', '100', { fechaCompra: '2026-03-31' }); } finally { vi.useRealTimers(); }
      },
    });
    await screen.findByRole('table');
    expect(filasDelReporte()[1]).toBe('31/03/2026Vercompra5kg₡100,00₡500,00');
  });

  it('un producto desactivado se sigue viendo, marcado como Inactivo', async () => {
    await montar('/reportes/compras?mes=2026-03', {
      preparar: async (d, contexto) => { const r = await sembrar(d, contexto); await d.productos.cambiarEstadoProducto(r.arroz.id, false); return r; },
    });
    await screen.findByRole('table');
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });
});

describe('reporte de compras: cada total se puede verificar', () => {
  it('«Ver compra» abre el detalle de esa compra', async () => {
    const u = userEvent.setup();
    await montar('/reportes/compras?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(screen.getByRole('link', { name: 'Ver la compra del 12/03/2026 de Papa' }));
    await waitFor(() => expect(ubicacion()).toMatch(/^\/compras\/.+/));
  });

  it('el subtotal de un producto abre sus compras del mes', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/reportes/compras?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    const enlace = screen.getByRole('link', { name: 'Ver las compras de Papa de marzo de 2026' });
    expect(enlace.getAttribute('href')).toBe(`/compras?producto=${sembrado.papa.id}&desde=2026-03-01&hasta=2026-03-31`);
    await u.click(enlace);
    await waitFor(() => expect(filasDeLista()).toHaveLength(2)); // las dos compras de papa de marzo
  });

  it('el total general abre todas las compras del mes', async () => {
    const u = userEvent.setup();
    await montar('/reportes/compras?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    const enlace = screen.getByRole('link', { name: 'Ver todas las compras de marzo de 2026' });
    expect(enlace.getAttribute('href')).toBe('/compras?desde=2026-03-01&hasta=2026-03-31');
    await u.click(enlace);
    await waitFor(() => expect(filasDeLista()).toHaveLength(3));
  });
});

describe('reporte de compras: errores y vista imprimible', () => {
  it('un mes inválido en la dirección se avisa junto al selector', async () => {
    await montar('/reportes/compras?mes=2026-00');
    expect(await screen.findByText('El mes no es válido. Usá el formato AAAA-MM, por ejemplo 2026-03.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('si falla la carga muestra el error con «Reintentar», y al reintentar aparece el reporte', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const original = datos.reportes.comprasMensuales;
    datos.reportes.comprasMensuales = vi.fn().mockRejectedValueOnce(new ErrorDatos('CONEXION')).mockImplementation(original);
    await montar('/reportes/compras?mes=2026-03', { datos, preparar: sembrar });
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo preparar el reporte');
    await u.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('Imprimir abre el diálogo y el encabezado de impresión trae la institución, el reporte, el período y la fecha', async () => {
    const u = userEvent.setup();
    const imprimir = vi.fn();
    window.print = imprimir;
    await montar('/reportes/compras?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(imprimir).toHaveBeenCalledTimes(1);
    const encabezado = document.querySelector('.encabezado-impresion');
    expect(encabezado).toHaveTextContent('Hogar de Ancianos Jafeth Jiménez Morales');
    expect(encabezado).toHaveTextContent('Reporte de compras');
    expect(encabezado).toHaveTextContent('Período: marzo de 2026');
    expect(encabezado.textContent).toMatch(/Generado el \d{2}\/\d{2}\/\d{4}.{1,3}\d{2}:\d{2}/);
    expect(screen.getByRole('navigation', { name: 'Reportes mensuales' })).toHaveClass('no-imprimir');
    expect(screen.getByLabelText('Mes').closest('.herramientas')).toHaveClass('no-imprimir');
  });
});
