// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { sanearParaConvex } from "./lib/revenuecat";

const modules = import.meta.glob(["./suscripciones.ts", "./_generated/*.js"]);

const AHORA = new Date("2026-09-10T15:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

/** Los cinco planes que siembra `semillas:cargar`, en lo que aquí importa. */
async function sembrarPlanes(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ahora = Date.now();
    const crear = (
      codigo: string,
      audiencia: "REPRESENTANTE" | "DOCENTE",
      entitlementRevenuecat?: string,
    ) =>
      ctx.db.insert("plan", {
        codigo,
        nombre: codigo,
        audiencia,
        entitlementRevenuecat,
        productoGooglePlay: entitlementRevenuecat === undefined ? undefined : codigo,
        periodicidad: entitlementRevenuecat === undefined ? "PERPETUO" : "MENSUAL",
        // Fiel a `semillas.ts`: solo el premium del representante quita
        // publicidad. DOC_PRO no la quita porque el docente nunca ve anuncios.
        sinPublicidad: audiencia === "REPRESENTANTE" && entitlementRevenuecat !== undefined,
        limites: { reportesPrevios: entitlementRevenuecat === undefined ? 2 : 7 },
        activo: true,
        actualizadoEn: ahora,
      });
    return {
      repFree: await crear("REP_FREE", "REPRESENTANTE"),
      repPremium: await crear("REP_PREMIUM_MENSUAL", "REPRESENTANTE", "premium"),
      docFree: await crear("DOC_FREE", "DOCENTE"),
      docPro: await crear("DOC_PRO", "DOCENTE", "docente_pro"),
    };
  });
}

/** Una persona con los roles que se le pidan. */
async function sembrarPersona(
  t: ReturnType<typeof convexTest>,
  subject: string,
  roles: { docente?: boolean; representante?: boolean },
) {
  return await t.run(async (ctx) => {
    const ahora = Date.now();
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: subject,
      tipoDocumento: "CEDULA",
      numeroDocumento: `09000000${subject.length}${subject.charCodeAt(0) % 10}`,
      actualizadoEn: ahora,
    });
    if (roles.docente) {
      await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: ahora });
    }
    if (roles.representante) {
      await ctx.db.insert("representante", { perfilUsuarioId, actualizadoEn: ahora });
    }
    return perfilUsuarioId;
  });
}

async function sembrarSuscripcion(
  t: ReturnType<typeof convexTest>,
  perfilUsuarioId: Id<"perfilUsuario">,
  planId: Id<"plan">,
  estado: "ACTIVA" | "CANCELADA" | "VENCIDA" | "EN_PERIODO_GRACIA" | "REEMBOLSADA",
  expiraEn?: number,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("suscripcion", {
      perfilUsuarioId,
      planId,
      origen: "GOOGLE_PLAY",
      estado,
      iniciaEn: Date.now() - 30 * DIA,
      expiraEn,
      renovacionAutomatica: estado === "ACTIVA",
      actualizadoEn: Date.now(),
    });
  });
}

/**
 * convex-test firma las identidades con el emisor `https://convex.test`, y
 * `perfilActual` las resuelve por `tokenIdentifier` -- emisor + subject --,
 * con respaldo al subject a secas solo para el emisor que declare
 * `CLERK_JWT_ISSUER_DOMAIN`. Declararlo aqui hace que sembrar por
 * `authSubject` siga funcionando sin que la prueba fije el formato interno de
 * la identidad, que no es asunto suyo.
 */
