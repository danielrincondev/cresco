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
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); });

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
  it("un ticket aceptado conserva su id sin marcar la notificación como entregada", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    respondeExpo(ok);

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      aceptados: 1, muertos: 0,
    });
    expect((await t.run((ctx) => ctx.db.get(notificacionId)))?.enviadaEn).toBeUndefined();
    expect(await t.run(ctx => ctx.db.query("entregaPush").unique())).toMatchObject({
      estado: "ACEPTADA", ticketId: "recibo", intentos: 1,
    });
  });

  it("apaga el dispositivo que Expo declara no registrado y conserva el otro", async () => {
    const t = convexTest(schema, modules);
    const otro = "ExpoPushToken[yyyyyyyyyyyyyyyyyyyyyy]";
    const { notificacionId, dispositivos } = await sembrar(t, { tokens: [TOKEN, otro] });
    respondeExpo(muerto, ok);

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      aceptados: 1, muertos: 1,
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
      aceptados: 0, muertos: 0,
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("ignora un token con formato inválido sin llamar a Expo", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t, { tokens: ["fcm:token-de-otro-proveedor"] });
    const fetchFalso = respondeExpo(ok);

    expect(await t.action(internal.push.enviar, { notificacionId })).toEqual({
      aceptados: 0, muertos: 0,
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
      aceptados: 0, muertos: 0,
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
      aceptados: 0, muertos: 0,
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
      aceptados: 101, muertos: 0,
    });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(mensajesEnviados(fetchFalso, 0)).toHaveLength(100);
    expect(mensajesEnviados(fetchFalso, 1)).toHaveLength(1);
  });
});

it("un simulacro conserva su advertencia en el push genérico", async () => {
  const t = convexTest(schema, modules);
  const { notificacionId } = await sembrar(t, { tipo: "ALERTA_EMERGENCIA" });
  await t.run(ctx => ctx.db.patch(notificacionId, {
    titulo: "[SIMULACRO] Evacuación de práctica", cuerpo: "Ejercicio programado", entidadTipo: "alertaEmergencia",
  }));
  const fetchFalso = respondeExpo(ok);
  await t.action(internal.push.enviar, { notificacionId });
  const mensaje = mensajesEnviados(fetchFalso)[0];
  expect(`${mensaje.title} ${mensaje.body}`).toContain("[SIMULACRO]");
});

it("reintentar después de un fallo parcial vuelve a enviar al dispositivo pendiente", async () => {
  const t = convexTest(schema, modules);
  const pendiente = "ExpoPushToken[pendiente]";
  const { notificacionId } = await sembrar(t, { tokens: [TOKEN, pendiente] });
  respondeExpo(ok, { status: "error", details: { error: "MessageRateExceeded" } });
  await t.action(internal.push.enviar, { notificacionId });
  vi.setSystemTime(AHORA.getTime() + 30_000);
  const reintento = respondeExpo(ok);
  await t.action(internal.push.enviar, { notificacionId });
  expect(reintento).toHaveBeenCalledTimes(1);
  expect(mensajesEnviados(reintento).map(m => m.to)).toEqual([pendiente]);
});


const MINUTO = 60_000;
function responderRecibos(datos: Record<string, unknown>) {
  const falso = vi.fn(async () => new Response(JSON.stringify({ data: datos }), { status: 200 }));
  vi.stubGlobal("fetch", falso);
  return falso;
}
const entregasDe = (t: ReturnType<typeof convexTest>) => t.run(ctx => ctx.db.query("entregaPush").collect());

