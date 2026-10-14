export default function EstadoVacio({ titulo, mensaje, children }) {
  return (
    <div className="estado-vacio">
      <h3>{titulo}</h3>
      {mensaje && <p>{mensaje}</p>}
      {children}
    </div>
  );
}