beforeEach(() => {
  vi.useFakeTimers().setSystemTime(AHORA);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://convex.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("suscripciones — miSuscripcion", () => {
  it("exige sesión", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.suscripciones.miSuscripcion)).rejects.toThrow(
      "Inicia sesión para continuar",
    );
  });

  it("quien no ha pagado cae en el plan gratuito de su audiencia", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);
    await sembrarPersona(t, "rep_1", { representante: true });

    const estado = await t.withIdentity({ subject: "rep_1" }).query(api.suscripciones.miSuscripcion);
    expect(estado.representante).toMatchObject({
      plan: { codigo: "REP_FREE" },
      estado: "SIN_SUSCRIPCION",
      acceso: false,
    });
  });

  /** Quien no es docente no debe ver un paywall de docente. */
  it("la rama del rol que la persona no tiene viene en null", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);
    await sembrarPersona(t, "rep_1", { representante: true });

    const estado = await t.withIdentity({ subject: "rep_1" }).query(api.suscripciones.miSuscripcion);
    expect(estado.docente).toBeNull();
    expect(estado.representante).not.toBeNull();
  });

  it("una suscripción activa da acceso y trae su plan", async () => {
    const t = convexTest(schema, modules);
    const planes = await sembrarPlanes(t);
    const perfil = await sembrarPersona(t, "doc_1", { docente: true });
    await sembrarSuscripcion(t, perfil, planes.docPro, "ACTIVA");

    const estado = await t.withIdentity({ subject: "doc_1" }).query(api.suscripciones.miSuscripcion);
    expect(estado.docente).toMatchObject({
      plan: { codigo: "DOC_PRO", sinPublicidad: false },
      estado: "ACTIVA",
      acceso: true,
    });
  });

  /**
   * La regla que existe `tieneAccesoVigente` para proteger: cancelar no es
   * vencer. Quien canceló ya pagó ese período y lo conserva hasta que expira;
   * tratarlo como vencido le quita lo que compró.
   */
  it("una cancelada que aún no expira sigue dando acceso", async () => {
    const t = convexTest(schema, modules);
    const planes = await sembrarPlanes(t);
    const perfil = await sembrarPersona(t, "rep_1", { representante: true });
    await sembrarSuscripcion(t, perfil, planes.repPremium, "CANCELADA", AHORA.getTime() + 5 * DIA);

    const estado = await t.withIdentity({ subject: "rep_1" }).query(api.suscripciones.miSuscripcion);
    expect(estado.representante).toMatchObject({
      plan: { codigo: "REP_PREMIUM_MENSUAL" },
      estado: "CANCELADA",
      acceso: true,
    });
  });

  it("una cancelada ya expirada cae al gratuito, conservando su estado", async () => {
    const t = convexTest(schema, modules);
    const planes = await sembrarPlanes(t);
    const perfil = await sembrarPersona(t, "rep_1", { representante: true });
    await sembrarSuscripcion(t, perfil, planes.repPremium, "CANCELADA", AHORA.getTime() - DIA);

    const estado = await t.withIdentity({ subject: "rep_1" }).query(api.suscripciones.miSuscripcion);
    // El plan que se muestra es lo que puede hacer hoy...
    expect(estado.representante?.plan.codigo).toBe("REP_FREE");
    expect(estado.representante?.acceso).toBe(false);
    // ...pero el estado real se conserva, para poder decirle que venció.
    expect(estado.representante?.estado).toBe("CANCELADA");
  });

  it("un reembolso no da acceso", async () => {
    const t = convexTest(schema, modules);
    const planes = await sembrarPlanes(t);
    const perfil = await sembrarPersona(t, "rep_1", { representante: true });
    await sembrarSuscripcion(t, perfil, planes.repPremium, "REEMBOLSADA");

    const estado = await t.withIdentity({ subject: "rep_1" }).query(api.suscripciones.miSuscripcion);
    expect(estado.representante?.acceso).toBe(false);
  });

  /**
   * Un profesor con hijos en el mismo colegio. Sus dos planes son
   * independientes: pagar como docente no le regala el premium de familia.
   */
  it("docente y representante a la vez llevan planes independientes", async () => {
    const t = convexTest(schema, modules);
    const planes = await sembrarPlanes(t);
    const perfil = await sembrarPersona(t, "ambos", { docente: true, representante: true });
    await sembrarSuscripcion(t, perfil, planes.docPro, "ACTIVA");

    const estado = await t.withIdentity({ subject: "ambos" }).query(api.suscripciones.miSuscripcion);
    expect(estado.docente).toMatchObject({ plan: { codigo: "DOC_PRO" }, acceso: true });
    expect(estado.representante).toMatchObject({ plan: { codigo: "REP_FREE" }, acceso: false });
  });

  it("entre dos suscripciones gana la que da acceso", async () => {
    const t = convexTest(schema, modules);
    const planes = await sembrarPlanes(t);
    const perfil = await sembrarPersona(t, "rep_1", { representante: true });
    await sembrarSuscripcion(t, perfil, planes.repPremium, "VENCIDA", AHORA.getTime() - 10 * DIA);
    await sembrarSuscripcion(t, perfil, planes.repPremium, "ACTIVA");

    const estado = await t.withIdentity({ subject: "rep_1" }).query(api.suscripciones.miSuscripcion);
    expect(estado.representante?.acceso).toBe(true);
  });
});

