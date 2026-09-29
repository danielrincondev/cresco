/**
 * Crear una notificación en bandeja y programar su entrega al teléfono.
 *
 * Vivía como función privada de `interaccion.ts`. Pasa a compartida porque
 * `conducta.ts` la necesita para avisar de acciones, reportes y comunicados —
 * antes esos tres caminos no notificaban a nadie (issue de QA del 26 de
 * septiembre): un representante solo se enteraba de una anotación, un reporte
 * publicado o un evento del curso si abría la aplicación por su cuenta.
 *
 * `interaccion.ts` importar de `conducta.ts` (usa `recalcularPuntaje`) y ahora
 * `conducta.ts` necesita esto: dejarla en cualquiera de los dos crea un ciclo.
 * Vive en `lib/` porque no pertenece a ningún módulo de dominio en concreto.
 */

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * El push va con `scheduler.runAfter(0, ...)` y no con una llamada directa: si
 * el envío fallara dentro de esta transacción, se revertiría **la notificación
 * misma**. La bandeja tiene que sobrevivir aunque el push no salga; al revés
 * no sirve de nada.
 *
 * Lo que viaja a Expo es un aviso genérico, nunca este `titulo` ni este
 * `cuerpo` — ver `push.ts`, que explica por qué.
 */
export async function notificar(
  ctx: MutationCtx,
  perfilUsuarioId: Id<"perfilUsuario">,
  tipo: Doc<"notificacion">["tipo"],
  titulo: string,
  cuerpo: string,
  entidadTipo?: string,
  entidadId?: string,
): Promise<Id<"notificacion">> {
  const notificacionId = await ctx.db.insert("notificacion", {
    perfilUsuarioId,
    tipo,
    titulo,
    cuerpo,
    entidadTipo,
    entidadId,
  });
  await ctx.scheduler.runAfter(0, internal.push.enviar, { notificacionId });
  return notificacionId;
}
