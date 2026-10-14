import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { datos as datosPorDefecto } from '../datos/index.js';

const Contexto = createContext(null);

export function ProveedorAutenticacion({ children, datos = datosPorDefecto }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    datos.autenticacion.obtenerSesion().then((u) => {
      if (activo) { setUsuario(u); setCargando(false); }
    }).catch(() => { if (activo) setCargando(false); });
    const salir = datos.autenticacion.alCambiarSesion((u) => { if (activo) setUsuario(u); });
    return () => { activo = false; salir(); };
  }, [datos]);

  const iniciarSesion = useCallback((correo, clave) => datos.autenticacion.iniciarSesion(correo, clave), [datos]);
  const cerrarSesion = useCallback(() => datos.autenticacion.cerrarSesion(), [datos]);

  const valor = useMemo(
    () => ({ usuario, cargando, iniciarSesion, cerrarSesion, esDemo: datos.esDemo }),
    [usuario, cargando, iniciarSesion, cerrarSesion, datos.esDemo],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAutenticacion() {
  const v = useContext(Contexto);
  if (!v) throw new Error('useAutenticacion debe usarse dentro de ProveedorAutenticacion.');
  return v;
}
