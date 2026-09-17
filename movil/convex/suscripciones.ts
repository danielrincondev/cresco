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

import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { AUDIENCIA_PLAN } from "./lib/enums";
import { ErrorDominio } from "./lib/guardas";
import { ErrorPermiso, exigirPerfil } from "./lib/permisos";
import { interpretarEvento, leerEvento, tieneAccesoVigente } from "./lib/revenuecat";

/** Los errores esperados conservan codigo y mensaje al llegar al cliente. */
async function conErroresPublicos<T>(operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    if (error instanceof ErrorDominio || error instanceof ErrorPermiso) {
      throw new ConvexError({ codigo: error.codigo, mensaje: error.message });
    }
    throw error;
  }
}

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
      // Se lee del payload antes de interpretarlo: un evento que despues falle
      // al aplicarse tiene que quedar marcado igual, porque para separar datos
      // de prueba de datos reales da igual si se aplico o no.
      esSandbox: lecturaSandbox(args.payload),
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
      /**
       * Y se grita en el log.
       *
       * Guardar el fallo en la fila es lo correcto, pero durante un tiempo
       * **nadie lo leia**: `errorProcesamiento` se escribia y no habia
       * consulta, panel ni aviso que lo mirara. Un evento aqui es alguien que
       * **pago y no tiene su plan**, y el equipo se enteraba solo si esa
       * persona se quejaba.
       *
       * `console.error` aparece en el log de Convex al instante y es lo que
       * dispara cualquier alerta que se configure despues.
       */
      console.error(
        `[revenuecat] evento ${args.eventoIdExterno} (${args.tipoEvento}) guardado sin aplicar:`,
        mensaje,
      );
      return { estado: "GUARDADO_CON_ERROR" as const, error: mensaje };
    }
  },
});

/**
 * Los eventos de pago que llegaron y **no** se pudieron aplicar.
 *
 * Cada fila aqui es una persona que pago y puede no tener su plan. Es la
 * lista que hay que revisar antes de dar por bueno un dia de cobros, y la
 * unica forma de encontrarlos sin esperar a que alguien reclame.
 *
 * Se corre con `npx convex run suscripciones:eventosSinAplicar`. Es
 * `internalQuery` a proposito: lleva el `payload` crudo de RevenueCat y no
 * tiene por que existir como superficie publica.
 */
export const eventosSinAplicar = internalQuery({
  args: {},
  handler: async (ctx) => {
    const eventos = await ctx.db.query("eventoRevenuecat").collect();
    const fallidos = eventos.filter((e) => e.errorProcesamiento !== undefined);
    return {
      total: eventos.length,
      sinAplicar: fallidos.length,
      eventos: fallidos
        .sort((a, b) => b.recibidoEn - a.recibidoEn)
        .map((e) => ({
          eventoIdExterno: e.eventoIdExterno,
          tipoEvento: e.tipoEvento,
          revenuecatAppUserId: e.revenuecatAppUserId,
          recibidoEn: e.recibidoEn,
          error: e.errorProcesamiento,
        })),
    };
  },
});

/** `environment` del payload crudo, sin pasar por el interprete. */
function lecturaSandbox(payload: unknown): boolean {
  const evento = (payload as { event?: { environment?: unknown } } | null)?.event;
  return evento?.environment === "SANDBOX";
}

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

  // `normalizeId` en vez de `get` directo: con un identificador que no es de
  // Convex -- el evento de prueba manda un UUID -- `get` lanza un error que
  // deshace la transaccion, y entonces ni siquiera queda registrado el evento
  // fallido. Asi se convierte en un error de dominio normal, que el manejador
  // guarda y responde 200.
  const perfilId = ctx.db.normalizeId("perfilUsuario", evento.app_user_id);
  if (perfilId === null) {
    throw new Error(
      `El app_user_id "${evento.app_user_id}" no es un perfilUsuario de Cresco. ` +
        `La app debe configurar el SDK con el perfilUsuario._id.`,
    );
  }
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
    // ADR-008. `interpretarEvento` ya lo calculaba y **se descartaba**: una
    // compra del Test Store quedaba indistinguible de una real salvo leyendo
    // el JSON del payload a mano.
    esSandbox: interpretacion.esSandbox,
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

/* ------------------------------------------------------------------ *
 *  LO QUE LEE LA APLICACIÓN  (D19, P11)
 * ------------------------------------------------------------------ */

const audiencia = v.union(...AUDIENCIA_PLAN.map((a) => v.literal(a)));

/** El plan gratuito de esa audiencia, que es donde cae quien no paga. */
async function planGratuito(ctx: QueryCtx, aud: Doc<"plan">["audiencia"]) {
  const planes = await ctx.db.query("plan").collect();
  return planes.find(
    (p) => p.audiencia === aud && p.activo && p.entitlementRevenuecat === undefined,
  ) ?? null;
}

