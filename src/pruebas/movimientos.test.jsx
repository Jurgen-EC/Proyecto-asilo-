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
  return <output data-testid="ubicacion">{u.pathname}{u.search}</output>;
}

async function prepararDatos(datos) {
  const unidades = await datos.unidades.listarUnidades();
  const por = Object.fromEntries(unidades.map((u) => [u.abreviatura, u]));
  let n = 0;
  const crear = (nombre, unidad = por.kg) => datos.productos.crearProducto({ nombre, unidadBaseId: unidad.id });
  const mover = (producto, extra) => datos.inventario.registrarMovimiento({ productoId: producto.id, unidadId: producto.unidadBaseId, claveIdempotencia: `mov-${++n}`, ...extra });
  const ingresar = (producto, cantidad, extra = {}) => mover(producto, { tipo: 'ingreso', subtipo: 'compra', cantidad, ...extra });
  const ajustar = (producto, sentido, cantidad) => mover(producto, { tipo: 'ajuste', subtipo: 'ajuste_conteo', sentido, cantidad });
  const salir = (producto, cantidad, extra = {}) => datos.salidas.registrarSalida({
    productoId: producto.id, cantidad, unidadId: producto.unidadBaseId, motivo: 'Donación', claveIdempotencia: `sal-${++n}`, ...extra,
  });
  const consumir = (producto, cantidad, extra = {}) => datos.consumos.registrarConsumo({
    productoId: producto.id, cantidad, unidadId: producto.unidadBaseId, claveIdempotencia: `con-${++n}`, ...extra,
  });
  const comprar = (producto, cantidad, extra = {}) => datos.compras.registrarCompra({
    fechaCompra: hoyEnCostaRica(), claveIdempotencia: `compra-${++n}`,
    lineas: [{ productoId: producto.id, unidadId: producto.unidadBaseId, cantidad, costoUnitario: '100' }], ...extra,
  });
  return { por, crear, ingresar, ajustar, salir, consumir, comprar };
}

// Monta la aplicación con sesión iniciada. `preparar` siembra productos y movimientos antes de abrir la pantalla.
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
const resumen = () => document.querySelector('.resumen-lista'); // «Mostrando X–Y de N»
const filasDeTabla = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const celdasDe = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent);
async function elegirProducto(u, nombre) {
  await u.click(screen.getByRole('combobox', { name: 'Producto' }));
  await u.click(await screen.findByRole('option', { name: nombre }));
}
// Siembra: Papa (ingreso 10 por compra, salida 2, consumo 1, ajuste -1) y Arroz (ingreso 7 directo).
async function sembrarVarios(_datos, { crear, comprar, ingresar, salir, consumir, ajustar }) {
  const papa = await crear('Papa'); const arroz = await crear('Arroz');
  await comprar(papa, '10', { nota: 'Feria' });
  await salir(papa, '2');
  await consumir(papa, '1');
  await ajustar(papa, -1, '1');
  await ingresar(arroz, '7', { subtipo: 'inventario_inicial' });
  return { papa, arroz };
}

