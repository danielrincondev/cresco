// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./push.ts", "./_generated/*.js"]);

const AHORA = new Date("2026-09-09T15:00:00Z");
const TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

/** Respuesta de Expo: un resultado por mensaje, en el mismo orden. */
function respondeExpo(...resultados: Record<string, unknown>[]) {
  const fetchFalso = vi.fn(async () =>
    new Response(JSON.stringify({ data: resultados }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchFalso);
  return fetchFalso;
}

const ok = { status: "ok", id: "recibo" };
const muerto = { status: "error", message: "...", details: { error: "DeviceNotRegistered" } };

/** Los mensajes tal como salieron hacia Expo en la primera petición. */
function mensajesEnviados(fetchFalso: ReturnType<typeof vi.fn>, peticion = 0) {
  const [, opciones] = fetchFalso.mock.calls[peticion] as [string, RequestInit];
  return JSON.parse(opciones.body as string) as Record<string, unknown>[];
}

async function sembrar(
  t: ReturnType<typeof convexTest>,
  opciones: {
    tipo?: "ACCION_NEGATIVA" | "ACCION_POSITIVA" | "ALERTA_EMERGENCIA" | "REPORTE_DIARIO";
    tokens?: string[];
    enviadaEn?: number;
  } = {},
) {
  return await t.run(async (ctx) => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "rep_1", tipoDocumento: "CEDULA", numeroDocumento: "0900000001",
      actualizadoEn: Date.now(),
    });
    const dispositivos: Id<"dispositivo">[] = [];
    for (const tokenPush of opciones.tokens ?? [TOKEN]) {
      dispositivos.push(
        await ctx.db.insert("dispositivo", {
          perfilUsuarioId, tokenPush, plataforma: "ANDROID", activo: true,
          actualizadoEn: Date.now(),
        }),
      );
    }
    const notificacionId = await ctx.db.insert("notificacion", {
      perfilUsuarioId,
      tipo: opciones.tipo ?? "ACCION_NEGATIVA",
      titulo: "Ana Pérez interrumpió la clase",
      cuerpo: "Se le descontó 1 punto por indisciplina el 9 de septiembre.",
      entidadTipo: "accionRegistrada",
      enviadaEn: opciones.enviadaEn,
    });
    return { perfilUsuarioId, notificacionId, dispositivos };
  });
}

beforeEach(() => vi.useFakeTimers().setSystemTime(AHORA));
afterEach(() => vi.unstubAllGlobals());

describe("push — lo que se le cuenta a Expo", () => {
  it("no manda el nombre del estudiante ni el detalle de la conducta", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    const fetchFalso = respondeExpo(ok);

    await t.action(internal.push.enviar, { notificacionId });

    const enviado = JSON.stringify(mensajesEnviados(fetchFalso));
    // El aviso de privacidad 2026-09-v1 declara que Expo recibe solo el
    // identificador del dispositivo. Si esto falla, ese documento es falso.
    expect(enviado).not.toContain("Ana");
    expect(enviado).not.toContain("Pérez");
    expect(enviado).not.toContain("indisciplina");
    expect(enviado).not.toContain("punto");
    expect(mensajesEnviados(fetchFalso)[0]).toMatchObject({
      to: TOKEN,
      title: "Cresco",
      body: "Tienes una novedad de tu representado",
      data: { notificacionId },
    });
  });

  it("una acción positiva y una negativa mandan exactamente el mismo texto", async () => {
    const t = convexTest(schema, modules);
    const negativa = await sembrar(t, { tipo: "ACCION_NEGATIVA" });
    const primerFetch = respondeExpo(ok);
    await t.action(internal.push.enviar, { notificacionId: negativa.notificacionId });
    const textoNegativa = mensajesEnviados(primerFetch)[0].body;

    const t2 = convexTest(schema, modules);
    const positiva = await sembrar(t2, { tipo: "ACCION_POSITIVA" });
    const segundoFetch = respondeExpo(ok);
    await t2.action(internal.push.enviar, { notificacionId: positiva.notificacionId });

    // Distinguirlas en la pantalla bloqueada ya diria algo sobre el nino a
    // cualquiera que mire el telefono de reojo.
    expect(mensajesEnviados(segundoFetch)[0].body).toBe(textoNegativa);
  });

  it("solo la alerta de emergencia suena y va con prioridad alta", async () => {
    const t = convexTest(schema, modules);
    const alerta = await sembrar(t, { tipo: "ALERTA_EMERGENCIA" });
    const fetchAlerta = respondeExpo(ok);
    await t.action(internal.push.enviar, { notificacionId: alerta.notificacionId });
    expect(mensajesEnviados(fetchAlerta)[0]).toMatchObject({
      body: "Alerta de emergencia — abre Cresco",
      sound: "default",
      priority: "high",
    });

    const t2 = convexTest(schema, modules);
    const reporte = await sembrar(t2, { tipo: "REPORTE_DIARIO" });
    const fetchReporte = respondeExpo(ok);
    await t2.action(internal.push.enviar, { notificacionId: reporte.notificacionId });
    expect(mensajesEnviados(fetchReporte)[0]).toMatchObject({
      body: "Tienes el reporte de hoy",
      sound: null,
      priority: "normal",
    });
  });
});

