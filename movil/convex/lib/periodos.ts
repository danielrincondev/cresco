/**
 * El parcial vigente, resuelto por fecha — no por el campo `estado`.
 *
 * ## El error que esto arregla
 *
 * Hasta el 27 de septiembre, cinco sitios distintos —`registrarAccion`,
 * `tomarAsistencia`, `periodoDelCurso` (que a su vez usan
 * `guardarReporteGeneral`, `publicarReporteGeneral`, `reporteAcumulado` y
 * `crearComunicado`), `cierreNocturno` y `presentarCurso`— exigían
 * `estado === "EN_CURSO"` para encontrar "el parcial de hoy". El problema:
 * **nada en toda la aplicación escribía jamás ese valor.**
 * `definirPeriodos` y `corregirFechasPeriodos` solo insertan o actualizan con
 * `estado: "PLANIFICADO"`, y ni el cron nocturno ni ninguna mutation lo
 * transicionaba a `"EN_CURSO"`.
 *
 * El propio contrato de núcleo (`docs/04-guias/contrato-nucleo.md`) ya
 * avisaba de esto: *"No abre ni cierra períodos; esa transición de
 * calendario es independiente."* Esa transición independiente nunca se
 * construyó en ningún sitio.
 *
 * Consecuencia real: para cualquier institución que definiera sus parciales
 * y de verdad llegara a esas fechas —no una sembrada a mano en una
 * prueba—, pasar lista, anotar conducta, publicar el reporte del día,
 * avisar al curso y hasta el propio cierre nocturno fallaban siempre con
 * "no hay parcial en curso", sin importar qué fechas se hubieran puesto.
 * Las 486 pruebas automáticas nunca lo vieron porque todas insertan el
 * parcial directo en la base con `estado: "EN_CURSO"` a mano
 * (`t.run(...)`), saltándose por completo la mutation real que un docente
 * usa. Se descubrió probando la aplicación de verdad, con fechas de verdad.
 *
 * ## La regla ahora
 *
 * Un parcial es el vigente para una fecha si esa fecha cae dentro de su
 * rango **y no está cerrado** — sin importar lo que diga `estado`, que hoy
 * se queda en "PLANIFICADO" para siempre salvo que algo lo cierre a mano.
 * Es la misma regla que `aprobarEstudiante` ya usaba para decidir qué
 * parciales inicializar (`p.estado !== "CERRADO" && p.fechaFin >= hoy`),
 * generalizada al resto de la aplicación en vez de quedarse como una
 * excepción aislada.
 *
 * `estado` no se borra del esquema: sigue siendo la fuente de verdad para
 * "este parcial está cerrado y sus puntajes no se tocan" — eso lo decide
 * quien cierra el parcial, no el calendario. Lo que deja de hacer falta es
 * que algo transicione activamente a "EN_CURSO": la vigencia se lee de las
 * fechas en el momento, nunca de un campo que un proceso en segundo plano
 * tendría que mantener sincronizado.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * El predicado puro, para quien ya trae la lista de parciales consigo
 * (`presentarCurso` los pide de todas formas para mostrar el calendario
 * entero) y no necesita una segunda consulta solo para esto.
 */
export function esVigentePorFecha(
  periodo: Pick<Doc<"periodoAcademico">, "estado" | "fechaInicio" | "fechaFin">,
  fecha: string,
): boolean {
  return (
    periodo.estado !== "CERRADO" &&
    periodo.fechaInicio <= fecha &&
    fecha <= periodo.fechaFin
  );
}

/** La misma regla, para quien no tiene ya la lista de parciales a mano. */
export async function periodoVigentePorFecha(
  ctx: QueryCtx | MutationCtx,
  anioLectivoId: Id<"anioLectivo">,
  fecha: string,
): Promise<Doc<"periodoAcademico"> | null> {
  const periodos = await ctx.db
    .query("periodoAcademico")
    .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", anioLectivoId))
    .collect();
  return periodos.find((p) => esVigentePorFecha(p, fecha)) ?? null;
}