describe('movimientos: acceso y navegación', () => {
  it('sin sesión redirige al inicio de sesión', async () => {
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/movimientos']}>
          <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
        </MemoryRouter>,
      );
    });
    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
  });

  it('desde el menú se llega al historial, y desde ahí a Ingresos y a Salidas', async () => {
    const u = userEvent.setup();
    await montar('/');
    await screen.findByRole('heading', { name: 'Inicio' });
    await u.click(screen.getByRole('link', { name: 'Movimientos' }));
    expect(await screen.findByRole('heading', { name: 'Historial de movimientos', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/movimientos');
    const nav = screen.getByRole('navigation', { name: 'Vistas de movimientos' });
    await u.click(within(nav).getByRole('link', { name: 'Ingresos' }));
    expect(await screen.findByRole('heading', { name: 'Ingresos', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/movimientos/ingresos');
    expect(screen.getByRole('link', { name: 'Movimientos' })).toHaveClass('menu__enlace--activo'); // el menú sigue activo
    await u.click(within(nav).getByRole('link', { name: 'Salidas' }));
    expect(await screen.findByRole('heading', { name: 'Salidas', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toBe('/movimientos/salidas');
  });

  it('sin movimientos, cada vista muestra su estado vacío', async () => {
    await montar('/movimientos');
    expect(await screen.findByText('Todavía no hay movimientos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar una compra' })).toHaveAttribute('href', '/compras/nueva');
  });

  it('una dirección que no existe dentro del módulo no rompe la pantalla', async () => {
    await montar('/movimientos/ingresos/otra/cosa');
    expect(await screen.findByText(/página no encontrada/i)).toBeInTheDocument();
  });
});

describe('historial de movimientos', () => {
  it('lista todo, del más reciente al más antiguo, con tipo, clase, cantidad, efecto, origen y usuario', async () => {
    await montar('/movimientos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    const filas = filasDeTabla();
    expect(filas).toHaveLength(5);
    // más reciente primero: arroz (inventario inicial), ajuste, consumo, salida, compra
    expect(celdasDe(filas[0]).slice(1)).toEqual(['Arroz', 'Ingreso Inventario inicial', '7 kg', '+7 kg', '—', 'Usuario de demostración']);
    expect(celdasDe(filas[1])[2]).toBe('Ajuste Ajuste por conteo');
    expect(celdasDe(filas[1])[4]).toMatch(/^−1 kg$/);
    expect(celdasDe(filas[2])[2]).toBe('Salida Consumo');
    expect(celdasDe(filas[2])[3]).toBe('1 kg');
    expect(celdasDe(filas[3]).slice(2, 6)).toEqual(['Salida Salida general', '2 kg', '−2 kg', 'Salida']);
    expect(celdasDe(filas[4]).slice(1, 6)).toEqual(['Papa', 'Ingreso Compra', '10 kg', '+10 kg', 'Compra']);
  });

  it('el origen de una compra enlaza a la compra', async () => {
    await montar('/movimientos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    expect(screen.getByRole('link', { name: 'Compra' }).getAttribute('href')).toMatch(/^\/compras\/.+/);
  });

  it('Ingresos muestra solo ingresos y Salidas muestra salidas y consumos, cada uno con su clase', async () => {
    await montar('/movimientos/ingresos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    expect(filasDeTabla().map((f) => celdasDe(f)[2])).toEqual(['Ingreso Inventario inicial', 'Ingreso Compra']);
  });

  it('la vista de salidas incluye las salidas generales y los consumos sin mezclar los ajustes', async () => {
    await montar('/movimientos/salidas', { preparar: sembrarVarios });
    await screen.findByRole('table');
    expect(filasDeTabla().map((f) => celdasDe(f)[2])).toEqual(['Salida Consumo', 'Salida Salida general']);
  });

  it('filtra por producto y la dirección conserva el filtro', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/movimientos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    await elegirProducto(u, 'Arroz');
    await waitFor(() => expect(filasDeTabla()).toHaveLength(1));
    expect(celdasDe(filasDeTabla()[0])[1]).toBe('Arroz');
    expect(ubicacion()).toBe(`/movimientos?producto=${sembrado.arroz.id}`);
    expect(resumen()).toHaveTextContent('Mostrando 1–1 de 1 movimiento');
  });

  it('filtra por tipo y por clase; al cambiar el tipo se reinicia la clase', async () => {
    const u = userEvent.setup();
    await montar('/movimientos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    await u.selectOptions(screen.getByLabelText('Tipo'), 'Salida');
    await waitFor(() => expect(filasDeTabla()).toHaveLength(2));
    const clases = within(screen.getByLabelText('Clase')).getAllByRole('option').map((o) => o.textContent);
    expect(clases).toEqual(['Todas las clases', 'Salida general', 'Consumo']);
    await u.selectOptions(screen.getByLabelText('Clase'), 'Consumo');
    await waitFor(() => expect(filasDeTabla()).toHaveLength(1));
    expect(celdasDe(filasDeTabla()[0])[2]).toBe('Salida Consumo');
    await u.selectOptions(screen.getByLabelText('Tipo'), 'Ingreso');
    await waitFor(() => expect(filasDeTabla()).toHaveLength(2));
    expect(screen.getByLabelText('Clase')).toHaveValue('');
  });

  it('filtra por fechas: un rango de mañana no trae nada y se puede limpiar', async () => {
    const u = userEvent.setup();
    await montar('/movimientos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    const manana = new Date(`${hoyEnCostaRica()}T12:00:00Z`);
    manana.setUTCDate(manana.getUTCDate() + 1);
    const dia = manana.toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: dia } });
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(ubicacion()).toBe(`/movimientos?desde=${dia}`);
    await u.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]);
    await waitFor(() => expect(filasDeTabla()).toHaveLength(5));
    expect(ubicacion()).toBe('/movimientos');
  });

  it('muestra el error de unas fechas invertidas junto al campo', async () => {
    await montar('/movimientos?desde=2026-03-10&hasta=2026-03-01');
    expect(await screen.findByText('La fecha «hasta» no puede ser anterior a «desde».')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
  });

  it('un tipo y una clase que no se corresponden en la dirección se avisan sin romper la pantalla', async () => {
    await montar('/movimientos?tipo=ingreso&clase=consumo');
    expect(await screen.findByText('El subtipo no corresponde a ese tipo de movimiento.')).toBeInTheDocument();
  });

  it('permite ver primero los movimientos más antiguos', async () => {
    const u = userEvent.setup();
    await montar('/movimientos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    await u.selectOptions(screen.getByLabelText('Orden'), 'Más antiguos primero');
    await waitFor(() => expect(celdasDe(filasDeTabla()[0])[2]).toBe('Ingreso Compra'));
    expect(ubicacion()).toBe('/movimientos?orden=antiguo');
    expect(celdasDe(filasDeTabla()[4])[1]).toBe('Arroz');
  });

  it('pagina de a 20 sin perder movimientos', async () => {
    const u = userEvent.setup();
    await montar('/movimientos', {
      preparar: async (_d, { crear, ingresar }) => { const p = await crear('Papa'); for (let i = 1; i <= 25; i += 1) await ingresar(p, String(i)); },
    });
    await screen.findByRole('table');
    expect(filasDeTabla()).toHaveLength(20);
    expect(resumen()).toHaveTextContent('Mostrando 1–20 de 25 movimientos');
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(filasDeTabla()).toHaveLength(5));
    expect(ubicacion()).toBe('/movimientos?pagina=2');
    expect(resumen()).toHaveTextContent('Mostrando 21–25 de 25 movimientos');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('los movimientos de un producto desactivado se siguen viendo', async () => {
    await montar('/movimientos', {
      preparar: async (d, contexto) => {
        const r = await sembrarVarios(d, contexto);
        await d.productos.cambiarEstadoProducto(r.papa.id, false);
        return r;
      },
    });
    await screen.findByRole('table');
    expect(filasDeTabla()).toHaveLength(5);
    expect(filasDeTabla().filter((f) => celdasDe(f)[1] === 'Papa')).toHaveLength(4);
  });

  it('si falla la carga muestra el error con «Reintentar», y al reintentar aparece la lista', async () => {
    const u = userEvent.setup();
    const datos = crearAdaptadorDemo({ retardoMs: 0 });
    await datos.autenticacion.iniciarSesion(USUARIO_DEMO.correo, CLAVE_DEMO);
    const { crear, ingresar } = await prepararDatos(datos);
    await ingresar(await crear('Papa'), '5');
    const original = datos.movimientos.listarMovimientos;
    datos.movimientos.listarMovimientos = vi.fn().mockRejectedValueOnce(new ErrorDatos('CONEXION')).mockImplementation(original);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/movimientos']}>
          <ProveedorNotificaciones><ProveedorAutenticacion datos={datos}><App /></ProveedorAutenticacion></ProveedorNotificaciones>
        </MemoryRouter>,
      );
    });
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo cargar el historial');
    await u.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(filasDeTabla()).toHaveLength(1);
  });
});

describe('detalle de un movimiento', () => {
  const abrirDetalle = async (u, fila) => u.click(within(filasDeTabla()[fila]).getAllByRole('link')[0]);
  const valorDe = (etiqueta) => screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling;

  it('al tocar la fecha de un movimiento se abre su detalle, con la existencia antes y después', async () => {
    const u = userEvent.setup();
    await montar('/movimientos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    await abrirDetalle(u, 3); // la salida de 2 kg
    expect(await screen.findByRole('heading', { name: 'Detalle del movimiento', level: 1 })).toBeInTheDocument();
    expect(ubicacion()).toMatch(/^\/movimientos\/.+/);
    expect(valorDe('Producto')).toHaveTextContent('Papa');
    expect(valorDe('Tipo')).toHaveTextContent('Salida Salida general');
    expect(valorDe('Cantidad registrada')).toHaveTextContent('2 kg');
    expect(valorDe('Efecto en el inventario')).toHaveTextContent('−2 kg');
    expect(valorDe('Existencia antes')).toHaveTextContent('10 kg');
    expect(valorDe('Existencia después')).toHaveTextContent('8 kg');
    expect(valorDe('Registrado por')).toHaveTextContent('Usuario de demostración');
    expect(valorDe('Origen')).toHaveTextContent('Salida: Donación.');
  });

  it('la compra se explica con su fecha, su nota y un enlace a la compra', async () => {
    const u = userEvent.setup();
    await montar('/movimientos/ingresos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    await abrirDetalle(u, 1); // la compra de la papa
    await screen.findByRole('heading', { name: 'Detalle del movimiento' });
    const origen = valorDe('Origen');
    expect(origen).toHaveTextContent(/^Compra del \d{2}\/\d{2}\/\d{4}\./);
    expect(origen).toHaveTextContent('Nota de la compra: Feria');
    expect(within(origen).getByRole('link', { name: 'Ver la compra' }).getAttribute('href')).toMatch(/^\/compras\/.+/);
    expect(valorDe('Existencia antes')).toHaveTextContent('0 kg');
    expect(valorDe('Existencia después')).toHaveTextContent('10 kg');
  });

  it('un consumo muestra su nota y un movimiento directo dice que no tiene origen', async () => {
    const u = userEvent.setup();
    await montar('/movimientos', {
      preparar: async (_d, { crear, ingresar, consumir }) => { const p = await crear('Papa'); await ingresar(p, '9', { nota: 'Conteo inicial' }); await consumir(p, '1', { nota: 'Almuerzo' }); },
    });
    await screen.findByRole('table');
    await abrirDetalle(u, 0); // el consumo
    await screen.findByRole('heading', { name: 'Detalle del movimiento' });
    expect(valorDe('Origen')).toHaveTextContent('Consumo. Nota del consumo: Almuerzo');
    await u.click(screen.getByRole('link', { name: 'Volver al historial' }));
    await screen.findByRole('table');
    await abrirDetalle(u, 1); // el ingreso directo
    await screen.findByRole('heading', { name: 'Detalle del movimiento' });
    expect(valorDe('Origen')).toHaveTextContent('Registrado directamente en el inventario');
    expect(valorDe('Nota del movimiento')).toHaveTextContent('Conteo inicial');
  });

  it('muestra la presentación y la equivalencia usadas: 3 cajas de 12 unidades son 36 unidades', async () => {
    const u = userEvent.setup();
    await montar('/movimientos', {
      preparar: async (d, { crear, por }) => {
        const huevos = await crear('Huevos', por.u);
        const caja = await d.presentaciones.crearPresentacion(huevos.id, { nombre: 'Caja', unidadId: por.u.id, cantidadContenida: '12' });
        await d.inventario.registrarMovimiento({ productoId: huevos.id, tipo: 'ingreso', subtipo: 'compra', cantidad: '3', presentacionId: caja.id, claveIdempotencia: 'k-caja' });
      },
    });
    await screen.findByRole('table');
    expect(celdasDe(filasDeTabla()[0])[3]).toBe('3 × Caja');
    expect(celdasDe(filasDeTabla()[0])[4]).toMatch(/^\+36 u$/);
    await abrirDetalle(u, 0);
    await screen.findByRole('heading', { name: 'Detalle del movimiento' });
    expect(valorDe('Cantidad registrada')).toHaveTextContent('3 × Caja');
    expect(valorDe('Equivalencia usada')).toHaveTextContent('1 Caja = 12 u');
    expect(valorDe('Efecto en el inventario')).toHaveTextContent('+36 u');
  });

  it('desde el detalle se llega al historial completo del producto', async () => {
    const u = userEvent.setup();
    const { sembrado } = await montar('/movimientos', { preparar: sembrarVarios });
    await screen.findByRole('table');
    await abrirDetalle(u, 3);
    await screen.findByRole('heading', { name: 'Detalle del movimiento' });
    await u.click(screen.getByRole('link', { name: 'Ver todos los movimientos de este producto' }));
    await waitFor(() => expect(filasDeTabla()).toHaveLength(4));
    expect(ubicacion()).toBe(`/movimientos?producto=${sembrado.papa.id}`);
    await waitFor(() => expect(document.querySelector('.selector__nombre')).toHaveTextContent('Papa'));
  });

  it('un movimiento que no existe muestra un mensaje claro con la salida al historial', async () => {
    await montar('/movimientos/no-existe');
    expect(await screen.findByText('No se encontró el movimiento')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al historial' })).toHaveAttribute('href', '/movimientos');
  });
});