function presentarPlan(plan: Doc<"plan">) {
  return {
    codigo: plan.codigo,
    nombre: plan.nombre,
    audiencia: plan.audiencia,
    periodicidad: plan.periodicidad,
    sinPublicidad: plan.sinPublicidad,
    /** Los límites viven en la fila, no en el código: cambiarlos no es desplegar. */
    limites: plan.limites,
    productoGooglePlay: plan.productoGooglePlay ?? null,
  };
}

/**
 * El estado de suscripción del usuario autenticado, por audiencia.
 *
 * Una misma persona puede ser docente y representante a la vez, y sus planes
 * son independientes: un profesor con hijos en el colegio puede tener PRO como
 * docente y seguir en el gratuito como representante. Por eso devuelve las dos
 * ramas y no un plan único.
 *
 * `acceso` sale siempre de `tieneAccesoVigente`, **nunca de comparar el estado
 * a mano**: una suscripción `CANCELADA` sigue dando acceso hasta que expira, y
 * tratarla como vencida le quitaría a alguien lo que ya pagó. Esa regla vive
 * en `lib/revenuecat.ts` para que exista una sola versión de la verdad.
 *
 * Devuelve `null` en la rama que la persona no tiene: quien no es docente no
 * ve un paywall de docente.
 */
export const miSuscripcion = query({
  args: {},
  handler: (ctx) => conErroresPublicos(async () => {
    const perfil = await exigirPerfil(ctx);
    const ahora = Date.now();

    const esDocente = await ctx.db.query("docente")
      .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", perfil._id)).unique();
    const esRepresentante = await ctx.db.query("representante")
      .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", perfil._id)).unique();

    // El índice permite consultar solo por el prefijo, sin fijar el estado:
    // interesan todas, incluidas las canceladas que aún no expiran.
    const suyas = await ctx.db.query("suscripcion")
      .withIndex("por_usuario", (q) => q.eq("perfilUsuarioId", perfil._id))
      .collect();

    const mejorPorAudiencia = new Map<string, {
      suscripcion: Doc<"suscripcion">; plan: Doc<"plan">; acceso: boolean;
    }>();
    for (const suscripcion of suyas) {
      const plan = await ctx.db.get(suscripcion.planId);
      if (plan === null) continue;
      // `expiraEn` es opcional en el documento y la guarda lo pide explicito:
      // se pasa como null para que "no expira" no se confunda con "sin dato".
      const acceso = tieneAccesoVigente(
        { estado: suscripcion.estado, expiraEn: suscripcion.expiraEn ?? null },
        ahora,
      );
      const previa = mejorPorAudiencia.get(plan.audiencia);
      // Gana la que da acceso; entre iguales, la que empezó después.
      const mejor = previa === undefined ||
        (acceso && !previa.acceso) ||
        (acceso === previa.acceso && suscripcion.iniciaEn > previa.suscripcion.iniciaEn);
      if (mejor) mejorPorAudiencia.set(plan.audiencia, { suscripcion, plan, acceso });
    }

    async function rama(aud: Doc<"plan">["audiencia"], tieneElRol: boolean) {
      if (!tieneElRol) return null;
      const mejor = mejorPorAudiencia.get(aud);
      if (mejor !== undefined && mejor.acceso) {
        return {
          plan: presentarPlan(mejor.plan),
          estado: mejor.suscripcion.estado,
          expiraEn: mejor.suscripcion.expiraEn ?? null,
          renovacionAutomatica: mejor.suscripcion.renovacionAutomatica,
          acceso: true as const,
        };
      }
      // Sin acceso vigente se cae al gratuito, aunque exista una suscripción
      // vencida: lo que la pantalla tiene que mostrar es lo que puede hacer hoy.
      const gratuito = await planGratuito(ctx, aud);
      if (gratuito === null) return null;
      return {
        plan: presentarPlan(gratuito),
        estado: mejor?.suscripcion.estado ?? ("SIN_SUSCRIPCION" as const),
        expiraEn: mejor?.suscripcion.expiraEn ?? null,
        renovacionAutomatica: false,
        acceso: false as const,
      };
    }

    return {
      representante: await rama("REPRESENTANTE", esRepresentante !== null),
      docente: await rama("DOCENTE", esDocente !== null),
    };
  }),
});

/**
 * El catálogo de planes de pago de una audiencia, para pintar el paywall.
 *
 * No incluye el gratuito: no es algo que se compre, es donde se está. Y no
 * devuelve precios — los pone RevenueCat en el dispositivo, con la moneda y el
 * formato de cada país (ADR-006). Escribir un precio aquí sería tener dos
 * fuentes de verdad para lo único que no admite dos.
 */
export const planesDisponibles = query({
  args: { audiencia },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirPerfil(ctx);
    const planes = await ctx.db.query("plan").collect();
    return planes
      .filter((p) => p.activo && p.audiencia === args.audiencia && p.entitlementRevenuecat !== undefined)
      .map((p) => ({ ...presentarPlan(p), entitlement: p.entitlementRevenuecat ?? null }));
  }),
});
