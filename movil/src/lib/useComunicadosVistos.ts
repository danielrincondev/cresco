import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Deja constancia de que la familia tuvo estos comunicados en pantalla, para
 * que el docente pueda ver quién ya los vio (`conducta.comunicadosPublicados`).
 *
 * Funciona como `useLecturaSensible`: una `query` no puede escribir, así que
 * lo registra la pantalla al mostrarlos. Un fallo no se le enseña a nadie: la
 * familia no puede hacer nada con él, y quitarle el reporte por esto sería
 * peor que registrar de menos.
 *
 * La lista se reduce a una clave de texto para que el efecto no se repita en
 * cada render: `useQuery` entrega un arreglo nuevo aunque traiga lo mismo. El
 * servidor igual ignora lo que ya estaba registrado.
 */
export function useComunicadosVistos(
  estudianteId: Id<"estudiante">,
  comunicados: readonly { id: Id<"comunicadoCurso"> }[] | undefined,
) {
  const marcar = useMutation(api.conducta.marcarComunicadosVistos);
  const clave = (comunicados ?? []).map((c) => c.id).sort().join(",");

  useEffect(() => {
    if (!clave) return;
    const comunicadoIds = clave.split(",") as Id<"comunicadoCurso">[];
    let cancelada = false;
    void (async () => {
      try {
        await marcar({ estudianteId, comunicadoIds });
      } catch (error) {
        if (!cancelada) console.warn("[comunicados] no se pudo registrar que se vieron:", error);
      }
    })();
    return () => {
      cancelada = true;
    };
  }, [estudianteId, clave, marcar]);
}
