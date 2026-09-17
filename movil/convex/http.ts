/**
 * Rutas HTTP de Convex. Dueño: Persona C.
 *
 * Por ahora solo el webhook de RevenueCat. Todo lo demás son `query` y
 * `mutation` que el cliente llama con el SDK tipado — no hacen falta rutas.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { autenticarPeticion, leerEvento, sanearParaConvex } from "./lib/revenuecat";

/**
 * POST /webhooks/revenuecat
 *
 * Contrato original (`api/openapi.yaml`, archivado en docs/99-archivo/):
 *   200 → procesado (o ya procesado antes)
 *   401 → firma inválida
 *
 * ── Por qué casi todo responde 200 ─────────────────────────────────────────
 * RevenueCat reintenta hasta 5 veces (5, 10, 20, 40 y 80 minutos) ante
 * cualquier respuesta que no sea 2xx, y después se rinde y **pierde el
 * evento**. Un evento que no sabemos procesar no mejora por reintentarlo: hay
 * que guardarlo con su error y responder 200, para poder revisarlo a mano en
 * vez de que desaparezca.
 *
 * El 401 es la única excepción y es correcto: si la firma no valida, no
 * queremos ese evento en absoluto.
 */
const webhookRevenuecat = httpAction(async (ctx, request) => {
  /**
   * El cuerpo **crudo**, antes de parsear nada. Si se hiciera `request.json()`
   * y luego se re-serializara para verificar el HMAC, los bytes cambiarían y
   * toda firma legítima fallaría. Hay una prueba que fija este comportamiento.
   */
  const cuerpoCrudo = await request.text();

  const auth = await autenticarPeticion({
    cuerpoCrudo,
    cabeceraAuth: request.headers.get("authorization"),
    cabeceraFirma: request.headers.get("x-revenuecat-webhook-signature"),
    secreto: process.env.REVENUECAT_WEBHOOK_SECRET ?? "",
  });

  if (!auth.ok) {
    // A propósito no se devuelve el motivo: quien no autentica no merece
    // pistas sobre por qué falló. El detalle queda en el log de Convex.
    console.warn("[revenuecat] petición rechazada:", auth.motivo);
    return new Response(JSON.stringify({ codigo: "FIRMA_INVALIDA" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(cuerpoCrudo);
  } catch {
    return new Response(JSON.stringify({ codigo: "JSON_INVALIDO" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const lectura = leerEvento(cuerpo);
  if (!lectura.ok) {
    /**
     * Autenticado pero ilegible. No se guarda porque sin `id` no hay clave de
     * idempotencia, y sin ella un reintento sí duplicaría.
     */
    console.error("[revenuecat] evento ilegible:", lectura.motivo);
    return new Response(JSON.stringify({ codigo: "EVENTO_ILEGIBLE" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const resultado = await ctx.runMutation(internal.suscripciones.procesarEvento, {
    eventoIdExterno: lectura.evento.id,
    tipoEvento: lectura.evento.type,
    appUserId: lectura.evento.app_user_id,
    // Saneado **aqui**, antes de cruzar la frontera de la mutation: Convex
    // valida el valor al pasarlo como argumento, asi que un `$displayName` de
    // RevenueCat revienta antes incluso de llegar al insert.
    payload: sanearParaConvex(cuerpo),
  });

  return new Response(JSON.stringify(resultado), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

const http = httpRouter();

http.route({
  path: "/webhooks/revenuecat",
  method: "POST",
  handler: webhookRevenuecat,
});

export default http;