describe("push — recibos de entrega", () => {
  it("consulta el ticket y confirma FCM/APNs sin reenviar el push", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    respondeExpo(ok);
    await t.action(internal.push.enviar, { notificacionId });
    const recibos = responderRecibos({ recibo: { status: "ok" } });
    // Antes de los 15 minutos no consulta ni da por entregado el mensaje.
    await t.action(internal.push.consultarRecibos, { notificacionId });
    expect(recibos).not.toHaveBeenCalled();
    vi.setSystemTime(AHORA.getTime() + 15 * MINUTO);
    await t.action(internal.push.consultarRecibos, { notificacionId });
    expect(recibos.mock.calls[0]).toMatchObject([
      "https://exp.host/--/api/v2/push/getReceipts", { body: JSON.stringify({ ids: ["recibo"] }) },
    ]);
    expect((await entregasDe(t))[0].estado).toBe("CONFIRMADA");
    expect((await t.run(ctx => ctx.db.get(notificacionId)))?.enviadaEn).toBe(Date.now());
    await t.action(internal.push.enviar, { notificacionId });
    await t.action(internal.push.consultarRecibos, { notificacionId });
    expect(recibos).toHaveBeenCalledTimes(1);
  });

  it("DeviceNotRegistered en un recibo desactiva el dispositivo", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId, dispositivos } = await sembrar(t);
    respondeExpo(ok);
    await t.action(internal.push.enviar, { notificacionId });
    responderRecibos({ recibo: muerto });
    vi.setSystemTime(AHORA.getTime() + 15 * MINUTO);
    await t.action(internal.push.consultarRecibos, { notificacionId });
    expect((await t.run(ctx => ctx.db.get(dispositivos[0])))?.activo).toBe(false);
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "FALLIDA", error: "DeviceNotRegistered" });
    expect((await t.run(ctx => ctx.db.get(notificacionId)))?.enviadaEn).toBeUndefined();
  });

  it("un recibo viejo no desactiva el dispositivo que acaba de registrarse otra vez", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId, dispositivos } = await sembrar(t);
    respondeExpo(ok);
    await t.action(internal.push.enviar, { notificacionId });
    await t.run(ctx => ctx.db.patch(dispositivos[0], { actualizadoEn: AHORA.getTime() + MINUTO }));
    responderRecibos({ recibo: muerto });
    vi.setSystemTime(AHORA.getTime() + 15 * MINUTO);
    await t.action(internal.push.consultarRecibos, { notificacionId });
    expect((await t.run(ctx => ctx.db.get(dispositivos[0])))?.activo).toBe(true);
  });

  it("un recibo temporal permite reintentar solo el teléfono pendiente aunque otro esté confirmado", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t, { tokens: [TOKEN, "ExpoPushToken[segundo]"] });
    respondeExpo({ status: "ok", id: "a" }, { status: "ok", id: "b" });
    await t.action(internal.push.enviar, { notificacionId });
    responderRecibos({ a: { status: "ok" }, b: { status: "error", details: { error: "MessageRateExceeded" } } });
    vi.setSystemTime(AHORA.getTime() + 15 * MINUTO);
    await t.action(internal.push.consultarRecibos, { notificacionId });
    expect((await t.run(ctx => ctx.db.get(notificacionId)))?.enviadaEn).toBeDefined();
    vi.setSystemTime(Date.now() + 30_000);
    const reintento = respondeExpo({ status: "ok", id: "b2" });
    await t.action(internal.push.enviar, { notificacionId });
    expect(mensajesEnviados(reintento).map(m => m.to)).toEqual(["ExpoPushToken[segundo]"]);
  });

  it("un recibo ausente se vuelve a consultar sin reenviar y deja de consultarse al agotar el límite", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    respondeExpo(ok);
    await t.action(internal.push.enviar, { notificacionId });
    const recibos = responderRecibos({});
    for (let consulta = 1; consulta <= 6; consulta++) {
      vi.setSystemTime(AHORA.getTime() + consulta * 15 * MINUTO);
      await t.action(internal.push.consultarRecibos, { notificacionId });
    }
    expect(recibos).toHaveBeenCalledTimes(5);
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "FALLIDA", error: "RECIBO_NO_DISPONIBLE", consultasRecibo: 5 });
    expect((await t.run(ctx => ctx.db.get(notificacionId)))?.enviadaEn).toBeUndefined();
  });

  it("un fallo HTTP al consultar recibos conserva el ticket para consultar después", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    respondeExpo(ok);
    await t.action(internal.push.enviar, { notificacionId });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("caído", { status: 503 })));
    vi.setSystemTime(AHORA.getTime() + 15 * MINUTO);
    await t.action(internal.push.consultarRecibos, { notificacionId });
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "ACEPTADA", ticketId: "recibo", consultasRecibo: 1 });
    vi.setSystemTime(AHORA.getTime() + 30 * MINUTO);
    responderRecibos({ recibo: { status: "ok" } });
    await t.action(internal.push.consultarRecibos, { notificacionId });
    expect((await entregasDe(t))[0].estado).toBe("CONFIRMADA");
  });
});

