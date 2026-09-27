/**
 * Push genérico sin nombres ni detalles de conducta. La aceptación de Expo y
 * el receipt de FCM/APNs son etapas distintas; cada dispositivo tiene su estado.
 * Todas las funciones son internas. La bandeja sobrevive a cualquier fallo push.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo acepta hasta 100 mensajes por petición. */
const MAXIMO_POR_PETICION = 100;

/**
 * Lo único que se le cuenta a Expo. Ningún texto de aquí nombra a un
 * estudiante, ni dice si la novedad fue buena o mala.
 */
const AVISO: Record<Doc<"notificacion">["tipo"], string> = {
  REPORTE_DIARIO: "Tienes el reporte de hoy",
  ACCION_POSITIVA: "Tienes una novedad de tu representado",
  ACCION_NEGATIVA: "Tienes una novedad de tu representado",
  NOTA_DOCENTE: "Tienes una novedad de tu representado",
  ESTUDIANTE_APROBADO: "Tienes una novedad de tu representado",
  COMUNICADO: "Tu docente publicó un comunicado",
  CITACION: "Tienes una cita",
  RECORDATORIO_CITA: "Tienes una cita",
  RESUMEN_SEMANAL: "Ya está el resumen de la semana",
  RESPUESTA_INCONFORMIDAD: "Hay novedades sobre tu reclamo",
  ALERTA_EMERGENCIA: "Alerta de emergencia — abre Cresco",
  SISTEMA: "Cresco",
};

/**
 * Una alerta tiene que sonar aunque el teléfono esté en reposo; lo demás no
 * merece despertar a nadie. Es la única distinción de urgencia que se hace.
 */
const esUrgente = (tipo: Doc<"notificacion">["tipo"]) => tipo === "ALERTA_EMERGENCIA";

/** Expo emite dos prefijos y los dos siguen siendo válidos. */
const TOKEN_VALIDO = /^Expo(nent)?PushToken\[[^\]]+\]$/;

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const MINUTO = 60_000;
const ESPERA_RECIBO = 15 * MINUTO;
const RESERVA_ENVIO = 2 * MINUTO;
const MAX_INTENTOS = 4;
const MAX_CONSULTAS_RECIBO = 5;
const ESPERA_REINTENTO = 30_000;

type EntregaReservada = { id: Id<"entregaPush">; tokenPush: string; intento: number };
type Preparacion = { tipo: Doc<"notificacion">["tipo"]; simulacro: boolean; entregas: EntregaReservada[] };

