import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Recurso = "FICHA_ESTUDIANTE" | "BITACORA_ACCIONES" | "REPORTE_ESTUDIANTE" | "PUNTAJE_PERIODO";

/**
 * Registra en la bitácora que alguien abrió datos de un estudiante.
 *
 * ── Por qué esto tiene que vivir en la pantalla ─────────────────────────────
 *
 * `LEER_SENSIBLE` es uno de los cuatro eventos de DP-006, y es el único que no
 * puede escribirse donde ocurre: las `query` de Convex son de solo lectura y
 * cacheadas, así que no pueden registrar la lectura desde dentro de la consulta
 * que trae el dato — como sí hacía la capa de acceso sobre Postgres. Por eso
 * `auditoria.registrarLecturaSensible` es una mutation y la llama la pantalla
 * al abrirse.
 *
 * **Si la pantalla no llama, no hay registro.** Y esa bitácora es lo que se le
 * enseña a un colegio cuando pregunta *«¿quién vio los datos de mi hijo?»*.
 *
 * La mutation comprueba el acceso con las mismas guardas que la consulta real y
 * agrupa las llamadas repetidas, así que volver a montar la pantalla al rotar
 * el teléfono no ensucia la bitácora. Fallar no se le muestra a la persona: no
 * es culpa suya ni puede hacer nada, y bloquear la pantalla por un fallo de
 * auditoría sería peor que registrar de menos.
 */
export function useLecturaSensible(
  estudianteId: Id<"estudiante"> | null | undefined,
  recurso: Recurso,
  /**
   * Solo para REPORTE_ESTUDIANTE: marca `entregaReporte.leidoEn` del reporte
   * concreto, que es lo que cuenta `fraseDeLecturas` para reconocer al
   * representante que ya volvió a revisar. Se ignora para los demás recursos.
   */
  reporteEstudianteId?: Id<"reporteEstudiante"> | null,
) {
  const registrar = useMutation(api.auditoria.registrarLecturaSensible);

  useEffect(() => {
    if (!estudianteId) return;
    let cancelada = false;
    void (async () => {
      try {
        await registrar({ estudianteId, recurso, reporteEstudianteId: reporteEstudianteId ?? undefined });
      } catch (error) {
        if (!cancelada) console.warn("[auditoria] no se pudo registrar la lectura:", error);
      }
    })();
    return () => {
      cancelada = true;
    };
  }, [estudianteId, recurso, reporteEstudianteId, registrar]);
}
