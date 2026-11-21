import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { ErrorDatos } from '../nucleo/datos/errores.js';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { hoyEnCostaRica } from '../compartido/utilidades/formato.js';
import { mesDeHoy } from '../compartido/utilidades/periodo.js';

function UbicacionActual() {
  const u = useLocation();
  return <output data-testid="ubicacion">{u.pathname}{u.search}</output>;
}

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  const mover = (p, extra) => datos.inventario.registrarMovimiento({ productoId: p.id, unidadId: p.unidadBaseId, claveIdempotencia: `mov-${++n}`, ...extra });
  return {
    por,
    crear: (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id }),
    ajustar: (p, sentido, cantidad) => mover(p, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido, cantidad }),
    salir: (p, cantidad) => datos.salidas.registrarSalida({ productoId: p.id, cantidad, unidadId: p.unidadBaseId, motivo: 'Donación', claveIdempotencia: `sal-${++n}` }),
    consumir: (p, cantidad) => datos.consumos.registrarConsumo({ productoId: p.id, cantidad, unidadId: p.unidadBaseId, claveIdempotencia: `con-${++n}` }),
    comprar: (p, cantidad, costoUnitario = '100') => datos.compras.registrarCompra({
      fechaCompra: hoyEnCostaRica(), claveIdempotencia: `compra-${++n}`, lineas: [{ productoId: p.id, unidadId: p.unidadBaseId, cantidad, costoUnitario }],
    }),
  };
}