describe("suscripciones — planesDisponibles", () => {
  it("no ofrece el gratuito: no es algo que se compre", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);
    await sembrarPersona(t, "rep_1", { representante: true });

    const planes = await t
      .withIdentity({ subject: "rep_1" })
      .query(api.suscripciones.planesDisponibles, { audiencia: "REPRESENTANTE" });
    expect(planes.map((p) => p.codigo)).toEqual(["REP_PREMIUM_MENSUAL"]);
  });

  it("no mezcla las audiencias", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);
    await sembrarPersona(t, "doc_1", { docente: true });

    const planes = await t
      .withIdentity({ subject: "doc_1" })
      .query(api.suscripciones.planesDisponibles, { audiencia: "DOCENTE" });
    expect(planes.every((p) => p.audiencia === "DOCENTE")).toBe(true);
    expect(planes.map((p) => p.codigo)).toEqual(["DOC_PRO"]);
  });

  /**
   * ADR-006: los precios los pone RevenueCat en el dispositivo, con la moneda
   * y el formato de cada país. Escribirlos aquí sería tener dos fuentes de
   * verdad para lo único que no admite dos.
   */
  it("no devuelve precios, sino el identificador con el que preguntárselos a RevenueCat", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);
    await sembrarPersona(t, "rep_1", { representante: true });

    const planes = await t
      .withIdentity({ subject: "rep_1" })
      .query(api.suscripciones.planesDisponibles, { audiencia: "REPRESENTANTE" });
    expect(planes[0]).toMatchObject({
      productoGooglePlay: "REP_PREMIUM_MENSUAL",
      entitlement: "premium",
    });
    expect(JSON.stringify(planes)).not.toMatch(/precio|price/i);
  });
});

describe("suscripciones — los pagos que no se pudieron aplicar", () => {
  /**
   * Cada evento con `errorProcesamiento` es alguien que **pagó y puede no
   * tener su plan**. El campo se escribia desde el principio y no habia
   * consulta, panel ni aviso que lo mirara: el equipo se enteraba solo si esa
   * persona se quejaba.
   */
  it("los encuentra y deja fuera los que sí se aplicaron", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const ahora = Date.now();
      await ctx.db.insert("eventoRevenuecat", {
        eventoIdExterno: "ok-1", tipoEvento: "INITIAL_PURCHASE",
        revenuecatAppUserId: "u1", payload: {}, recibidoEn: ahora,
        procesadoEn: ahora,
      });
      await ctx.db.insert("eventoRevenuecat", {
        eventoIdExterno: "roto-1", tipoEvento: "RENEWAL",
        revenuecatAppUserId: "u2", payload: {}, recibidoEn: ahora + 1,
        errorProcesamiento: 'No hay ningún plan con productoGooglePlay = "REP_X"',
      });
      await ctx.db.insert("eventoRevenuecat", {
        eventoIdExterno: "roto-2", tipoEvento: "CANCELLATION",
        revenuecatAppUserId: "u3", payload: {}, recibidoEn: ahora + 2,
        errorProcesamiento: "No existe el perfilUsuario que envió RevenueCat.",
      });
    });

    const informe = await t.query(internal.suscripciones.eventosSinAplicar, {});
    expect(informe).toMatchObject({ total: 3, sinAplicar: 2 });
    // El más reciente primero: si hay que revisar a mano, se empieza por ahí.
    expect(informe.eventos.map((e) => e.eventoIdExterno)).toEqual(["roto-2", "roto-1"]);
    expect(informe.eventos[1].error).toContain("productoGooglePlay");
  });

  it("con todo aplicado devuelve la lista vacía", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("eventoRevenuecat", {
        eventoIdExterno: "ok-1", tipoEvento: "RENEWAL", revenuecatAppUserId: "u1",
        payload: {}, recibidoEn: Date.now(), procesadoEn: Date.now(),
      });
    });
    expect(await t.query(internal.suscripciones.eventosSinAplicar, {}))
      .toMatchObject({ total: 1, sinAplicar: 0, eventos: [] });
  });
});

