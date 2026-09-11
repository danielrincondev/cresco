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

/**
 * Copia `docenteId` a los reclamos que se crearon antes de que ese campo
 * existiera (#48).
 *
 * Mientras un reclamo no lo tenga, **no aparece en la bandeja de su docente**:
 * la consulta pasó a leer por el indice `por_docente_estado`, y un documento
 * sin el campo no esta en ese indice. Por eso esto se corre inmediatamente
 * despues de desplegar el esquema, no "cuando haya tiempo".
 *
 * Devuelve el conteo para poder comprobar que quedo en cero al repetirla.
 */
export const rellenarDocenteEnInconformidades = internalMutation({
  args: {},
  handler: async (ctx) => {
    const todas = await ctx.db.query("inconformidad").collect();

    let rellenadas = 0;
    let huerfanas = 0;
    for (const inconformidad of todas) {
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

    return { revisadas: todas.length, rellenadas, huerfanas };
  },
});
