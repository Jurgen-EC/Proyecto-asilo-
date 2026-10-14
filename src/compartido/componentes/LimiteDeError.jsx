import { Component } from 'react';

// Evita la pantalla en blanco si un componente falla. No muestra detalles técnicos al usuario.
export default class LimiteDeError extends Component {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  componentDidCatch(error) { console.error('Error de interfaz:', error); }
  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="pagina-centrada" role="alert">
        <h1>Algo salió mal</h1>
        <p>Ocurrió un error inesperado. Tus datos guardados no se perdieron.</p>
        <button type="button" className="boton" onClick={() => window.location.assign('/')}>Volver al inicio</button>
      </div>
    );
  }
}
