import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { ErrorDatos } from '../nucleo/datos/errores.js';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { formatearDinero, formatearFechaDia, hoyEnCostaRica } from '../compartido/utilidades/formato.js';

const dinero = (v) => formatearDinero(v).replace(/\s+/g, ' ');
const dia = (desplazamiento) => {
  const d = new Date(`${hoyEnCostaRica()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + desplazamiento);
  return d.toISOString().slice(0, 10);
};

function UbicacionActual() {
  const u = useLocation();
  return <output data-testid="ubicacion">{u.pathname + u.search}</output>;
}

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  const comprar = (producto, { cantidad = '10', costoUnitario = '800', fechaCompra = dia(-1) } = {}) => datos.compras.registrarCompra({
    fechaCompra, claveIdempotencia: `cmp-${++n}`, lineas: [{ productoId: producto.id, unidadId: por.kg.id, cantidad, costoUnitario }],
  });
  const gastar = (extra = {}) => datos.gastos.registrarGasto({
    fechaGasto: dia(0), concepto: 'Transporte', importe: '1500', claveIdempotencia: `gas-${++n}`, ...extra,
  });
  return { por, crear, comprar, gastar };
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

const ubicacion = () => screen.getByTestId('ubicacion').textContent;
const filasDeTabla = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const celdas = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent.replace(/\s+/g, ' ').trim());

async function llenar(u, { concepto, importe, nota }) {
  if (concepto !== undefined) await u.type(screen.getByLabelText('Concepto'), concepto);
  if (importe !== undefined) await u.type(screen.getByLabelText('Importe (₡)'), importe);
  if (nota !== undefined) await u.type(screen.getByLabelText('Nota (opcional)'), nota);
}
async function registrar(u) {
  await u.click(screen.getByRole('button', { name: 'Registrar gasto' }));
  await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar gasto' }));
}

describe('gastos: acceso y navegación', () => {
  it('desde el menú se llega a Gastos y costos, y desde ahí a Gastos, y el menú sigue activo', async () => {
    const u = userEvent.setup();
    await montar('/');
    await screen.findByRole('heading', { name: 'Inicio' });
    await u.click(screen.getByRole('link', { name: 'Gastos y costos' }));
    expect(await screen.findByRole('heading', { name: 'Costos de adquisición', level: 1 })).toBeInTheDocument();
    await u.click(within(screen.getByRole('navigation', { name: 'Gastos y costos' })).getByRole('link', { name: 'Gastos' }));
    expect(await screen.findByRole('heading', { name: 'Gastos', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/gastos');
    expect(screen.getByRole('link', { name: 'Gastos y costos' })).toHaveClass('menu__enlace--activo');
  });

  it('sin gastos, el listado ofrece registrar el primero', async () => {
    await montar('/gastos');
    expect(await screen.findByText('Todavía no hay gastos registrados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar el primer gasto' })).toHaveAttribute('href', '/gastos/nuevo');
  });
});

describe('formulario de gasto', () => {
  it('registrar un gasto y verlo en la lista, con su fecha, concepto, importe exacto y nota', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/gastos/nuevo');
    await screen.findByRole('heading', { name: 'Nuevo gasto' });
    await llenar(u, { concepto: '  Flete de verduras ', importe: '1250,5', nota: 'Pagado en efectivo' });
    await u.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('¿Registrar este gasto?');
    expect(dialogo.textContent.replace(/\s+/g, ' ')).toContain(`«Flete de verduras» por ${dinero('1250.50')}`);
    expect((await datos.gastos.listarGastos()).total).toBe(0); // todavía no se guardó nada
    await u.click(within(dialogo).getByRole('button', { name: 'Registrar gasto' }));

    expect(await screen.findByText('Gasto registrado.')).toBeInTheDocument();
    await waitFor(() => expect(ubicacion()).toBe('/gastos'));
    const fila = (await screen.findByText('Flete de verduras')).closest('tr');
    expect(celdas(fila)).toEqual([formatearFechaDia(hoyEnCostaRica()), 'Flete de verduras', dinero('1250.50'), '—', '—', 'Pagado en efectivo']);
    expect((await datos.gastos.listarGastos()).items[0]).toMatchObject({ concepto: 'Flete de verduras', importe: '1250.50' });
  });

  it('valida todo junto, con los mensajes de la capa de datos, antes de pedir confirmación', async () => {
    const u = userEvent.setup();
    await montar('/gastos/nuevo');
    await screen.findByRole('heading', { name: 'Nuevo gasto' });
    await u.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    const resumen = (await screen.findByText('Revisá el gasto antes de registrarlo:')).closest('div');
    expect(within(resumen).getByText('Escribí el concepto del gasto.')).toBeInTheDocument();
    expect(within(resumen).getByText('Escribí el importe del gasto.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.change(screen.getByLabelText('Fecha del gasto'), { target: { value: dia(1) } });
    await llenar(u, { concepto: 'Flete', importe: '10,123' });
    await u.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    const resumen2 = (await screen.findByText('Revisá el gasto antes de registrarlo:')).closest('div');
    expect(within(resumen2).getByText('La fecha del gasto no puede ser futura.')).toBeInTheDocument();
    expect(within(resumen2).getByText('Usá como máximo 2 decimales en el importe.')).toBeInTheDocument();
  });

  it('un gasto relacionado con una compra se identifica como relacionado y NO se suma a la compra', async () => {
    const u = userEvent.setup();
    let compra;
    const { datos } = await montar('/gastos/nuevo', {
      preparar: async (_d, { crear, comprar }) => { compra = (await comprar(await crear('Papa'))).compra; },
    });
    await screen.findByRole('heading', { name: 'Nuevo gasto' });
    await llenar(u, { concepto: 'Flete de la compra', importe: '2500' });
    await waitFor(() => expect(screen.getByRole('option', { name: new RegExp(`${formatearFechaDia(dia(-1))} · .*Papa`) })).toBeInTheDocument());
    await u.selectOptions(screen.getByLabelText('Compra relacionada (opcional)'), compra.id);
    await registrar(u);

    await waitFor(() => expect(ubicacion()).toBe('/gastos'));
    const fila = (await screen.findByText('Flete de la compra')).closest('tr');
    expect(within(fila).getByRole('link', { name: `Compra del ${formatearFechaDia(dia(-1))}` })).toHaveAttribute('href', `/compras/${compra.id}`);
    expect(within(fila).getByText('Relacionado, no se suma')).toBeInTheDocument();
    expect((await datos.compras.obtenerCompra(compra.id)).total).toBe('8000.00'); // la compra no cambió
    expect(screen.queryByRole('row', { name: /total/i })).toBeNull(); // la lista no muestra totales
  });

  it('desde una compra se puede abrir el formulario con la compra ya elegida (?compra=)', async () => {
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const { crear, comprar } = await prepararDatos(datos);
    const compra = (await comprar(await crear('Papa'))).compra;
    await montar(`/gastos/nuevo?compra=${compra.id}`, { datos });
    const seleccion = await screen.findByLabelText('Compra relacionada (opcional)');
    await waitFor(() => expect(seleccion).toHaveValue(compra.id));
    expect(within(seleccion).getByRole('option', { name: /Papa/ })).toBeInTheDocument();
  });

  it('se puede asociar a un producto, y aparece en el listado con su enlace', async () => {
    const u = userEvent.setup();
    await montar('/gastos/nuevo', { preparar: async (_d, { crear }) => { await crear('Papa'); } });
    await screen.findByRole('heading', { name: 'Nuevo gasto' });
    await llenar(u, { concepto: 'Empaque', importe: '300' });
    await u.click(screen.getByRole('combobox', { name: 'Producto (opcional)' }));
    await u.click(await screen.findByRole('option', { name: 'Papa' }));
    await registrar(u);
    await waitFor(() => expect(ubicacion()).toBe('/gastos'));
    const fila = (await screen.findByText('Empaque')).closest('tr');
    expect(within(fila).getByRole('link', { name: 'Papa' })).toBeInTheDocument();
  });

  it('cancelar la confirmación no guarda nada', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/gastos/nuevo');
    await screen.findByRole('heading', { name: 'Nuevo gasto' });
    await llenar(u, { concepto: 'Flete', importe: '100' });
    await u.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await datos.gastos.listarGastos()).total).toBe(0);
  });

  it('el doble clic no duplica el gasto', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/gastos/nuevo');
    const original = datos.gastos.registrarGasto;
    let llamadas = 0;
    datos.gastos.registrarGasto = (...a) => { llamadas += 1; return original(...a); };
    await screen.findByRole('heading', { name: 'Nuevo gasto' });
    await llenar(u, { concepto: 'Flete', importe: '100' });
    await u.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    const confirmar = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar gasto' });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);
    await screen.findByText('Gasto registrado.');
    expect(llamadas).toBe(1);
    expect((await datos.gastos.listarGastos()).total).toBe(1);
  });

  it('si falla la conexión después de guardar, reintentar no duplica el gasto (misma clave de idempotencia)', async () => {
    const u = userEvent.setup();
    const { datos } = await montar('/gastos/nuevo');
    const original = datos.gastos.registrarGasto;
    let llamadas = 0;
    datos.gastos.registrarGasto = async (entrada) => {
      llamadas += 1;
      const r = await original(entrada);
      if (llamadas === 1) throw new ErrorDatos('CONEXION'); // el gasto SÍ se guardó, pero la respuesta no llegó
      return r;
    };
    await screen.findByRole('heading', { name: 'Nuevo gasto' });
    await llenar(u, { concepto: 'Flete', importe: '100' });
    await registrar(u);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(ubicacion()).toBe('/gastos/nuevo');
    await registrar(u);
    await waitFor(() => expect(ubicacion()).toBe('/gastos'));
    expect(llamadas).toBe(2);
    expect((await datos.gastos.listarGastos()).total).toBe(1);
  });
});

describe('listado de gastos', () => {
  it('muestra el más reciente primero, filtra por fecha y producto, y no muestra totales', async () => {
    const u = userEvent.setup();
    await montar('/gastos', {
      preparar: async (_d, { crear, gastar }) => {
        const papa = await crear('Papa');
        await gastar({ concepto: 'Gasto viejo', importe: '1', fechaGasto: dia(-5) });
        await gastar({ concepto: 'Gasto de papa', importe: '2', fechaGasto: dia(0), productoId: papa.id });
        await gastar({ concepto: 'Gasto medio', importe: '3', fechaGasto: dia(-2) });
      },
    });
    await screen.findByText('Gasto medio');
    const conceptos = () => filasDeTabla().map((f) => celdas(f)[1]);
    expect(conceptos()).toEqual(['Gasto de papa', 'Gasto medio', 'Gasto viejo']);
    expect(screen.queryByRole('row', { name: /total/i })).toBeNull();

    await u.click(screen.getByRole('combobox', { name: 'Producto' }));
    await u.click(await screen.findByRole('option', { name: 'Papa' }));
    await waitFor(() => expect(conceptos()).toEqual(['Gasto de papa']));
    await u.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(conceptos()).toHaveLength(3));

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: dia(-3) } });
    await waitFor(() => expect(conceptos()).toEqual(['Gasto viejo']));
    await u.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(conceptos()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: dia(1) } });
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });

  it('pagina de a 20', async () => {
    const u = userEvent.setup();
    await montar('/gastos', {
      preparar: async (_d, { gastar }) => { for (let i = 0; i < 25; i += 1) await gastar({ concepto: `Gasto ${String(i).padStart(2, '0')}`, importe: '10' }); },
    });
    expect(await screen.findByText('Mostrando 1–20 de 25 gastos')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 21–25 de 25 gastos')).toBeInTheDocument();
  });
});