// Papa y Arroz repartidos en febrero y marzo de 2026 (se «viaja» en el tiempo solo mientras se siembra).
async function sembrar(_d, { crear, comprar, salir, consumir, ajustar }) {
  const papa = await crear('Papa'); const arroz = await crear('Arroz');
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-02-10T18:00:00Z')); await comprar(papa, '10');
    vi.setSystemTime(new Date('2026-03-05T18:00:00Z')); await comprar(papa, '5'); await comprar(arroz, '8');
    vi.setSystemTime(new Date('2026-03-10T18:00:00Z')); await salir(papa, '3');
    vi.setSystemTime(new Date('2026-03-15T18:00:00Z')); await consumir(papa, '2');
    vi.setSystemTime(new Date('2026-03-20T18:00:00Z')); await ajustar(papa, -1, '1'); await ajustar(papa, 1, '4');
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
const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const celdas = (fila) => within(fila).getAllByRole('cell');
const textos = (fila) => celdas(fila).map((c) => c.textContent);
const filaDe = (nombre) => filas().find((f) => celdas(f)[0].textContent.startsWith(nombre));
const numero = (texto) => Number(texto.replace(/[^\d,+−-]/g, '').replace('−', '-').replace(',', '.').replace('+', ''));

describe('reporte de inventario: acceso', () => {
  it('sin sesión redirige al inicio de sesión', async () => {
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/reportes/inventario']}>
          <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
        </MemoryRouter>,
      );
    });
    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
  });

  it('desde el menú se llega a los reportes y /reportes lleva al de inventario', async () => {
    const u = userEvent.setup();
    await montar('/');
    await screen.findByRole('heading', { name: 'Inicio' });
    await u.click(screen.getByRole('link', { name: 'Reportes mensuales' }));
    expect(await screen.findByRole('heading', { name: 'Reporte de inventario', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/reportes/inventario');
    expect(screen.getByRole('link', { name: 'Reportes mensuales' })).toHaveClass('menu__enlace--activo');
    expect(within(screen.getByRole('navigation', { name: 'Reportes mensuales' })).getByRole('link', { name: 'Inventario' })).toBeInTheDocument();
  });

  it('una dirección que no existe dentro del módulo no rompe la pantalla', async () => {
    await montar('/reportes/inexistente');
    expect(await screen.findByText(/página no encontrada/i)).toBeInTheDocument();
  });

  it('sin indicar el mes usa el mes de hoy; sin datos explica que no hay existencias', async () => {
    await montar('/reportes/inventario');
    expect(await screen.findByText('No hay existencias que reportar')).toBeInTheDocument();
    expect(screen.getByLabelText('Mes')).toHaveValue(mesDeHoy().slice(5, 7));
    expect(screen.getByLabelText('Año')).toHaveValue(mesDeHoy().slice(0, 4));
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled();
  });
});

describe('estado al cierre del mes', () => {
  it('muestra la existencia de cada producto al último día del mes, sin mezclar meses', async () => {
    await montar('/reportes/inventario?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    expect(filas().map((f) => celdas(f)[0].textContent)).toEqual(['Arroz', 'Papa']); // por nombre
    expect(textos(filaDe('Arroz'))).toEqual(['Arroz', '8 kg', '1']);
    expect(textos(filaDe('Papa'))).toEqual(['Papa', '13 kg', '6']);
    expect(resumen()).toHaveTextContent('2 productos · Existencias al 31/03/2026');
    expect(screen.getByRole('tab', { name: 'Estado al cierre del mes', selected: true })).toBeInTheDocument();
  });

  it('febrero solo trae lo que ya existía a fin de febrero', async () => {
    await montar('/reportes/inventario?mes=2026-02', { preparar: sembrar });
    await screen.findByRole('table');
    expect(filas()).toHaveLength(1);
    expect(textos(filaDe('Papa'))).toEqual(['Papa', '10 kg', '1']);
    expect(resumen()).toHaveTextContent('1 producto · Existencias al 28/02/2026');
  });

  it('el selector cambia el mes y la dirección lo conserva', async () => {
    const u = userEvent.setup();
    await montar('/reportes/inventario?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    await u.selectOptions(screen.getByLabelText('Mes'), 'Febrero');
    await waitFor(() => expect(filas()).toHaveLength(1));
    expect(ubicacion()).toBe('/reportes/inventario?mes=2026-02');
    expect(textos(filaDe('Papa'))[1]).toBe('10 kg');
  });

  it('los movimientos de cada producto se pueden abrir y son exactamente los que componen la existencia', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/reportes/inventario?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    const enlace = screen.getByRole('link', { name: 'Ver los 6 movimientos de Papa hasta el 31/03/2026' });
    expect(enlace.getAttribute('href')).toBe(`/movimientos?producto=${sembrado.papa.id}&hasta=2026-03-31`);
    await u.click(enlace);
    expect(await screen.findByRole('heading', { name: 'Historial de movimientos' })).toBeInTheDocument();
    await waitFor(() => expect(filas()).toHaveLength(6));
  });

  it('un producto desactivado se sigue viendo, marcado como Inactivo', async () => {
    await montar('/reportes/inventario?mes=2026-03', {
      preparar: async (d, contexto) => { const r = await sembrar(d, contexto); await d.productos.cambiarEstadoProducto(r.papa.id, false); return r; },
    });
    await screen.findByRole('table');
    expect(within(celdas(filaDe('Papa'))[0]).getByText('Inactivo')).toBeInTheDocument();
  });

  it('un mes sin movimientos hasta esa fecha dice que todavía no hay nada', async () => {
    await montar('/reportes/inventario?mes=2025-12', { preparar: sembrar });
    expect(await screen.findByText('No hay existencias que reportar')).toBeInTheDocument();
    expect(screen.getByText(/Todavía no hay movimientos registrados hasta el 31\/12\/2025/)).toBeInTheDocument();
  });
});

describe('resumen del mes', () => {
  const irAlResumen = async (u) => u.click(await screen.findByRole('tab', { name: 'Resumen del mes' }));

  it('al cambiar de pestaña muestra saldo inicial, ingresos, salidas (con consumo aparte), ajustes y saldo final', async () => {
    const u = userEvent.setup();
    await montar('/reportes/inventario?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    await irAlResumen(u);
    await waitFor(() => expect(ubicacion()).toBe('/reportes/inventario?mes=2026-03&vista=resumen'));
    expect(screen.getByRole('tab', { name: 'Resumen del mes', selected: true })).toBeInTheDocument();
    await waitFor(() => expect(textos(filaDe('Papa'))).toEqual(['Papa', '10 kg', '5 kg', '5 kgSalida general: 3 kg · Consumo: 2 kg', '+3 kg', '13 kg']));
    expect(textos(filaDe('Arroz'))).toEqual(['Arroz', '0 kg', '8 kg', '0 kgSalida general: 0 kg · Consumo: 0 kg', '0 kg', '8 kg']);
    expect(resumen()).toHaveTextContent('6 movimientos en 2 productos · marzo de 2026');
    expect(screen.getByText(/Saldo inicial \+ Ingresos − Salidas ± Ajustes = Saldo final/)).toBeInTheDocument();
  });

  it('saldo inicial + ingresos − salidas + ajustes = saldo final en cada fila', async () => {
    await montar('/reportes/inventario?mes=2026-03&vista=resumen', { preparar: sembrar });
    await screen.findByRole('table');
    for (const fila of filas()) {
      const [, inicial, ingresos, salidas, ajustes, final] = textos(fila).map((t) => numero(t.split('Salida general')[0]));
      expect(inicial + ingresos - salidas + ajustes).toBe(final);
    }
  });

  it('el saldo inicial es la existencia al cierre del mes anterior', async () => {
    const u = userEvent.setup();
    await montar('/reportes/inventario?mes=2026-02', { preparar: sembrar });
    await screen.findByRole('table');
    const cierreFebrero = textos(filaDe('Papa'))[1]; // 10 kg
    await u.selectOptions(screen.getByLabelText('Mes'), 'Marzo');
    await irAlResumen(u);
    await waitFor(() => expect(textos(filaDe('Papa'))[1]).toBe(cierreFebrero));
  });

  it('cada total abre los movimientos que lo componen, con el mismo producto y período', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/reportes/inventario?mes=2026-03&vista=resumen', { preparar: sembrar });
    await screen.findByRole('table');
    const ingresos = screen.getByRole('link', { name: 'Ver el ingreso de Papa' });
    expect(ingresos.getAttribute('href')).toBe(`/movimientos/ingresos?producto=${sembrado.papa.id}&desde=2026-03-01&hasta=2026-03-31`);
    await u.click(ingresos);
    await waitFor(() => expect(filas()).toHaveLength(1));
    expect(textos(filas()[0])[4]).toBe('+5 kg');
  });

  it('las salidas abren las salidas y los consumos, y su suma es el total del reporte', async () => {
    const u = userEvent.setup();
    await montar('/reportes/inventario?mes=2026-03&vista=resumen', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(screen.getByRole('link', { name: 'Ver las 2 salidas de Papa' }));
    await waitFor(() => expect(filas()).toHaveLength(2));
    expect(filas().map((f) => numero(textos(f)[4])).reduce((t, x) => t + x, 0)).toBe(-5);
  });

  it('los ajustes abren sus movimientos; los totales en cero no son enlaces', async () => {
    const u = userEvent.setup();
    await montar('/reportes/inventario?mes=2026-03&vista=resumen', { preparar: sembrar });
    await screen.findByRole('table');
    expect(within(filaDe('Arroz')).queryByRole('link', { name: /salida|ajuste/i })).toBeNull();
    await u.click(screen.getByRole('link', { name: 'Ver los 2 ajustes de Papa' }));
    await waitFor(() => expect(filas()).toHaveLength(2));
  });

  it('un producto con saldo y sin movimientos en el mes sigue apareciendo con su saldo', async () => {
    await montar('/reportes/inventario?mes=2026-05&vista=resumen', { preparar: sembrar });
    await screen.findByRole('table');
    expect(textos(filaDe('Papa'))).toEqual(['Papa', '13 kg', '0 kg', '0 kgSalida general: 0 kg · Consumo: 0 kg', '0 kg', '13 kg']);
  });

  it('un mes sin movimientos y sin saldos lo explica', async () => {
    await montar('/reportes/inventario?mes=2025-12&vista=resumen', { preparar: sembrar });
    expect(await screen.findByText('No hay movimientos en diciembre de 2025')).toBeInTheDocument();
  });

  it('una salida rechazada por falta de existencia no aparece en el reporte (solo lo confirmado)', async () => {
    await montar('/reportes/inventario?mes=2026-03&vista=resumen', {
      preparar: async (d, contexto) => {
        const r = await sembrar(d, contexto);
        await contexto.salir(r.papa, '999').catch(() => {}); // se rechaza: no hay tanto
        return r;
      },
    });
    await screen.findByRole('table');
    expect(textos(filaDe('Papa'))[3]).toBe('5 kgSalida general: 3 kg · Consumo: 2 kg');
  });
});

describe('errores y carga', () => {
  it('un mes inválido en la dirección se avisa junto al selector, sin romper la pantalla', async () => {
    await montar('/reportes/inventario?mes=2026-13');
    expect(await screen.findByText('El mes no es válido. Usá el formato AAAA-MM, por ejemplo 2026-03.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByLabelText('Mes')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled();
  });

  it('si falla la carga muestra el error con «Reintentar», y al reintentar aparece el reporte', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const original = datos.reportes.inventarioAlCierre;
    datos.reportes.inventarioAlCierre = vi.fn().mockRejectedValueOnce(new ErrorDatos('CONEXION')).mockImplementation(original);
    await montar('/reportes/inventario?mes=2026-03', { datos, preparar: sembrar });
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo preparar el reporte');
    await u.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(filas()).toHaveLength(2);
  });
});

describe('vista imprimible', () => {
  let imprimir;
  beforeEach(() => { imprimir = vi.fn(); window.print = imprimir; });

  it('el botón Imprimir abre el diálogo de impresión del navegador', async () => {
    const u = userEvent.setup();
    await montar('/reportes/inventario?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    await u.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(imprimir).toHaveBeenCalledTimes(1);
  });

  it('trae un encabezado propio con la institución, el reporte, el período y la fecha de generación', async () => {
    const u = userEvent.setup();
    await montar('/reportes/inventario?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    const encabezado = document.querySelector('.encabezado-impresion');
    expect(encabezado).toHaveTextContent('Hogar de Ancianos Jafeth Jiménez Morales');
    expect(encabezado).toHaveTextContent('Reporte de inventario: Estado al cierre del mes');
    expect(encabezado).toHaveTextContent('Período: marzo de 2026');
    expect(encabezado.textContent).toMatch(/Generado el \d{2}\/\d{2}\/\d{4}.{1,3}\d{2}:\d{2}/);
    await u.click(screen.getByRole('tab', { name: 'Resumen del mes' }));
    await waitFor(() => expect(document.querySelector('.encabezado-impresion')).toHaveTextContent('Reporte de inventario: Resumen del mes'));
  });

  it('lo que no se debe imprimir (menú de reportes, selector, pestañas, botones) está marcado para ocultarse', async () => {
    await montar('/reportes/inventario?mes=2026-03', { preparar: sembrar });
    await screen.findByRole('table');
    expect(screen.getByRole('navigation', { name: 'Reportes mensuales' })).toHaveClass('no-imprimir');
    expect(screen.getByRole('button', { name: 'Imprimir' })).toHaveClass('no-imprimir');
    expect(screen.getByRole('tablist').parentElement).toHaveClass('no-imprimir');
    expect(screen.getByLabelText('Mes').closest('.herramientas')).toHaveClass('no-imprimir');
  });
});
