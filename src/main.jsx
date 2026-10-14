import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ProveedorAutenticacion } from './nucleo/autenticacion/ContextoAutenticacion.jsx';
import { ProveedorNotificaciones } from './compartido/componentes/Notificaciones.jsx';
import LimiteDeError from './compartido/componentes/LimiteDeError.jsx';
import './estilos.css';

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <LimiteDeError>
      <BrowserRouter>
        <ProveedorNotificaciones>
          <ProveedorAutenticacion>
            <App />
          </ProveedorAutenticacion>
        </ProveedorNotificaciones>
      </BrowserRouter>
    </LimiteDeError>
  </StrictMode>,
);
