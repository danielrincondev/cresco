// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

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

beforeEach(() => vi.useFakeTimers().setSystemTime(AHORA));

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
