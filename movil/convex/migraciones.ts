/**
 * Rellenos de datos que hay que correr una sola vez, a mano, tras desplegar.
 *
 * Son `internalMutation`: no tienen superficie publica y no se pueden llamar
 * desde la aplicacion. Se corren con `npx convex run migraciones:<nombre>`.
 *
 * Cada una tiene que poder correrse **dos veces sin hacer daño**. En un
 * despliegue nadie recuerda si ya la corrio, y una migracion que solo funciona
 * la primera vez es una trampa para el que venga despues.
 */

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Copia `docenteId` a los reclamos que se crearon antes de que ese campo
 * existiera (#48).
 *
 * Mientras un reclamo no lo tenga, **no aparece en la bandeja de su docente**:
 * la consulta pasó a leer por el indice `por_docente_estado`, y un documento
 * sin el campo no esta en ese indice. Por eso esto se corre inmediatamente
 * despues de desplegar el esquema, no "cuando haya tiempo".
 *
 * Procesa lotes de 100 y programa el siguiente dentro de la misma transacción.
 * Devuelve y registra los conteos de cada lote; la última ejecución informa
 * `continuacionProgramada: false`. Se inicia sin argumentos de cursor.
 */
export const rellenarDocenteEnInconformidades = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{
    revisadas: number; rellenadas: number; huerfanas: number; continuacionProgramada: boolean;
  }> => {
    const lote = await ctx.db.query("inconformidad")
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });

    let rellenadas = 0;
    let huerfanas = 0;
    for (const inconformidad of lote.page) {
      if (inconformidad.docenteId !== undefined) continue;

      const accion = await ctx.db.get(inconformidad.accionRegistradaId);
      if (accion === null) {
        // No deberia pasar: la accion es la razon de ser del reclamo. Se
        // cuenta en vez de reventar, para que un dato roto de las semillas no
        // impida rellenar los cientos que si estan bien.
        huerfanas += 1;
        continue;
      }

      await ctx.db.patch(inconformidad._id, { docenteId: accion.registradaPorDocenteId });
      rellenadas += 1;
    }

    if (!lote.isDone) {
      await ctx.scheduler.runAfter(0, internal.migraciones.rellenarDocenteEnInconformidades, {
        cursor: lote.continueCursor,
      });
    }
    const resultado = {
      revisadas: lote.page.length, rellenadas, huerfanas, continuacionProgramada: !lote.isDone,
    };
    console.info("[migracion docente en inconformidades]", resultado);
    return resultado;
  },
});
