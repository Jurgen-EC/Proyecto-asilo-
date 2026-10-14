export default function Cargando({ mensaje = 'Cargando…' }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      <span className="cargando__rueda" aria-hidden="true" />
      <span>{mensaje}</span>
    </div>
  );
}
