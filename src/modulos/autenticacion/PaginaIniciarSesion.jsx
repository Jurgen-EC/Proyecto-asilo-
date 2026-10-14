import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAutenticacion } from '../../nucleo/autenticacion/ContextoAutenticacion.jsx';
import { mensajeParaUsuario } from '../../nucleo/datos/errores.js';
import Cargando from '../../compartido/componentes/Cargando.jsx';
import BannerDemo from '../../compartido/componentes/BannerDemo.jsx';

export default function PaginaIniciarSesion() {
  const { usuario, cargando, iniciarSesion, esDemo } = useAutenticacion();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const navegar = useNavigate();
  const ubicacion = useLocation();

  if (cargando) return <Cargando mensaje="Verificando sesión…" />;
  if (usuario) return <Navigate to="/" replace />;

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setError('');
    if (!correo.trim() || !clave) {
      setError('Escribí tu correo y tu contraseña.');
      return;
    }
    setEnviando(true);
    try {
      await iniciarSesion(correo, clave);
      navegar(ubicacion.state?.desde ?? '/', { replace: true });
    } catch (err) {
      setError(mensajeParaUsuario(err));
      setEnviando(false);
    }
  }

  return (
    <div className="pagina-centrada">
      {esDemo && <BannerDemo />}
      <form className="formulario-login" onSubmit={enviar} noValidate>
        <h1>Inventario de Cocina</h1>
        <p className="texto-suave">Hogar de Ancianos Jafeth Jiménez Morales</p>
        <label htmlFor="correo">Correo</label>
        <input id="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        <label htmlFor="clave">Contraseña</label>
        <input id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        {error && <p className="error-formulario" role="alert">{error}</p>}
        <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Ingresando…' : 'Iniciar sesión'}</button>
        {esDemo && (
          <p className="ayuda-demo">Usuario de demostración: <code>demo@hogar.local</code> · Contraseña: <code>demo1234</code></p>
        )}
      </form>
    </div>
  );
}
