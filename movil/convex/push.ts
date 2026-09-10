/**
 * Entrega de notificaciones al teléfono, por Expo Push. Dueño: Persona C.
 *
 * `interaccion.notificar()` crea la notificación en bandeja; esto es el último
 * tramo, que la lleva al teléfono. Se separó en su propio archivo porque es lo
 * único del proyecto que habla con un servicio externo desde una `action`.
 *
 * ── El push NO lleva el contenido, y eso es a propósito ─────────────────────
 *
 * El aviso de privacidad `2026-09-v1` declara, en su tabla de terceros, que
 * Expo recibe **«el identificador del dispositivo»** — nada más. Si el push
 * viajara con el título y el cuerpo reales, Expo (y Google, y la pantalla
 * bloqueada del teléfono) recibirían el nombre de un menor y el detalle de su
 * conducta, y ese documento pasaría a ser falso. Corregirlo obligaría a subir
 * la versión y a **volver a pedir el consentimiento** a cada representante,
 * porque la sección 11 lo promete así.
 *
 * Así que el push lleva un aviso genérico por tipo y el `_id` de la
 * notificación en `data`. La app abre, lee la bandeja desde Convex —con sus
 * permisos— y muestra el contenido real. Cuesta un salto; mantiene el
 * documento cierto y los datos del menor fuera de un tercero.
 *
 * Una consecuencia deliberada: `ACCION_POSITIVA` y `ACCION_NEGATIVA` mandan el
 * **mismo** texto. Distinguirlas en la pantalla bloqueada ya diría algo sobre
 * el niño a cualquiera que mire el teléfono de reojo.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
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

// ---------------------------------------------------------------------------
// Piezas internas. Una `action` no puede tocar `ctx.db`: lee y escribe por aquí.
// ---------------------------------------------------------------------------

export const datosDelEnvio = internalQuery({
  args: { notificacionId: v.id("notificacion") },
  handler: async (ctx, args) => {
    const notificacion = await ctx.db.get(args.notificacionId);
    if (notificacion === null) return null;

    const dispositivos = await ctx.db
      .query("dispositivo")
      .withIndex("por_usuario", (q) =>
        q.eq("perfilUsuarioId", notificacion.perfilUsuarioId).eq("activo", true),
      )
      .collect();

    return {
      tipo: notificacion.tipo,
      yaEnviada: notificacion.enviadaEn !== undefined,
      dispositivos: dispositivos.map((d) => ({ id: d._id, tokenPush: d.tokenPush })),
    };
  },
});

export const registrarEnvio = internalMutation({
  args: {
    notificacionId: v.id("notificacion"),
    entregada: v.boolean(),
    dispositivosMuertos: v.array(v.id("dispositivo")),
  },
  handler: async (ctx, args) => {
    // Un token que Expo declara muerto no revive reintentando: el usuario
    // desinstaló la app o reinstaló y tiene otro. Se apaga para no seguir
    // pagando peticiones por él en cada notificación futura.
    for (const dispositivoId of args.dispositivosMuertos) {
      const dispositivo = await ctx.db.get(dispositivoId);
      if (dispositivo !== null && dispositivo.activo) {
        await ctx.db.patch(dispositivoId, { activo: false, actualizadoEn: Date.now() });
      }
    }

    if (args.entregada) {
      const notificacion = await ctx.db.get(args.notificacionId);
      // `enviadaEn` solo se escribe una vez: marca la primera entrega, no la
      // última, y es lo que hace idempotente reintentar.
      if (notificacion !== null && notificacion.enviadaEn === undefined) {
        await ctx.db.patch(args.notificacionId, { enviadaEn: Date.now() });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// El envío
// ---------------------------------------------------------------------------

type RespuestaExpo = {
  data?: { status: string; message?: string; details?: { error?: string } }[];
};

/**
 * Entrega una notificación de bandeja a los teléfonos activos de su dueño.
 *
 * La programa `interaccion.notificar()` con `scheduler.runAfter(0, ...)`, no la
 * llama directamente: si esto fallara dentro de la transacción, se revertiría
 * **la notificación misma**. La bandeja tiene que sobrevivir aunque el push no
 * salga; al revés no sirve de nada.
 */
export const enviar = internalAction({
  args: { notificacionId: v.id("notificacion") },
  handler: async (ctx, args): Promise<{ enviados: number; muertos: number }> => {
    const datos = await ctx.runQuery(internal.push.datosDelEnvio, {
      notificacionId: args.notificacionId,
    });
    if (datos === null || datos.yaEnviada) return { enviados: 0, muertos: 0 };

    const validos = datos.dispositivos.filter((d) => TOKEN_VALIDO.test(d.tokenPush));
    if (validos.length === 0) return { enviados: 0, muertos: 0 };

    const aviso = AVISO[datos.tipo];
    const urgente = esUrgente(datos.tipo);
    const dispositivosMuertos: Id<"dispositivo">[] = [];
    let enviados = 0;

    for (let desde = 0; desde < validos.length; desde += MAXIMO_POR_PETICION) {
      const tanda = validos.slice(desde, desde + MAXIMO_POR_PETICION);
      const mensajes = tanda.map((dispositivo) => ({
        to: dispositivo.tokenPush,
        title: "Cresco",
        body: aviso,
        // Lo único que identifica de qué se trata. La app lo usa para abrir la
        // notificación correcta y leer su contenido real desde Convex.
        data: { notificacionId: args.notificacionId },
        sound: urgente ? "default" : null,
        priority: urgente ? "high" : "normal",
      }));

      let respuesta: RespuestaExpo;
      try {
        const peticion = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(mensajes),
        });
        if (!peticion.ok) {
          // Un 5xx de Expo no es culpa del token. Se abandona esta tanda sin
          // apagar nada: la notificación sigue en bandeja, que es el canal que
          // de verdad importa.
          console.warn("[push] Expo respondió", peticion.status);
          continue;
        }
        respuesta = (await peticion.json()) as RespuestaExpo;
      } catch (error) {
        console.warn("[push] no se pudo contactar a Expo:", error);
        continue;
      }

      const resultados = respuesta.data ?? [];
      resultados.forEach((resultado, i) => {
        const dispositivo = tanda[i];
        if (dispositivo === undefined) return;
        if (resultado.status === "ok") {
          enviados++;
          return;
        }
        if (resultado.details?.error === "DeviceNotRegistered") {
          dispositivosMuertos.push(dispositivo.id);
          return;
        }
        console.warn("[push] rechazo de Expo:", resultado.details?.error ?? resultado.message);
      });
    }

    await ctx.runMutation(internal.push.registrarEnvio, {
      notificacionId: args.notificacionId,
      entregada: enviados > 0,
      dispositivosMuertos,
    });
    return { enviados, muertos: dispositivosMuertos.length };
  },
});