describe("suscripciones — separar las compras de prueba de las reales (ADR-008)", () => {
  /** Un evento de compra tal como lo manda RevenueCat, con su entorno. */
  const evento = (entorno: "SANDBOX" | "PRODUCTION", appUserId: string) => ({
    eventoIdExterno: `evt-${entorno}`,
    tipoEvento: "INITIAL_PURCHASE",
    appUserId,
    payload: {
      event: {
        id: `evt-${entorno}`,
        type: "INITIAL_PURCHASE",
        app_user_id: appUserId,
        product_id: "REP_PREMIUM_MENSUAL",
        environment: entorno,
        purchased_at_ms: Date.now(),
        expiration_at_ms: Date.now() + 30 * DIA,
      },
    },
  });

  /**
   * `interpretarEvento` ya calculaba `esSandbox` y **se descartaba**. Una
   * compra del Test Store -- la que se hace para grabar el video -- quedaba
   * indistinguible de una real salvo leyendo el JSON del payload a mano.
   */
  it("marca la suscripción y el evento nacidos de una compra de prueba", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);
    const perfilUsuarioId = await sembrarPersona(t, "rep_1", { representante: true });

    await t.mutation(internal.suscripciones.procesarEvento, evento("SANDBOX", perfilUsuarioId));

    const estado = await t.run(async (ctx) => ({
      suscripcion: await ctx.db.query("suscripcion").unique(),
      evento: await ctx.db.query("eventoRevenuecat").unique(),
    }));
    expect(estado.suscripcion?.esSandbox).toBe(true);
    expect(estado.evento?.esSandbox).toBe(true);
    // Y da acceso igual que una real: asi es como se prueba y se graba.
    expect(estado.suscripcion?.estado).toBe("ACTIVA");
  });

  it("una compra real no queda marcada", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);
    const perfilUsuarioId = await sembrarPersona(t, "rep_2", { representante: true });

    await t.mutation(internal.suscripciones.procesarEvento, evento("PRODUCTION", perfilUsuarioId));

    const suscripcion = await t.run((ctx) => ctx.db.query("suscripcion").unique());
    expect(suscripcion?.esSandbox).toBe(false);
  });

  /**
   * La marca se lee del payload crudo, antes de interpretarlo: un evento que
   * despues falla al aplicarse tiene que quedar marcado igual, porque para
   * separar datos de prueba de datos reales da lo mismo si se aplico.
   */
  it("un evento de prueba que falla al aplicarse sigue marcado", async () => {
    const t = convexTest(schema, modules);
    const perfilUsuarioId = await sembrarPersona(t, "rep_3", { representante: true });
    // Sin planes sembrados, `aplicar` falla al resolver el producto.
    await t.mutation(internal.suscripciones.procesarEvento, evento("SANDBOX", perfilUsuarioId));

    const guardado = await t.run((ctx) => ctx.db.query("eventoRevenuecat").unique());
    expect(guardado?.esSandbox).toBe(true);
    expect(guardado?.errorProcesamiento).toBeDefined();
  });
});

