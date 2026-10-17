import { useEffect, useState } from 'react';

/** Devuelve `valor` con retardo: útil para buscar mientras se escribe sin consultar en cada tecla. */
export function useValorConRetardo(valor, ms = 250) {
  const [retardado, setRetardado] = useState(valor);
  useEffect(() => {
    const temporizador = setTimeout(() => setRetardado(valor), ms);
    return () => clearTimeout(temporizador);
  }, [valor, ms]);
  return retardado;
}
