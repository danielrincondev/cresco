/**
 * Persistencia de eventos de RevenueCat. Dueño: Persona C.
 *
 * ADR-006: RevenueCat es la fuente de verdad de los pagos; `suscripcion` es una
 * proyección local y esta mutation es lo único que la mueve.
 *
 * La idempotencia vive aquí y no en el manejador HTTP a propósito: las
 * mutations de Convex son transaccionales y serializables, así que dos
 * reenvíos simultáneos del mismo evento no pueden duplicar nada. Sobre
 * Postgres esto lo garantizaba el índice único de `evento_id_externo`; aquí lo
 * garantiza la transacción.
 */

import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { interpretarEvento, leerEvento } from "./lib/revenuecat";

export const procesarEvento = internalMutation({
  args: {
    eventoIdExterno: v.string(),
    tipoEvento: v.string(),
    appUserId: v.string(),
    /** El evento completo. Guardarlo entero conserva `environment: SANDBOX`. */
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const ahora = Date.now();

    // --- Idempotencia ----------------------------------------------------
    const yaVisto = await ctx.db
      .query("eventoRevenuecat")
      .withIndex("por_evento_externo", (q) => q.eq("eventoIdExterno", args.eventoIdExterno))
      .unique();

    if (yaVisto !== null) {
      // Un reenvío de RevenueCat pasa por aquí y no toca la suscripción.
      return { estado: "DUPLICADO_IGNORADO" as const };
    }

    const eventoId = await ctx.db.insert("eventoRevenuecat", {
      eventoIdExterno: args.eventoIdExterno,
      tipoEvento: args.tipoEvento,
      revenuecatAppUserId: args.appUserId,
      payload: args.payload,
      recibidoEn: ahora,
    });

    // --- Efecto sobre la suscripción -------------------------------------
    try {
      const resultado = await aplicar(ctx, args.payload, ahora);
      await ctx.db.patch(eventoId, {
        procesadoEn: ahora,
        suscripcionId: resultado.suscripcionId,
      });
      return { estado: resultado.estado };
    } catch (error) {
      /**
       * Se registra el fallo en la fila del evento y se devuelve normalidad:
       * el evento ya está guardado, reintentarlo no lo arreglaría, y perderlo
       * sí duele. El manejador HTTP responde 200 por la misma razón.
       */
      const mensaje = error instanceof Error ? error.message : String(error);
      await ctx.db.patch(eventoId, { errorProcesamiento: mensaje });
      return { estado: "GUARDADO_CON_ERROR" as const, error: mensaje };
    }
  },
});

async function aplicar(ctx: MutationCtx, payload: unknown, ahora: number) {
  const lectura = leerEvento(payload);
  if (!lectura.ok) throw new Error(lectura.motivo);

  const evento = lectura.evento;
  const interpretacion = interpretarEvento(evento);

  if (interpretacion.efecto === "IGNORAR") {
    return { estado: "IGNORADO" as const, suscripcionId: undefined };
  }
  if (interpretacion.efecto === "DESCONOCIDO") {
    throw new Error(interpretacion.motivo);
  }

  if (!interpretacion.productoId) {
    throw new Error(`El evento ${evento.type} no trae product_id; no se puede resolver el plan`);
  }

  // --- Plan --------------------------------------------------------------
  const plan = await ctx.db
    .query("plan")
    .withIndex("por_producto", (q) => q.eq("productoGooglePlay", interpretacion.productoId!))
    .first();

  if (plan === null) {
    throw new Error(
      `No hay ningún plan con productoGooglePlay = "${interpretacion.productoId}". ` +
        `Ejecuta las semillas (semillas:cargar) o revisa el código del producto en RevenueCat.`,
    );
  }

  /**
   * `app_user_id` es el `perfilUsuario._id`, porque la app llama a
   * `Purchases.logIn(perfilId)` después del login — nunca antes. Si el usuario
   * compró sin haber iniciado sesión, RevenueCat manda un id anónimo con este
   * prefijo y no hay a quién atribuir la compra.
   */
  if (evento.app_user_id.startsWith("$RCAnonymousID:")) {
    throw new Error(
      `Compra de un usuario anónimo (${evento.app_user_id}). ` +
        `La app debe llamar a Purchases.logIn() con el perfilUsuario._id antes de permitir comprar.`,
    );
  }

  const perfilId = evento.app_user_id as Id<"perfilUsuario">;
  const perfil = await ctx.db.get(perfilId);
  if (perfil === null) {
    throw new Error(`No existe el perfilUsuario ${evento.app_user_id} que envió RevenueCat.`);
  }

  // --- Suscripción -------------------------------------------------------
  const existente = await ctx.db
    .query("suscripcion")
    .withIndex("por_revenuecat_app_user", (q) =>
      q.eq("revenuecatAppUserId", evento.app_user_id),
    )
    .first();

  const valores = {
    planId: plan._id,
    estado: interpretacion.estado,
    expiraEn: interpretacion.expiraEn ?? undefined,
    renovacionAutomatica: interpretacion.renovacionAutomatica,
    revenuecatAppUserId: evento.app_user_id,
    actualizadoEn: ahora,
  };

  if (existente !== null) {
    await ctx.db.patch(existente._id, valores);
    return { estado: "ACTUALIZADA" as const, suscripcionId: existente._id };
  }

  const suscripcionId = await ctx.db.insert("suscripcion", {
    perfilUsuarioId: perfil._id,
    iniciaEn: interpretacion.iniciaEn ?? ahora,
    origen: "GOOGLE_PLAY",
    ...valores,
  });

  return { estado: "CREADA" as const, suscripcionId };
}