describe("push — reintentos programados", () => {
  it("el scheduler reintenta la red y consulta los recibos hasta confirmar", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    let envios = 0;
    const fetchFalso = vi.fn(async (url: string) => {
      if (url.endsWith("/send")) {
        envios++;
        if (envios === 1) return new Response("caído", { status: 503 });
        return new Response(JSON.stringify({ data: [ok] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { recibo: { status: "ok" } } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFalso);
    await t.action(internal.push.enviar, { notificacionId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(envios).toBe(2);
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "CONFIRMADA", intentos: 2 });
    expect((await t.run(ctx => ctx.db.get(notificacionId)))?.enviadaEn).toBeDefined();
  });

  it.each([429, 500])("HTTP %s se reintenta con espera creciente y termina después de cuatro intentos", async status => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    const momentos: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      momentos.push(Date.now());
      return new Response("fallo", { status });
    }));
    await t.action(internal.push.enviar, { notificacionId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(momentos).toHaveLength(4);
    expect(momentos[1] - momentos[0]).toBeGreaterThanOrEqual(30_000);
    expect(momentos[2] - momentos[1]).toBeGreaterThanOrEqual(60_000);
    expect(momentos[3] - momentos[2]).toBeGreaterThanOrEqual(120_000);
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "FALLIDA", intentos: 4 });
    expect((await t.run(ctx => ctx.db.get(notificacionId)))?.enviadaEn).toBeUndefined();
  });

  it("un error permanente no reintenta ni desactiva un token válido", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId, dispositivos } = await sembrar(t);
    const falso = respondeExpo({ status: "error", details: { error: "InvalidCredentials" } });
    await t.action(internal.push.enviar, { notificacionId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(falso).toHaveBeenCalledTimes(1);
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "FALLIDA", error: "InvalidCredentials" });
    expect((await t.run(ctx => ctx.db.get(dispositivos[0])))?.activo).toBe(true);
  });

  it("recupera una reserva abandonada y descarta resultados de un intento anterior", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    const primera = (await t.mutation(internal.push.prepararEnvios, { notificacionId }))!;
    expect(primera.entregas).toHaveLength(1);
    expect((await t.mutation(internal.push.prepararEnvios, { notificacionId }))!.entregas).toHaveLength(0);
    vi.setSystemTime(AHORA.getTime() + 2 * MINUTO);
    const segunda = (await t.mutation(internal.push.prepararEnvios, { notificacionId }))!;
    await t.mutation(internal.push.registrarTickets, { resultados: [{
      entregaId: primera.entregas[0].id, intento: 1, ticketId: "viejo", reintentable: false,
    }] });
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "ENVIANDO", intentos: 2 });
    await t.mutation(internal.push.registrarTickets, { resultados: [{
      entregaId: segunda.entregas[0].id, intento: 2, ticketId: "nuevo", reintentable: false,
    }] });
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "ACEPTADA", ticketId: "nuevo" });
  });

  it("dos envíos simultáneos no envían dos veces al mismo dispositivo", async () => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    const falso = respondeExpo(ok);
    await Promise.all([
      t.action(internal.push.enviar, { notificacionId }),
      t.action(internal.push.enviar, { notificacionId }),
    ]);
    expect(falso).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { data: null }, { data: [null] }, { data: [{ status: "ok" }] }])("maneja respuestas malformadas sin marcar entrega: %j", async respuesta => {
    const t = convexTest(schema, modules);
    const { notificacionId } = await sembrar(t);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(respuesta), { status: 200 })));
    await t.action(internal.push.enviar, { notificacionId });
    expect((await entregasDe(t))[0]).toMatchObject({ estado: "PENDIENTE", intentos: 1 });
    expect((await t.run(ctx => ctx.db.get(notificacionId)))?.enviadaEn).toBeUndefined();
  });
});

it("corta una petición colgada y deja el dispositivo pendiente de reintento", async () => {
  const t = convexTest(schema, modules);
  const { notificacionId } = await sembrar(t);
  let iniciada!: () => void;
  const inicio = new Promise<void>(resolve => { iniciada = resolve; });
  vi.stubGlobal("fetch", vi.fn((_url: string, opciones: RequestInit) => new Promise<Response>((_resolve, reject) => {
    opciones.signal!.addEventListener("abort", () => reject(new Error("abortada")));
    iniciada();
  })));
  const envio = t.action(internal.push.enviar, { notificacionId });
  await inicio;
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await envio).toEqual({ aceptados: 0, muertos: 0 });
  expect((await entregasDe(t))[0]).toMatchObject({ estado: "PENDIENTE", error: "RED_O_RESPUESTA_INVALIDA" });
});
