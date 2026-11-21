import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectorDePeriodo from '../compartido/componentes/SelectorDePeriodo.jsx';
import { desplazarMes, mesDeHoy } from '../compartido/utilidades/periodo.js';

const opciones = (etiqueta) => screen.getAllByRole('option', { name: (_n, el) => el.closest('select') === screen.getByLabelText(etiqueta) }).map((o) => o.textContent);

describe('SelectorDePeriodo', () => {
  it('muestra el mes y el año del valor, con los doce meses y un rango de años', () => {
    render(<SelectorDePeriodo valor="2026-03" onChange={() => {}} />);
    expect(screen.getByLabelText('Mes')).toHaveValue('03');
    expect(screen.getByLabelText('Año')).toHaveValue('2026');
    expect(opciones('Mes')).toEqual(['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']);
    expect(opciones('Año')).toContain('2026');
    expect(screen.getByRole('group', { name: 'Período' })).toBeInTheDocument();
  });

  it('al cambiar el mes o el año avisa el nuevo período AAAA-MM', async () => {
    const u = userEvent.setup();
    const alCambiar = vi.fn();
    render(<SelectorDePeriodo valor="2026-03" onChange={alCambiar} anioDesde={2024} anioHasta={2027} />);
    await u.selectOptions(screen.getByLabelText('Mes'), 'Febrero');
    expect(alCambiar).toHaveBeenLastCalledWith('2026-02');
    await u.selectOptions(screen.getByLabelText('Año'), '2024');
    expect(alCambiar).toHaveBeenLastCalledWith('2024-03');
    expect(opciones('Año')).toEqual(['2024', '2025', '2026', '2027']);
  });

  it('ofrece el año del valor aunque quede fuera del rango', () => {
    render(<SelectorDePeriodo valor="2010-06" onChange={() => {}} anioDesde={2024} anioHasta={2026} />);
    expect(screen.getByLabelText('Año')).toHaveValue('2010');
  });

  it('los atajos eligen este mes y el mes anterior', async () => {
    const u = userEvent.setup();
    const alCambiar = vi.fn();
    render(<SelectorDePeriodo valor="2020-01" onChange={alCambiar} />);
    await u.click(screen.getByRole('button', { name: 'Este mes' }));
    expect(alCambiar).toHaveBeenLastCalledWith(mesDeHoy());
    await u.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(alCambiar).toHaveBeenLastCalledWith(desplazarMes(mesDeHoy(), -1));
  });

  it('los atajos se pueden quitar', () => {
    render(<SelectorDePeriodo valor="2026-03" onChange={() => {}} atajos={false} />);
    expect(screen.queryByRole('button', { name: 'Este mes' })).toBeNull();
  });

  it('con un valor inválido deja los selectores sin elegir y completa con lo de hoy al elegir uno', async () => {
    const u = userEvent.setup();
    const alCambiar = vi.fn();
    render(<SelectorDePeriodo valor="2026-13" onChange={alCambiar} error="El mes no es válido." />);
    expect(screen.getByLabelText('Mes')).toHaveValue('');
    expect(screen.getByLabelText('Año')).toHaveValue('');
    expect(screen.getByRole('alert')).toHaveTextContent('El mes no es válido.');
    expect(screen.getByLabelText('Mes')).toHaveAttribute('aria-invalid', 'true');
    await u.selectOptions(screen.getByLabelText('Mes'), 'Julio');
    expect(alCambiar).toHaveBeenLastCalledWith(`${mesDeHoy().slice(0, 4)}-07`);
  });

  it('dos selectores en la misma pantalla no se pisan si tienen otro id', () => {
    render(<><SelectorDePeriodo id="a" etiqueta="Período A" valor="2026-03" onChange={() => {}} /><SelectorDePeriodo id="b" etiqueta="Período B" valor="2026-04" onChange={() => {}} /></>);
    expect(screen.getAllByLabelText('Mes')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Período B' })).toBeInTheDocument();
  });
});