/** Una reserva transaccional evita que dos acciones envíen a la vez al mismo dispositivo. */
export const prepararEnvios = internalMutation({
  args: { notificacionId: v.id("notificacion") },
  handler: async (ctx, args): Promise<Preparacion | null> => {
    const notificacion = await ctx.db.get(args.notificacionId);
    if (!notificacion) return null;
    const anteriores = await ctx.db.query("entregaPush")
      .withIndex("por_notificacion_dispositivo", q => q.eq("notificacionId", notificacion._id)).collect();
    // Compatibilidad con avisos enviados antes de introducir entregaPush.
    if (anteriores.length === 0 && notificacion.enviadaEn !== undefined) return null;
    const porDispositivo = new Map(anteriores.map(e => [e.dispositivoId, e]));
    const dispositivos = await ctx.db.query("dispositivo")
      .withIndex("por_usuario", q => q.eq("perfilUsuarioId", notificacion.perfilUsuarioId).eq("activo", true)).collect();
    const ahora = Date.now();
    const entregas: EntregaReservada[] = [];
    for (const dispositivo of dispositivos) {
      if (!TOKEN_VALIDO.test(dispositivo.tokenPush)) continue;
      let entrega = porDispositivo.get(dispositivo._id);
      if (!entrega) {
        const id = await ctx.db.insert("entregaPush", {
          notificacionId: notificacion._id, dispositivoId: dispositivo._id,
          tokenPush: dispositivo.tokenPush, dispositivoActualizadoEn: dispositivo.actualizadoEn,
          estado: "PENDIENTE", intentos: 0, consultasRecibo: 0, actualizadoEn: ahora,
        });
        entrega = (await ctx.db.get(id))!;
      }
      if (entrega.tokenPush !== dispositivo.tokenPush) continue;
      const pendiente = entrega.estado === "PENDIENTE" && (entrega.proximoIntentoEn ?? 0) <= ahora;
      const abandonada = entrega.estado === "ENVIANDO" && (entrega.reservaHasta ?? 0) <= ahora;
      if (!pendiente && !abandonada) continue;
      if (entrega.intentos >= MAX_INTENTOS) {
        await ctx.db.patch(entrega._id, { estado: "FALLIDA", error: "INTENTOS_AGOTADOS", actualizadoEn: ahora });
        continue;
      }
      const intento = entrega.intentos + 1;
      await ctx.db.patch(entrega._id, {
        estado: "ENVIANDO", intentos: intento, reservaHasta: ahora + RESERVA_ENVIO,
        dispositivoActualizadoEn: dispositivo.actualizadoEn, actualizadoEn: ahora,
      });
      entregas.push({ id: entrega._id, tokenPush: entrega.tokenPush, intento });
    }
    if (entregas.length > 0) {
      // Recupera reservas si una acción termina sin poder guardar sus resultados.
      await ctx.scheduler.runAfter(RESERVA_ENVIO, internal.push.enviar, args);
    }
    return {
      tipo: notificacion.tipo,
      simulacro: notificacion.tipo === "ALERTA_EMERGENCIA" && notificacion.titulo.startsWith("[SIMULACRO]"),
      entregas,
    };
  },
});

/** Un resultado viejo no debe desactivar un token que ya se volvió a registrar. */
async function desactivarDispositivo(ctx: MutationCtx, entrega: Doc<"entregaPush">): Promise<void> {
  const dispositivo = await ctx.db.get(entrega.dispositivoId);
  const notificacion = await ctx.db.get(entrega.notificacionId);
  if (dispositivo && notificacion && dispositivo.activo &&
      dispositivo.perfilUsuarioId === notificacion.perfilUsuarioId &&
      dispositivo.tokenPush === entrega.tokenPush &&
      dispositivo.actualizadoEn === entrega.dispositivoActualizadoEn) {
    await ctx.db.patch(dispositivo._id, { activo: false, actualizadoEn: Date.now() });
  }
}

async function fallarEntrega(
  ctx: MutationCtx, entrega: Doc<"entregaPush">, error: string, reintentable: boolean,
): Promise<void> {
  const reintentar = reintentable && entrega.intentos < MAX_INTENTOS;
  const demora = ESPERA_REINTENTO * 2 ** (entrega.intentos - 1);
  await ctx.db.patch(entrega._id, {
    estado: reintentar ? "PENDIENTE" : "FALLIDA", error,
    ticketId: undefined, consultarReciboEn: undefined, reservaHasta: undefined,
    proximoIntentoEn: reintentar ? Date.now() + demora : undefined,
    actualizadoEn: Date.now(),
  });
  if (reintentar) {
    await ctx.scheduler.runAfter(demora, internal.push.enviar, { notificacionId: entrega.notificacionId });
  }
}

const resultadoTicket = v.object({
  entregaId: v.id("entregaPush"), intento: v.number(), ticketId: v.optional(v.string()),
  error: v.optional(v.string()), reintentable: v.boolean(),
});

export const registrarTickets = internalMutation({
  args: { resultados: v.array(resultadoTicket) },
  handler: async (ctx, args): Promise<void> => {
    const notificaciones = new Set<Id<"notificacion">>();
    for (const resultado of args.resultados) {
      const entrega = await ctx.db.get(resultado.entregaId);
      if (!entrega || entrega.estado !== "ENVIANDO" || entrega.intentos !== resultado.intento) continue;
      if (resultado.ticketId) {
        await ctx.db.patch(entrega._id, {
          estado: "ACEPTADA", ticketId: resultado.ticketId, consultasRecibo: 0,
          consultarReciboEn: Date.now() + ESPERA_RECIBO, reservaHasta: undefined,
          error: undefined, actualizadoEn: Date.now(),
        });
        notificaciones.add(entrega.notificacionId);
      } else {
        if (resultado.error === "DeviceNotRegistered") await desactivarDispositivo(ctx, entrega);
        await fallarEntrega(ctx, entrega, resultado.error ?? "RESPUESTA_INVALIDA", resultado.reintentable);
      }
    }
    for (const notificacionId of notificaciones) {
      await ctx.scheduler.runAfter(ESPERA_RECIBO, internal.push.consultarRecibos, { notificacionId });
    }
  },
});