describe("suscripciones — el payload real de RevenueCat se puede guardar", () => {
  /**
   * Encontrado con el boton "Send test event" del panel, el 17 de septiembre.
   * RevenueCat manda `subscriber_attributes` con claves reservadas suyas
   * (`$displayName`, `$email`, `$phoneNumber`) y **Convex prohibe los nombres
   * de campo que empiezan por `$`**. Guardar el evento tal cual tumbaba la
   * transaccion entera: 500 al webhook, cinco reintentos, y el cobro perdido.
   *
   * No es cosa del evento de prueba: una compra real trae esos atributos.
   */
  it("guarda un evento con atributos que empiezan por $", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);
    const perfilUsuarioId = await sembrarPersona(t, "rep_9", { representante: true });

    // Igual que hace `http.ts`: el payload se sanea **antes** de cruzar la
    // frontera de la mutation, porque Convex valida el valor al pasarlo como
    // argumento -- el `$` revienta antes incluso de llegar al insert.
    const crudo = {
        event: {
          id: "evt-con-dolar",
          type: "INITIAL_PURCHASE",
          app_user_id: perfilUsuarioId,
          product_id: "REP_PREMIUM_MENSUAL",
          environment: "SANDBOX",
          purchased_at_ms: Date.now(),
          expiration_at_ms: Date.now() + 30 * DIA,
          subscriber_attributes: {
            $displayName: { value: "Mister Mistoffelees", updated_at_ms: 1 },
            $email: { value: "tuxedo@revenuecat.com", updated_at_ms: 1 },
            my_custom_attribute_1: { value: "catnip", updated_at_ms: 1 },
          },
        },
    };

    await t.mutation(internal.suscripciones.procesarEvento, {
      eventoIdExterno: "evt-con-dolar",
      tipoEvento: "INITIAL_PURCHASE",
      appUserId: perfilUsuarioId,
      payload: sanearParaConvex(crudo),
    });

    const guardado = await t.run((ctx) => ctx.db.query("eventoRevenuecat").unique());
    const atributos = (guardado?.payload as { event: { subscriber_attributes: Record<string, unknown> } })
      .event.subscriber_attributes;
    // El `$` pasa a `_`: se conserva el dato y el nombre sigue siendo legible.
    expect(Object.keys(atributos).sort()).toEqual(["_displayName", "_email", "my_custom_attribute_1"]);
    // Y la suscripcion se aplico igual.
    expect(await t.run((ctx) => ctx.db.query("suscripcion").unique())).toMatchObject({ estado: "ACTIVA" });
  });

  /**
   * El evento de prueba del panel manda un UUID como `app_user_id`. Con
   * `ctx.db.get` eso lanzaba un error que deshacia la transaccion, asi que ni
   * el evento fallido quedaba registrado.
   */
  it("un app_user_id que no es de Cresco queda registrado con su error, no revienta", async () => {
    const t = convexTest(schema, modules);
    await sembrarPlanes(t);

    await t.mutation(internal.suscripciones.procesarEvento, {
      eventoIdExterno: "evt-uuid",
      tipoEvento: "INITIAL_PURCHASE",
      appUserId: "64dd9550-fda9-4fab-b669-d65b2c54cb92",
      payload: {
        event: {
          id: "evt-uuid", type: "INITIAL_PURCHASE",
          app_user_id: "64dd9550-fda9-4fab-b669-d65b2c54cb92",
          product_id: "REP_PREMIUM_MENSUAL", environment: "SANDBOX",
        },
      },
    });

    const guardado = await t.run((ctx) => ctx.db.query("eventoRevenuecat").unique());
    expect(guardado?.errorProcesamiento).toContain("no es un perfilUsuario de Cresco");
    expect(await t.run((ctx) => ctx.db.query("suscripcion").unique())).toBeNull();
  });
});