describe("push — entrega y dispositivos muertos", () => {
  it("marca la notificación como enviada cuando al menos un teléfono la recibió", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    respondeExpo(ok);

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      enviados: 1, muertos: 0,
    });
    expect((await t.run((ctx) => ctx.db.get(notificacionId)))?.enviadaEn).toBe(AHORA.getTime());
  });

  it("apaga el dispositivo que Expo declara no registrado y conserva el otro", async () => {
    const t = convexTest(schema, modules);
    const otro = "ExpoPushToken[yyyyyyyyyyyyyyyyyyyyyy]";
    const { notificacionId, dispositivos } = await sembrar(t, { tokens: [TOKEN, otro] });
    respondeExpo(muerto, ok);

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      enviados: 1, muertos: 1,
    });

    const estado = await t.run(async (ctx) => ({
      primero: await ctx.db.get(dispositivos[0]),
      segundo: await ctx.db.get(dispositivos[1]),
    }));
    expect(estado.primero?.activo).toBe(false);
    expect(estado.segundo?.activo).toBe(true);
  });

  it("no reenvía una notificación que ya salió", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t, { enviadaEn: 1 });
    const fetchFalso = respondeExpo(ok);

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      enviados: 0, muertos: 0,
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("ignora un token con formato inválido sin llamar a Expo", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t, { tokens: ["fcm:token-de-otro-proveedor"] });
    const fetchFalso = respondeExpo(ok);

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      enviados: 0, muertos: 0,
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("no envía a un dispositivo ya apagado", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId, dispositivos } = await sembrar(t);
    await t.run((ctx) => ctx.db.patch(dispositivos[0], { activo: false }));
    const fetchFalso = respondeExpo(ok);

    await t.action(internal.push.enviar, { notificacionId });
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("push — cuando Expo falla", () => {
  it("si Expo responde 500 la notificación sigue en bandeja y nadie se apaga", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId, dispositivos } = await sembrar(t);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      enviados: 0, muertos: 0,
    });

    const estado = await t.run(async (ctx) => ({
      notificacion: await ctx.db.get(notificacionId),
      dispositivo: await ctx.db.get(dispositivos[0]),
    }));
    expect(estado.notificacion).not.toBeNull();
    expect(estado.notificacion?.enviadaEn).toBeUndefined();
    expect(estado.dispositivo?.activo).toBe(true);
  });

  it("si la red se cae tampoco se pierde la notificación", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));

    await expect(t.action(internal.push.enviar, { notificacionId })).resolves.toEqual({
      enviados: 0, muertos: 0,
    });
    expect((await t.run((ctx) => ctx.db.get(notificacionId)))?.enviadaEn).toBeUndefined();
  });
});

describe("push — tandas", () => {
  it("parte en peticiones de 100 cuando hay más teléfonos", async () => {
    const t = convexTest(schema, modules);
    const tokens = Array.from({ length: 101 }, (_, i) =>
      `ExponentPushToken[dispositivo-${i}------]`,
    );
    const { notificacionId } = await sembrar(t, { tokens });
    const fetchFalso = vi.fn(async (_url: string, opciones: RequestInit) => {
      const enviados = JSON.parse(opciones.body as string) as unknown[];
      return new Response(JSON.stringify({ data: enviados.map(() => ok) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      enviados: 101, muertos: 0,
    });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(mensajesEnviados(fetchFalso, 0)).toHaveLength(100);
    expect(mensajesEnviados(fetchFalso, 1)).toHaveLength(1);
  });
});
