import { useEffect, useRef } from "react";

/**
 * Deja constancia en el servidor de que la familia tuvo ciertas cosas en
 * pantalla —los avisos del curso, los reportes anteriores—, para que el
 * docente sepa quién ya las vio (`comunicadosPublicados`, `lecturasDeReportes`).
 *
 * Funciona como `useLecturaSensible`: una `query` no puede escribir, así que lo
 * registra la pantalla al mostrarlas. Un fallo no se le enseña a nadie: la
 * familia no puede hacer nada con él, y quitarle la pantalla por esto sería
 * peor que registrar de menos.
 *
 * La lista se reduce a una clave de texto para que el efecto no se repita en
 * cada render: `useQuery` entrega un arreglo nuevo aunque traiga lo mismo. Por
 * lo mismo, `registrar` se guarda en una ref y no entra en las dependencias:
 * suele ser una función nueva en cada render. El servidor igual ignora lo que
 * ya estaba registrado.
 */
export function useRegistrarVistos<T extends string>(
  estudianteId: string,
  ids: readonly T[] | undefined,
  registrar: (ids: T[]) => Promise<unknown>,
  que: string,
) {
  const ultimo = useRef(registrar);
  ultimo.current = registrar;
  const clave = [...(ids ?? [])].sort().join(",");

  useEffect(() => {
    if (!clave) return;
    let cancelada = false;
    void (async () => {
      try {
        await ultimo.current(clave.split(",") as T[]);
      } catch (error) {
        if (!cancelada) console.warn(`[${que}] no se pudo registrar que se vieron:`, error);
      }
    })();
    return () => {
      cancelada = true;
    };
  }, [estudianteId, clave, que]);
}