export const recibosPendientes = internalQuery({
  args: { notificacionId: v.id("notificacion") },
  handler: async (ctx, args): Promise<Doc<"entregaPush">[]> => {
    // El reloj se compara en la acción, no en esta query reactiva.
    return await ctx.db.query("entregaPush")
      .withIndex("por_notificacion_dispositivo", q => q.eq("notificacionId", args.notificacionId))
      .filter(q => q.eq(q.field("estado"), "ACEPTADA")).collect();
  },
});

export const registrarRecibos = internalMutation({
  args: { resultados: v.array(v.object({
    entregaId: v.id("entregaPush"), ticketId: v.string(), consulta: v.number(),
    estado: v.union(v.literal("ok"), v.literal("error"), v.literal("pendiente")),
    error: v.optional(v.string()), reintentable: v.boolean(),
  })) },
  handler: async (ctx, args): Promise<void> => {
    const pendientes = new Set<Id<"notificacion">>();
    for (const resultado of args.resultados) {
      const entrega = await ctx.db.get(resultado.entregaId);
      if (!entrega || entrega.estado !== "ACEPTADA" || entrega.ticketId !== resultado.ticketId ||
          resultado.consulta !== entrega.consultasRecibo + 1) continue;
      if (resultado.estado === "ok") {
        await ctx.db.patch(entrega._id, { estado: "CONFIRMADA", consultarReciboEn: undefined, actualizadoEn: Date.now() });
        const notificacion = await ctx.db.get(entrega.notificacionId);
        if (notificacion && notificacion.enviadaEn === undefined) {
          await ctx.db.patch(notificacion._id, { enviadaEn: Date.now() });
        }
      } else if (resultado.estado === "error") {
        if (resultado.error === "DeviceNotRegistered") await desactivarDispositivo(ctx, entrega);
        await fallarEntrega(ctx, entrega, resultado.error ?? "ERROR_RECIBO", resultado.reintentable);
      } else if (resultado.consulta >= MAX_CONSULTAS_RECIBO) {
        // Expo pudo haberlo entregado: no reenviar a ciegas al agotar las consultas.
        await ctx.db.patch(entrega._id, {
          estado: "FALLIDA", error: "RECIBO_NO_DISPONIBLE", consultasRecibo: resultado.consulta,
          consultarReciboEn: undefined, actualizadoEn: Date.now(),
        });
      } else {
        await ctx.db.patch(entrega._id, {
          consultasRecibo: resultado.consulta, consultarReciboEn: Date.now() + ESPERA_RECIBO,
          actualizadoEn: Date.now(),
        });
        pendientes.add(entrega.notificacionId);
      }
    }
    for (const notificacionId of pendientes) {
      await ctx.scheduler.runAfter(ESPERA_RECIBO, internal.push.consultarRecibos, { notificacionId });
    }
  },
});

type Objeto = Record<string, unknown>;
const objeto = (valor: unknown): Objeto | undefined =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor) ? valor as Objeto : undefined;
function errorExpo(valor: unknown): string {
  const detalles = objeto(objeto(valor)?.details);
  return typeof detalles?.error === "string" ? detalles.error : "ERROR_EXPO";
}
const reintentable = (error: string) => ["MessageRateExceeded", "ExpoServerError", "ServiceUnavailable"].includes(error);

