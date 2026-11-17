import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { ProveedorAutenticacion } from '../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from '../compartido/componentes/Notificaciones.jsx';
import { crearAdaptadorDemo, USUARIO_DEMO, CLAVE_DEMO } from '../nucleo/datos/adaptadorDemo.js';
import { formatearCantidad, formatearDinero, formatearFechaDia, hoyEnCostaRica } from '../compartido/utilidades/formato.js';

const dinero = (v) => formatearDinero(v).replace(/\s+/g, ' ');
const dia = (desplazamiento) => {
  const d = new Date(`${hoyEnCostaRica()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + desplazamiento);
  return d.toISOString().slice(0, 10);
};

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  const comprar = (lineas, fechaCompra = dia(-1)) => datos.compras.registrarCompra({ fechaCompra, claveIdempotencia: `cmp-${++n}`, lineas });
  return { por, crear, comprar };
}

async function montar(ruta, { datos, preparar } = {}) {
  const adaptador = datos ?? crearAdaptadorDemo({ retardoMs: 0 });
  await adaptador.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
  const contexto = await prepararDatos(adaptador);
  if (preparar) await preparar(adaptador, contexto);
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorNotificaciones><ProveedorAutenticacion datos={adaptador}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
      </MemoryRouter>,
    );
  });
  return { datos: adaptador, ...contexto };
}

const filasDeTabla = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const celdas = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent.replace(/\s+/g, ' ').trim());

describe('costos por producto', () => {
  it('muestra cada producto con sus compras registradas y, en Costo promedio, «Pendiente de definición»', async () => {
    await montar('/costos', {
      preparar: async (_d, { crear, comprar, por }) => {
        const papa = await crear('Papa');
        const arroz = await crear('Arroz');
        await crear('Sal');
        await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '10', costoUnitario: '800' }, { productoId: arroz.id, unidadId: por.kg.id, cantidad: '4', costoUnitario: '700' }]);
        await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '2', costoUnitario: '900' }]);
      },
    });
    await screen.findByRole('link', { name: 'Papa' });
    expect(filasDeTabla().map(celdas)).toEqual([
      ['Arroz', '1', 'Pendiente de definición', 'Ver historial'],
      ['Papa', '2', 'Pendiente de definición', 'Ver historial'],
      ['Sal', 'Sin compras registradas', 'Pendiente de definición', 'Ver historial'],
    ]);
    // el costo promedio no es un número en ninguna parte
    expect(screen.getAllByText('Pendiente de definición')).toHaveLength(3);
    expect(screen.getByText(/bloqueado/i, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText(/₡/)).toBeNull();
  });

  it('busca sin mayúsculas ni tildes y filtra por estado', async () => {
    const u = userEvent.setup();
    await montar('/costos', { preparar: async (d, { crear }) => { await crear('Azúcar'); const arroz = await crear('Arroz'); await d.productos.cambiarEstadoProducto(arroz.id, false); } });
    await screen.findByRole('link', { name: 'Azúcar' });
    expect(screen.queryByRole('link', { name: 'Arroz' })).toBeNull(); // inactivo
    await u.selectOptions(screen.getByLabelText('Mostrar'), 'todos');
    expect(await screen.findByRole('link', { name: 'Arroz' })).toBeInTheDocument();
    await u.type(screen.getByLabelText('Buscar producto'), 'azucar');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Arroz' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Azúcar' })).toBeInTheDocument();
  });

  it('desde el listado se llega al historial del producto', async () => {
    const u = userEvent.setup();
    let papa;
    await montar('/costos', { preparar: async (_d, { crear }) => { papa = await crear('Papa'); } });
    await u.click(await screen.findByRole('link', { name: 'Papa' }));
    expect(await screen.findByRole('heading', { name: 'Papa', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Sin compras registradas')).toBeInTheDocument();
    expect(papa.id).toBeTruthy(); // la ruta del historial es /costos/<id del producto>
  });
});

describe('historial de costos de adquisición de un producto', () => {
  // Siembra con su propio adaptador y abre la pantalla del historial con el id real del producto.
  async function abrirHistorial(sembrar, consulta = '') {
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const ctx = await prepararDatos(datos);
    const sembrado = await sembrar(datos, ctx);
    await montar(`/costos/${sembrado.papa.id}${consulta}`, { datos });
    return { datos, ...ctx, ...sembrado };
  }

  it('coincide exactamente con las líneas de compra registradas (fecha, cantidad, costo unitario y total)', async () => {
    const { datos, papa, compras } = await abrirHistorial(async (d, { crear, comprar, por }) => {
      const papa = await crear('Papa');
      const huevos = await crear('Huevos', por.u);
      const caja = await d.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: por.u.id, cantidadContenida: '12' });
      const compras = [
        await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '10', costoUnitario: '800' }], dia(-10)),
        await comprar([
          { productoId: papa.id, unidadId: por.g.id, cantidad: '500', costoUnitario: '0,9' },
          { productoId: huevos.id, presentacionId: caja.id, cantidad: '3', costoUnitario: '2400' },
        ], dia(-3)),
        await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '2', costoTotal: '1900.55' }], dia(-1)),
      ];
      return { papa, compras };
    });
    expect(await screen.findByRole('heading', { name: 'Papa', level: 1 })).toBeInTheDocument();

    // lo que registraron las compras, línea por línea
    const esperado = [];
    for (const c of compras) {
      const completa = await datos.compras.obtenerCompra(c.compra.id);
      for (const l of completa.lineas) if (l.productoId === papa.id) esperado.push({ fecha: completa.fechaCompra, l });
    }
    esperado.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const cantidad = (l) => (l.presentacion ? `${formatearCantidad(l.cantidad)} × ${l.presentacion.nombre}` : formatearCantidad(l.cantidad, l.unidad.abreviatura));
    expect(filasDeTabla().map(celdas)).toEqual(esperado.map(({ fecha, l }) => [
      formatearFechaDia(fecha), cantidad(l), `${dinero(l.costoUnitario)} por ${l.presentacion ? l.presentacion.nombre : l.unidad.abreviatura}`, dinero(l.costoTotal),
    ]));
    expect(filasDeTabla()).toHaveLength(3);
    expect(screen.getByText('Mostrando 1–3 de 3 líneas de compra')).toBeInTheDocument();
    // y con los valores exactos que se registraron (sin redondeos de más)
    expect(filasDeTabla().map((f) => celdas(f)[3])).toEqual([dinero('1900.55'), dinero('450.00'), dinero('8000.00')]);
  });

  it('es información real: el costo promedio dice «Pendiente de definición» y nada se rotula como promedio, último costo ni costo por unidad base', async () => {
    await abrirHistorial(async (_d, { crear, comprar, por }) => {
      const papa = await crear('Papa');
      await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '10', costoUnitario: '800' }], dia(-5));
      await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '10', costoUnitario: '1000' }], dia(-1));
      return { papa };
    });
    await screen.findByRole('table');
    const ficha = screen.getByText('Costo promedio', { selector: 'dt' }).nextElementSibling;
    expect(ficha).toHaveTextContent('Pendiente de definición');
    expect(screen.getByText('bloqueado', { selector: 'strong' }).closest('p')).toHaveTextContent(/bloqueado hasta que el hogar apruebe la fórmula/i);
    // las dos compras aparecen tal cual (800 y 1000), sin promediar ni resumir
    expect(filasDeTabla().map((f) => celdas(f)[2])).toEqual([`${dinero('1000')} por kg`, `${dinero('800')} por kg`]);
    expect(screen.queryByText(/último costo|costo por unidad base/i)).toBeNull();
    expect(screen.queryByRole('row', { name: /^(total|promedio)/i })).toBeNull(); // no hay fila de totales ni de promedio
    expect(screen.queryByText(dinero('900'))).toBeNull(); // el promedio de 800 y 1000: no existe en pantalla
  });

  it('cada fecha enlaza con su compra', async () => {
    let compra;
    await abrirHistorial(async (_d, { crear, comprar, por }) => {
      const papa = await crear('Papa');
      compra = (await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '10', costoUnitario: '800' }])).compra;
      return { papa };
    });
    expect(await screen.findByRole('link', { name: formatearFechaDia(dia(-1)) })).toHaveAttribute('href', `/compras/${compra.id}`);
  });

  it('un producto sin compras muestra «Sin compras registradas», no ceros inventados', async () => {
    await abrirHistorial(async (_d, { crear }) => ({ papa: await crear('Papa') }));
    expect(await screen.findByText('Sin compras registradas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar una compra' })).toHaveAttribute('href', '/compras/nueva');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/₡/)).toBeNull();
  });

  it('filtra por fecha de compra y avisa si no hay resultados', async () => {
    const u = userEvent.setup();
    await abrirHistorial(async (_d, { crear, comprar, por }) => {
      const papa = await crear('Papa');
      await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '1', costoUnitario: '100' }], dia(-10));
      await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '2', costoUnitario: '100' }], dia(-1));
      return { papa };
    });
    await screen.findByRole('table');
    expect(filasDeTabla()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: dia(-5) } });
    await waitFor(() => expect(filasDeTabla()).toHaveLength(1));
    expect(celdas(filasDeTabla()[0])[0]).toBe(formatearFechaDia(dia(-1)));
    await u.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(filasDeTabla()).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: dia(1) } });
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });

  it('un gasto o un consumo con costo no cambian el historial', async () => {
    const { datos, papa } = await abrirHistorial(async (_d, { crear, comprar, por }) => {
      const papa = await crear('Papa');
      await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '10', costoUnitario: '800' }]);
      return { papa };
    });
    await screen.findByRole('table');
    const antes = filasDeTabla().map(celdas);
    await act(async () => {
      await datos.gastos.registrarGasto({ fechaGasto: dia(0), concepto: 'Flete', importe: '5000', productoId: papa.id, claveIdempotencia: 'g-1' });
      await datos.inventario.registrarMovimiento({ productoId: papa.id, tipo: 'ingreso', subtipo: 'compra', cantidad: 5, unidadId: papa.unidadBaseId, claveIdempotencia: 'i-1' });
      await datos.consumos.registrarConsumo({ productoId: papa.id, cantidad: 2, unidadId: papa.unidadBaseId, costoImporte: '1700', claveIdempotencia: 'c-1' });
    });
    expect(filasDeTabla().map(celdas)).toEqual(antes);
  });

  it('pagina de a 20', async () => {
    const u = userEvent.setup();
    await abrirHistorial(async (_d, { crear, comprar, por }) => {
      const papa = await crear('Papa');
      for (let i = 0; i < 25; i += 1) await comprar([{ productoId: papa.id, unidadId: por.kg.id, cantidad: '1', costoUnitario: '100' }]);
      return { papa };
    });
    expect(await screen.findByText('Mostrando 1–20 de 25 líneas de compra')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 21–25 de 25 líneas de compra')).toBeInTheDocument();
  });

  it('un producto inexistente muestra un mensaje claro', async () => {
    await montar('/costos/no-existe');
    expect(await screen.findByText('No se encontró el producto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a costos' })).toHaveAttribute('href', '/costos');
  });
});
