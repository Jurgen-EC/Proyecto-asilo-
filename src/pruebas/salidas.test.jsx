import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  return <output data-testid="ubicacion">{u.pathname}</output>;
}

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  const ingresar = (producto, cantidad, extra = {}) => datos.inventario.registrarMovimiento({
    productoId: producto.id, tipo: 'ingreso', subtipo: 'compra', cantidad, unidadId: producto.unidadBaseId, claveIdempotencia: `ing-${++n}`, ...extra,
  });
  const salir = (producto, cantidad, extra = {}) => datos.salidas.registrarSalida({
    productoId: producto.id, cantidad, unidadId: producto.unidadBaseId, motivo: 'Donación', claveIdempotencia: `sal-${++n}`, ...extra,
  });
  const consumir = (producto, cantidad, extra = {}) => datos.consumos.registrarConsumo({
    productoId: producto.id, cantidad, unidadId: producto.unidadBaseId, claveIdempotencia: `con-${++n}`, ...extra,
  });
  return { por, crear, ingresar, salir, consumir };
}

// Monta la aplicación con sesión iniciada. `preparar` siembra productos y movimientos antes de abrir la pantalla.
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
const diaDeManana = () => {
  const d = new Date(`${hoyEnCostaRica()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
async function elegirProducto(u, nombre) {
  await u.click(screen.getByRole('combobox', { name: 'Producto' }));
  await u.click(await screen.findByRole('option', { name: nombre }));
}
const disponible = () => document.querySelector('.existencia-disponible');
const existenciaDe = async (datos, producto) => (await datos.inventario.obtenerExistencia(producto.id)).cantidadBase;
const filasDeTabla = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('salidas y consumos: acceso y navegación', () => {
  it('desde el menú se llega a Salidas, y desde ahí a Consumos, que son listados separados', async () => {
    const u = userEvent.setup();
    await montar('/');
    await screen.findByRole('heading', { name: 'Inicio' });
    await u.click(screen.getByRole('link', { name: 'Salidas y consumo' }));
    expect(await screen.findByRole('heading', { name: 'Salidas', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/salidas');
    await u.click(within(screen.getByRole('navigation', { name: 'Salidas y consumos' })).getByRole('link', { name: 'Consumos' }));
    expect(await screen.findByRole('heading', { name: 'Consumos', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/consumos');
    // el menú sigue marcando el módulo como activo también en Consumos
    expect(screen.getByRole('link', { name: 'Salidas y consumo' })).toHaveClass('menu__enlace--activo');
  });

  it('sin registros, cada listado muestra su propio estado vacío con acceso a su formulario', async () => {
    await montar('/salidas');
    expect(await screen.findByText('Todavía no hay salidas registradas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar la primera salida' })).toHaveAttribute('href', '/salidas/nueva');
  });

  it('el listado de consumos vacío apunta al formulario de consumo', async () => {
    await montar('/consumos');
    expect(await screen.findByText('Todavía no hay consumos registrados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar el primer consumo' })).toHaveAttribute('href', '/consumos/nuevo');
  });
});

describe('formulario de salida', () => {
  it('muestra la existencia disponible y su unidad al elegir el producto, y valida todo junto antes de confirmar', async () => {
    const u = userEvent.setup();
    await montar('/salidas/nueva', { preparar: async (_d, { crear, ingresar }) => { await ingresar(await crear('Papa'), 5); } });
    await screen.findByRole('heading', { name: 'Nueva salida' });

    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));
    const resumen = await screen.findByText('Revisá la salida antes de registrarla:');
    expect(within(resumen.closest('div')).getByText('Elegí el producto.')).toBeInTheDocument();
    expect(within(resumen.closest('div')).getByText('Escribí la cantidad.')).toBeInTheDocument();
    expect(within(resumen.closest('div')).getByText('Escribí el motivo de la salida.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    await elegirProducto(u, 'Papa');
    await waitFor(() => expect(disponible()).toHaveTextContent('Disponible: 5 kg'));
  });

  it('con existencia 5, una salida de 6 se rechaza: muestra lo disponible, no guarda nada y la existencia sigue en 5', async () => {
    const u = userEvent.setup();
    let papa;
    const { datos } = await montar('/salidas/nueva', { preparar: async (_d, { crear, ingresar }) => { papa = await crear('Papa'); await ingresar(papa, 5); } });
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad que sale'), '6');
    await u.type(screen.getByLabelText('Motivo de la salida'), 'Donación');
    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar salida' }));

    expect((await screen.findAllByText(/No hay cantidad suficiente de «Papa»\. Disponible: 5 kg\./)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ubicacion()).toBe('/salidas/nueva');
    expect(await existenciaDe(datos, papa)).toBe('5');
    expect(await datos.inventario.verificarConsistencia()).toMatchObject({ consistente: true, movimientosRevisados: 1 });
    expect((await datos.salidas.listarSalidas()).total).toBe(0);
  });

  it('confirma antes de guardar, descuenta la existencia y deja la salida en el listado con su motivo', async () => {
    const u = userEvent.setup();
    let papa;
    const { datos } = await montar('/salidas/nueva', { preparar: async (_d, { crear, ingresar }) => { papa = await crear('Papa'); await ingresar(papa, 5); } });
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad que sale'), '2');
    await u.type(screen.getByLabelText('Motivo de la salida'), '  Donación al comedor  ');
    await u.type(screen.getByLabelText('Nota (opcional)'), 'Entregada el lunes');
    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('¿Registrar esta salida?');
    expect(dialogo).toHaveTextContent('Se descontarán 2 kg de «Papa» del inventario por el motivo «Donación al comedor».');
    expect(await existenciaDe(datos, papa)).toBe('5'); // todavía no se guardó nada
    await u.click(within(dialogo).getByRole('button', { name: 'Registrar salida' }));

    expect(await screen.findByText('Salida registrada. Existencia actual de «Papa»: 3 kg.')).toBeInTheDocument();
    await waitFor(() => expect(ubicacion()).toBe('/salidas'));
    const fila = (await screen.findByRole('link', { name: 'Papa' })).closest('tr');
    expect(within(fila).getAllByText('2 kg')).toHaveLength(2); // cantidad ingresada y cantidad descontada
    expect(within(fila).getByText('Donación al comedor')).toBeInTheDocument();
    expect(within(fila).getByText('Entregada el lunes')).toBeInTheDocument();
    expect(await existenciaDe(datos, papa)).toBe('3');
  });

  it('cancelar la confirmación no guarda nada', async () => {
    const u = userEvent.setup();
    let papa;
    const { datos } = await montar('/salidas/nueva', { preparar: async (_d, { crear, ingresar }) => { papa = await crear('Papa'); await ingresar(papa, 5); } });
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad que sale'), '2');
    await u.type(screen.getByLabelText('Motivo de la salida'), 'Donación');
    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await existenciaDe(datos, papa)).toBe('5');
    expect((await datos.salidas.listarSalidas()).total).toBe(0);
  });

  it('una salida en cajas se convierte y descuenta correctamente: 1 caja de 12 unidades son 12 unidades', async () => {
    const u = userEvent.setup();
    let huevos;
    const { datos } = await montar('/salidas/nueva', {
      preparar: async (d, { crear, ingresar, por }) => {
        huevos = await crear('Huevos', por.u);
        const caja = await d.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: por.u.id, cantidadContenida: '12' });
        await ingresar(huevos, 3, { unidadId: undefined, presentacionId: caja.id }); // 36 unidades
      },
    });
    await elegirProducto(u, 'Huevos');
    await waitFor(() => expect(disponible()).toHaveTextContent('Disponible: 36 u'));
    await u.selectOptions(screen.getByLabelText('Sale en'), 'Caja');
    await u.type(screen.getByLabelText('Cantidad que sale'), '1');
    await u.type(screen.getByLabelText('Motivo de la salida'), 'Préstamo');
    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar salida' }));

    expect(await screen.findByText('Salida registrada. Existencia actual de «Huevos»: 24 u.')).toBeInTheDocument();
    const fila = (await screen.findByRole('link', { name: 'Huevos' })).closest('tr');
    expect(within(fila).getByText('1 × Caja')).toBeInTheDocument();
    expect(within(fila).getByText('12 u')).toBeInTheDocument();
    expect(await existenciaDe(datos, huevos)).toBe('24');
  });

  it('el doble clic no duplica la salida', async () => {
    const u = userEvent.setup();
    let papa;
    const { datos } = await montar('/salidas/nueva', { preparar: async (_d, { crear, ingresar }) => { papa = await crear('Papa'); await ingresar(papa, 5); } });
    const original = datos.salidas.registrarSalida;
    let llamadas = 0;
    datos.salidas.registrarSalida = (...a) => { llamadas += 1; return original(...a); };
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad que sale'), '2');
    await u.type(screen.getByLabelText('Motivo de la salida'), 'Donación');
    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));
    const confirmar = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar salida' });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar); // segundo clic inmediato, antes de que la pantalla se repinte
    await screen.findByText(/Salida registrada\./);
    expect(llamadas).toBe(1);
    expect(await existenciaDe(datos, papa)).toBe('3');
    expect((await datos.salidas.listarSalidas()).total).toBe(1);
  });

  it('si falla la conexión después de guardar, reintentar no duplica la salida (misma clave de idempotencia)', async () => {
    const u = userEvent.setup();
    let papa;
    const { datos } = await montar('/salidas/nueva', { preparar: async (_d, { crear, ingresar }) => { papa = await crear('Papa'); await ingresar(papa, 5); } });
    const original = datos.salidas.registrarSalida;
    let llamadas = 0;
    datos.salidas.registrarSalida = async (entrada) => {
      llamadas += 1;
      const r = await original(entrada);
      if (llamadas === 1) throw new ErrorDatos('CONEXION'); // la salida SÍ se guardó, pero la respuesta no llegó
      return r;
    };
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad que sale'), '2');
    await u.type(screen.getByLabelText('Motivo de la salida'), 'Donación');
    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar salida' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(ubicacion()).toBe('/salidas/nueva'); // la persona no sabe si se guardó y reintenta

    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar salida' }));
    await waitFor(() => expect(ubicacion()).toBe('/salidas'));
    expect(llamadas).toBe(2);
    expect((await datos.salidas.listarSalidas()).total).toBe(1);
    expect(await existenciaDe(datos, papa)).toBe('3'); // se descontó UNA sola vez
    expect((await datos.inventario.verificarConsistencia()).movimientosRevisados).toBe(2);
  });
});

describe('formulario de consumo', () => {
  it('no tiene motivo: un consumo no es una salida con otro nombre', async () => {
    await montar('/consumos/nuevo');
    expect(await screen.findByRole('heading', { name: 'Nuevo consumo' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Motivo de la salida')).toBeNull();
    expect(screen.getByLabelText('Cantidad consumida')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar consumo' })).toBeInTheDocument();
  });

  it('con existencia 5, un consumo de 2 deja 3, aparece en los consumos del producto y NO en las salidas', async () => {
    const u = userEvent.setup();
    let papa;
    const { datos } = await montar('/consumos/nuevo', { preparar: async (_d, { crear, ingresar }) => { papa = await crear('Papa'); await ingresar(papa, 5); } });
    await elegirProducto(u, 'Papa');
    await waitFor(() => expect(disponible()).toHaveTextContent('Disponible: 5 kg'));
    await u.type(screen.getByLabelText('Cantidad consumida'), '2');
    await u.click(screen.getByRole('button', { name: 'Registrar consumo' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('¿Registrar este consumo?');
    expect(dialogo).toHaveTextContent('Se descontarán 2 kg de «Papa» del inventario.');
    await u.click(within(dialogo).getByRole('button', { name: 'Registrar consumo' }));

    expect(await screen.findByText('Consumo registrado. Existencia actual de «Papa»: 3 kg.')).toBeInTheDocument();
    await waitFor(() => expect(ubicacion()).toBe('/consumos'));
    expect(await screen.findByRole('link', { name: 'Papa' })).toBeInTheDocument();
    expect(await existenciaDe(datos, papa)).toBe('3');
    expect((await datos.consumos.listarConsumos({ productoId: papa.id })).total).toBe(1);

    await u.click(within(screen.getByRole('navigation', { name: 'Salidas y consumos' })).getByRole('link', { name: 'Salidas' }));
    expect(await screen.findByText('Todavía no hay salidas registradas')).toBeInTheDocument();
  });

  it('un consumo mayor a la existencia se rechaza y deja todo igual', async () => {
    const u = userEvent.setup();
    let papa;
    const { datos } = await montar('/consumos/nuevo', { preparar: async (_d, { crear, ingresar }) => { papa = await crear('Papa'); await ingresar(papa, 5); } });
    await elegirProducto(u, 'Papa');
    await u.type(screen.getByLabelText('Cantidad consumida'), '5,5');
    await u.click(screen.getByRole('button', { name: 'Registrar consumo' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar consumo' }));
    expect((await screen.findAllByText(/No hay cantidad suficiente de «Papa»\. Disponible: 5 kg\./)).length).toBeGreaterThan(0);
    expect(await existenciaDe(datos, papa)).toBe('5');
    expect((await datos.consumos.listarConsumos()).total).toBe(0);
    expect((await datos.inventario.verificarConsistencia()).movimientosRevisados).toBe(1);
  });
});

describe('listados de salidas y de consumos', () => {
  it('muestran lo más reciente primero y se filtran por producto y por fecha', async () => {
    const u = userEvent.setup();
    await montar('/salidas', {
      preparar: async (_d, { crear, ingresar, salir }) => {
        const papa = await crear('Papa');
        const arroz = await crear('Arroz');
        await ingresar(papa, 100);
        await ingresar(arroz, 100);
        await salir(papa, 1);
        await salir(arroz, 2);
        await salir(papa, 3);
      },
    });
    await screen.findByRole('link', { name: 'Arroz' });
    const nombres = () => filasDeTabla().map((f) => within(f).getAllByRole('link')[0].textContent);
    expect(nombres()).toEqual(['Papa', 'Arroz', 'Papa']);
    expect(filasDeTabla().map((f) => within(f).getAllByRole('cell')[2].textContent)).toEqual(['3 kg', '2 kg', '1 kg']);

    await u.click(screen.getByRole('combobox', { name: 'Producto' }));
    await u.click(await screen.findByRole('option', { name: 'Papa' }));
    await waitFor(() => expect(nombres()).toEqual(['Papa', 'Papa']));
    expect(screen.getByText('Mostrando 1–2 de 2 salidas')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: diaDeManana() } });
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    await u.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]);
    await waitFor(() => expect(nombres()).toEqual(['Papa', 'Arroz', 'Papa']));
  });

  it('el listado de consumos no incluye motivo y no mezcla salidas', async () => {
    await montar('/consumos', {
      preparar: async (_d, { crear, ingresar, salir, consumir }) => {
        const papa = await crear('Papa');
        await ingresar(papa, 10);
        await salir(papa, 1, { motivo: 'Donación' });
        await consumir(papa, 2, { nota: 'Almuerzo' });
      },
    });
    await screen.findByRole('link', { name: 'Papa' });
    expect(screen.queryByRole('columnheader', { name: 'Motivo' })).toBeNull();
    expect(filasDeTabla()).toHaveLength(1);
    expect(screen.getByText('Almuerzo')).toBeInTheDocument();
    expect(screen.queryByText('Donación')).toBeNull();
  });

  it('pagina de a 20', async () => {
    const u = userEvent.setup();
    await montar('/salidas', {
      preparar: async (_d, { crear, ingresar, salir }) => {
        const papa = await crear('Papa');
        await ingresar(papa, 100);
        for (let i = 0; i < 25; i += 1) await salir(papa, 1);
      },
    });
    expect(await screen.findByText('Mostrando 1–20 de 25 salidas')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 21–25 de 25 salidas')).toBeInTheDocument();
  });
});