/** Valida la respuesta externa como unknown, también para respuestas HTTP 200 malformadas. */
async function pedirExpo(url: string, cuerpo: unknown): Promise<{ data?: unknown; error?: string; temporal: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const respuesta = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(cuerpo), signal: controller.signal,
    });
    if (!respuesta.ok) return { error: `HTTP_${respuesta.status}`, temporal: respuesta.status === 429 || respuesta.status >= 500 };
    const contenido: unknown = await respuesta.json();
    const data = objeto(contenido)?.data;
    return { data, temporal: true };
  } catch {
    return { error: "RED_O_RESPUESTA_INVALIDA", temporal: true };
  } finally {
    clearTimeout(timeout);
  }
}

/** Enviar entrega tickets de aceptación; solo un receipt confirma FCM/APNs. */
export const enviar = internalAction({
  args: { notificacionId: v.id("notificacion") },
  handler: async (ctx, args): Promise<{ aceptados: number; muertos: number }> => {
    const datos = await ctx.runMutation(internal.push.prepararEnvios, args);
    if (!datos) return { aceptados: 0, muertos: 0 };
    const urgente = esUrgente(datos.tipo);
    const aviso = datos.simulacro ? "[SIMULACRO] Alerta de práctica — abre Cresco" : AVISO[datos.tipo];
    let aceptados = 0;
    let muertos = 0;
    for (let desde = 0; desde < datos.entregas.length; desde += MAXIMO_POR_PETICION) {
      const tanda = datos.entregas.slice(desde, desde + MAXIMO_POR_PETICION);
      const respuesta = await pedirExpo(EXPO_PUSH_URL, tanda.map(entrega => ({
        to: entrega.tokenPush, title: "Cresco", body: aviso,
        data: { notificacionId: args.notificacionId },
        sound: urgente ? "default" : null, priority: urgente ? "high" : "normal",
      })));
      const tickets = Array.isArray(respuesta.data) ? respuesta.data : [];
      const resultados = tanda.map((entrega, i) => {
        const ticket = objeto(tickets[i]);
        const ticketId = ticket?.status === "ok" && typeof ticket.id === "string" && ticket.id ? ticket.id : undefined;
        const error = ticketId ? undefined : respuesta.error ?? (ticket?.status === "error" ? errorExpo(ticket) : "RESPUESTA_INVALIDA");
        if (ticketId) aceptados++;
        if (error === "DeviceNotRegistered") muertos++;
        return {
          entregaId: entrega.id, intento: entrega.intento, ticketId, error,
          reintentable: respuesta.error ? respuesta.temporal : error === "RESPUESTA_INVALIDA" || reintentable(error ?? ""),
        };
      });
      await ctx.runMutation(internal.push.registrarTickets, { resultados });
    }
    return { aceptados, muertos };
  },
});

/** Consulta receipts sin volver a enviar los mensajes que Expo ya aceptó. */
export const consultarRecibos = internalAction({
  args: { notificacionId: v.id("notificacion") },
  handler: async (ctx, args): Promise<void> => {
    const pendientes = (await ctx.runQuery(internal.push.recibosPendientes, args))
      .filter(e => e.ticketId && (e.consultarReciboEn ?? 0) <= Date.now());
    for (let desde = 0; desde < pendientes.length; desde += MAXIMO_POR_PETICION) {
      const tanda = pendientes.slice(desde, desde + MAXIMO_POR_PETICION);
      const respuesta = await pedirExpo(EXPO_RECEIPTS_URL, { ids: tanda.map(e => e.ticketId!) });
      const recibos = objeto(respuesta.data);
      const resultados = tanda.map(entrega => {
        const recibo = objeto(recibos?.[entrega.ticketId!]);
        const estado = recibo?.status === "ok" ? "ok" as const : recibo?.status === "error" ? "error" as const : "pendiente" as const;
        const error = estado === "error" ? errorExpo(recibo) : respuesta.error;
        return { entregaId: entrega._id, ticketId: entrega.ticketId!, consulta: entrega.consultasRecibo + 1,
          estado, error, reintentable: reintentable(error ?? "") };
      });
      await ctx.runMutation(internal.push.registrarRecibos, { resultados });
    }
  },
});
