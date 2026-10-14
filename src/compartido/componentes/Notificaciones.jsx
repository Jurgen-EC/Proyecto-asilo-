import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const Contexto = createContext(null);
const DURACION_MS = 5000;

export function ProveedorNotificaciones({ children }) {
  const [lista, setLista] = useState([]);
  const contador = useRef(0);
  const temporizadores = useRef(new Map());

  const cerrar = useCallback((id) => {
    clearTimeout(temporizadores.current.get(id));
    temporizadores.current.delete(id);
    setLista((l) => l.filter((n) => n.id !== id));
  }, []);

  const notificar = useCallback((tipo, mensaje) => {
    const id = ++contador.current;
    setLista((l) => [...l, { id, tipo, mensaje }]);
    temporizadores.current.set(id, setTimeout(() => cerrar(id), DURACION_MS));
    return id;
  }, [cerrar]);

  useEffect(() => () => temporizadores.current.forEach(clearTimeout), []);

  const valor = useMemo(() => ({
    exito: (m) => notificar('exito', m),
    error: (m) => notificar('error', m),
    info: (m) => notificar('info', m),
  }), [notificar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="notificaciones" aria-live="polite">
        {lista.map((n) => (
          <div key={n.id} className={`notificacion notificacion--${n.tipo}`} role={n.tipo === 'error' ? 'alert' : 'status'}>
            <span>{n.mensaje}</span>
            <button type="button" className="notificacion__cerrar" onClick={() => cerrar(n.id)} aria-label="Cerrar aviso">×</button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useNotificaciones() {
  const v = useContext(Contexto);
  if (!v) throw new Error('useNotificaciones debe usarse dentro de ProveedorNotificaciones.');
  return v;
}
